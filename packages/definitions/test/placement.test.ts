import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { createMechanicsScheduler, eventPriority } from '../src/mechanics/scheduler.js';
import { createModelRuntime, type MechanicalModel } from '../src/mechanics/model.js';
import {
  areaContainsFootprint,
  createdAreaSchema,
  createPlacementRuntime,
  footprintsOverlap,
  type CreatedArea,
  type PlacementProfile,
  type PlacementRequest
} from '../src/mechanics/placement.js';

const profile = (changes: Partial<PlacementProfile> = {}): PlacementProfile => ({
  footprint: { kind: 'circle', radius: 2 },
  areaTypes: ['ground'],
  category: 'device',
  size: 'small',
  blocksPlacement: true,
  ignoreOverlap: false,
  ...changes
});
const area = (changes: Partial<CreatedArea> = {}): CreatedArea => ({
  id: 'ground',
  shape: {
    kind: 'convex-polygon',
    points: [
      { x: -20, y: -20 },
      { x: 20, y: -20 },
      { x: 20, y: 20 },
      { x: -20, y: 20 }
    ]
  },
  areaType: 'ground',
  allowedCategories: [],
  allowedSizes: [],
  excludedModelIds: [],
  onOwnerRemoved: 'remove',
  onAreaChanged: 'remove',
  ...changes
});
const request = (id: string, changes: Partial<PlacementRequest> = {}): PlacementRequest => ({
  id,
  modelId: 'synthetic-unit',
  profile: profile(),
  position: { x: 0, y: 0 },
  supportAreaId: 'ground',
  ...changes
});

describe('shared placement and created areas', () => {
  it('checks circle, rectangle and mixed footprint overlap with legal tangency', () => {
    const origin = { x: 0, y: 0 };
    const circle = { kind: 'circle' as const, radius: 2 };
    const rectangle = { kind: 'rectangle' as const, width: 6, height: 4 };
    expect(footprintsOverlap(circle, origin, circle, { x: 4, y: 0 })).toBe(false);
    expect(footprintsOverlap(circle, origin, circle, { x: 3.999, y: 0 })).toBe(true);
    expect(footprintsOverlap(rectangle, origin, rectangle, { x: 6, y: 0 })).toBe(false);
    expect(footprintsOverlap(rectangle, origin, rectangle, { x: 5, y: 3 })).toBe(true);
    expect(footprintsOverlap(circle, { x: 5, y: 0 }, rectangle, origin)).toBe(false);
    expect(footprintsOverlap(circle, { x: 4, y: 3 }, rectangle, origin)).toBe(true);
    expect(footprintsOverlap(rectangle, origin, circle, { x: 4, y: 3 })).toBe(true);
    expect(footprintsOverlap(circle, { x: 5, y: 4 }, rectangle, origin)).toBe(false);
  });

  it('requires full footprint containment in translated convex polygons and circles', () => {
    const polygon = area();
    expect(
      areaContainsFootprint(
        polygon,
        { x: 100, y: 0 },
        { kind: 'circle', radius: 2 },
        { x: 118, y: 0 }
      )
    ).toBe(true);
    expect(
      areaContainsFootprint(
        polygon,
        { x: 100, y: 0 },
        { kind: 'circle', radius: 2 },
        { x: 118.01, y: 0 }
      )
    ).toBe(false);
    expect(
      areaContainsFootprint(
        polygon,
        { x: 0, y: 0 },
        { kind: 'rectangle', width: 6, height: 4 },
        { x: 18, y: 0 }
      )
    ).toBe(false);
    const round = area({ shape: { kind: 'circle', radius: 5 } });
    expect(
      areaContainsFootprint(
        round,
        { x: 0, y: 0 },
        { kind: 'rectangle', width: 6, height: 8 },
        { x: 0, y: 0 }
      )
    ).toBe(true);
    expect(
      areaContainsFootprint(
        round,
        { x: 0, y: 0 },
        { kind: 'rectangle', width: 6.01, height: 8 },
        { x: 0, y: 0 }
      )
    ).toBe(false);
    expect(
      areaContainsFootprint(round, { x: 0, y: 0 }, { kind: 'circle', radius: 2 }, { x: 3, y: 0 })
    ).toBe(true);
    const closedReverse = area({
      shape: {
        kind: 'convex-polygon',
        points: [
          { x: -20, y: -20 },
          { x: -20, y: 20 },
          { x: 20, y: 20 },
          { x: 20, y: -20 },
          { x: -20, y: -20 }
        ]
      }
    });
    expect(
      areaContainsFootprint(closedReverse, { x: 0, y: 0 }, profile().footprint, { x: 0, y: 0 })
    ).toBe(true);
  });

  it('keeps area type, category, size and excluded model filters independent', () => {
    const runtime = createPlacementRuntime();
    runtime.addArea(
      area({
        allowedCategories: ['device'],
        allowedSizes: ['small'],
        excludedModelIds: ['excluded']
      }),
      { x: 0, y: 0 }
    );
    expect(runtime.check(request('good'))).toEqual({ ok: true });
    for (const [changes, reason] of [
      [{ profile: profile({ areaTypes: ['water'] }) }, 'area-type'],
      [{ profile: profile({ category: 'pet' }) }, 'category'],
      [{ profile: profile({ size: 'large' }) }, 'size'],
      [{ modelId: 'excluded' }, 'excluded-model'],
      [{ supportAreaId: 'missing' }, 'missing-area']
    ] as const)
      expect(runtime.check(request('bad', changes))).toEqual({ ok: false, reason });
  });

  it('uses only the selected support area and preserves directional overlap flags', () => {
    const runtime = createPlacementRuntime();
    runtime.addArea(area(), { x: 0, y: 0 });
    runtime.addArea(area({ id: 'water', areaType: 'water' }), { x: 0, y: 0 });
    expect(
      runtime.place(request('first', { profile: profile({ blocksPlacement: false }) })).ok
    ).toBe(true);
    expect(runtime.place(request('second')).ok).toBe(true);
    expect(runtime.check(request('third'))).toEqual({
      ok: false,
      reason: 'overlap',
      blockerId: 'second'
    });
    expect(runtime.place(request('third', { profile: profile({ ignoreOverlap: true }) })).ok).toBe(
      true
    );
    expect(
      runtime.check(
        request('wet', { supportAreaId: 'water', profile: profile({ ignoreOverlap: true }) })
      )
    ).toEqual({ ok: false, reason: 'area-type' });
    expect(runtime.check(request('second'))).toEqual({ ok: false, reason: 'duplicate-actor' });
  });

  it('removes dependent actors and their owned areas before notifying the host', () => {
    const removed: string[] = [];
    const runtime = createPlacementRuntime({
      onRemove(actor) {
        expect(runtime.snapshot().actors).toEqual([]);
        expect(runtime.snapshot().areas.map((a) => a.profile.id)).toEqual(['ground']);
        removed.push(actor.id);
      }
    });
    runtime.addArea(area(), { x: 0, y: 0 });
    expect(runtime.place(request('owner')).ok).toBe(true);
    runtime.addArea(area({ id: 'platform' }), { x: 0, y: 0 }, 'owner');
    expect(
      runtime.place(request('dependent', { supportAreaId: 'platform', position: { x: 6, y: 0 } }))
        .ok
    ).toBe(true);
    runtime.addArea(area({ id: 'upper' }), { x: 0, y: 0 }, 'dependent');
    expect(
      runtime.place(request('nested', { supportAreaId: 'upper', position: { x: 12, y: 0 } })).ok
    ).toBe(true);
    expect(runtime.removeActor('owner')).toBe(true);
    expect(removed).toEqual(['nested', 'dependent', 'owner']);
    expect(runtime.removeActor('owner')).toBe(false);
  });

  it('treats owner removal and area changes separately and detaches retained dependents', () => {
    const runtime = createPlacementRuntime();
    runtime.addArea(area(), { x: 0, y: 0 });
    runtime.place(request('owner'));
    runtime.addArea(
      area({ id: 'platform', onOwnerRemoved: 'retain', onAreaChanged: 'remove' }),
      { x: 0, y: 0 },
      'owner'
    );
    runtime.place(request('survivor', { supportAreaId: 'platform', position: { x: 6, y: 0 } }));
    runtime.removeActor('owner');
    expect(runtime.snapshot().actors.map((a) => [a.id, a.supportAreaId])).toEqual([
      ['survivor', null]
    ]);
    runtime.addArea(area({ id: 'changing', onOwnerRemoved: 'retain', onAreaChanged: 'remove' }), {
      x: 0,
      y: 0
    });
    runtime.place(request('removed', { supportAreaId: 'changing', position: { x: -6, y: 0 } }));
    runtime.removeArea('changing', 'area-changed');
    expect(runtime.snapshot().actors.map((a) => a.id)).toEqual(['survivor']);
  });

  it('stops actual model attacks through area-loss callbacks while retained actors keep firing', () => {
    const run = (policy: 'retain' | 'remove') => {
      const clock = createMechanicsScheduler();
      const times: number[] = [];
      const model: MechanicalModel = {
        attacks: [
          {
            id: 'attack',
            damage: 1,
            shape: { kind: 'single' },
            range: 10,
            detectConcealed: true,
            delivery: 'direct-contact',
            intervalSeconds: 1,
            projectiles: 1
          }
        ],
        actors: [],
        passiveSummons: [],
        income: [],
        rangeSupport: []
      };
      const host = createModelRuntime(clock, model, {
        id: 'actor',
        origin: { x: 0, y: 0 },
        onAttack() {
          times.push(clock.now);
        },
        onEvent() {}
      });
      const runtime = createPlacementRuntime({
        onRemove() {
          host.stop();
        }
      });
      runtime.addArea(area({ onAreaChanged: policy }), { x: 0, y: 0 });
      expect(runtime.place(request('actor')).ok).toBe(true);
      host.start();
      clock.schedule(0.5, eventPriority.expire, () => runtime.removeArea('ground'));
      clock.advance(3);
      return times;
    };
    expect(run('remove')).toEqual([0]);
    expect(run('retain')).toEqual([0, 1, 2]);
  });

  it('freezes input and returned snapshots and rejects unsupported polygon geometry', () => {
    const runtime = createPlacementRuntime();
    const terrain = area();
    const candidate = request('actor');
    runtime.addArea(terrain, { x: 0, y: 0 });
    terrain.excludedModelIds.push(candidate.modelId);
    expect(runtime.place(candidate).ok).toBe(true);
    candidate.position.x = 100;
    const snapshot = runtime.snapshot();
    snapshot.actors[0]!.position.x = 200;
    expect(runtime.snapshot().actors[0]!.position.x).toBe(0);
    expect(Value.Check(createdAreaSchema, { ...area(), unknown: true })).toBe(false);
    expect(() =>
      runtime.addArea(
        area({
          id: 'bad',
          shape: {
            kind: 'convex-polygon',
            points: [
              { x: 0, y: 0 },
              { x: 3, y: 0 },
              { x: 1, y: 1 },
              { x: 3, y: 3 },
              { x: 0, y: 3 }
            ]
          }
        }),
        { x: 0, y: 0 }
      )
    ).toThrow('convex polygon');
    expect(() => runtime.addArea(area({ id: 'orphan' }), { x: 0, y: 0 }, 'missing')).toThrow(
      'owner'
    );
  });
});

// Private scalar mutation proofs use an explicitly declared XY projection and normalized policies.
// They do not qualify native area enums, Z collision, track checks, overlay precedence or sale flags.
const circleSource = process.env.BTD6_PLACEMENT_FOOTPRINT_FILE;
it.skipIf(!circleSource)('changes legality when a captured footprint radius changes', () => {
  const source = JSON.parse(readFileSync(circleSource!, 'utf8')) as {
    footprint: { radius: number };
  };
  const radius = source.footprint.radius;
  expect(radius).toBeGreaterThan(0);
  const runtime = createPlacementRuntime();
  runtime.addArea(area({ shape: { kind: 'circle', radius: radius * 20 } }), { x: 0, y: 0 });
  runtime.place(request('anchor', { profile: profile({ footprint: { kind: 'circle', radius } }) }));
  const candidate = request('candidate', {
    profile: profile({ footprint: { kind: 'circle', radius } }),
    position: { x: radius * 2.5, y: 0 }
  });
  expect(runtime.check(candidate)).toEqual({ ok: true });
  candidate.profile.footprint = { kind: 'circle', radius: radius * 2 };
  expect(runtime.check(candidate)).toMatchObject({ ok: false, reason: 'overlap' });
});
const areaSource = process.env.BTD6_PLACEMENT_AREA_FILE;
it.skipIf(!areaSource)('executes captured polygon coordinates and exclusion mutations', () => {
  const source = JSON.parse(readFileSync(areaSource!, 'utf8')) as {
    behaviors: {
      $type: string;
      points?: { x: number; y: number; z: number }[];
      filterInTowerSizes?: string[];
      filterInTowerSets?: string[];
      filterOutSpecificTowers?: string[];
    }[];
  };
  const node = source.behaviors.find((b) => b.$type.includes('.AddMakeshiftAreaModel,'))!;
  expect(node).toBeDefined();
  const captured = area({
    shape: { kind: 'convex-polygon', points: node.points!.map(({ x, y }) => ({ x, y })) },
    allowedSizes: node.filterInTowerSizes!,
    allowedCategories: node.filterInTowerSets!,
    excludedModelIds: node.filterOutSpecificTowers!
  });
  const runtime = createPlacementRuntime();
  runtime.addArea(captured, { x: 0, y: 0 });
  const candidate = request('candidate', {
    profile: profile({ size: captured.allowedSizes[0]! }),
    modelId: captured.excludedModelIds[0]!,
    // Captured platforms can be offset from their owner. Probe inside the supplied polygon.
    position: {
      x: node.points!.reduce((sum, point) => sum + point.x, 0) / node.points!.length,
      y: node.points!.reduce((sum, point) => sum + point.y, 0) / node.points!.length
    }
  });
  expect(runtime.check(candidate)).toEqual({ ok: false, reason: 'excluded-model' });
  const mutated = createPlacementRuntime();
  mutated.addArea({ ...captured, excludedModelIds: [] }, { x: 0, y: 0 });
  expect(mutated.check(candidate)).toEqual({ ok: true });
  expect(mutated.check({ ...candidate, position: { x: 1e6, y: 1e6 } })).toEqual({
    ok: false,
    reason: 'outside-area'
  });
});
