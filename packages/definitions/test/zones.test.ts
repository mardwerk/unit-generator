import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { applyDamage, type CombatTarget } from '../src/mechanics/combat.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import { createStatusRuntime, type StatusEffect } from '../src/mechanics/status.js';
import {
  createZoneRuntime,
  zoneContains,
  zoneProfileSchema,
  type ZoneProfile
} from '../src/mechanics/zones.js';

const zone = (overrides: Partial<ZoneProfile> = {}): ZoneProfile => ({
  id: 'synthetic-zone',
  radius: 10,
  innerRadius: 0,
  includeInner: true,
  includeOuter: false,
  intervalSeconds: 1,
  initialDelaySeconds: 0,
  triggerImmediate: true,
  damage: 3,
  detectConcealed: false,
  immuneTo: [],
  throughWalls: true,
  ...overrides
});
const target = (id = 'target', x = 0, y = 0): CombatTarget => ({ id, x, y, health: 100 });
const slow = (overrides: Partial<Extract<StatusEffect, { kind: 'slow' }>> = {}): StatusEffect => ({
  id: 'synthetic-slow',
  kind: 'slow',
  speedMultiplier: 0.5,
  durationSeconds: 2,
  immuneTo: [],
  stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 },
  combine: 'strongest',
  ...overrides
});

describe('shared persistent damage zones', () => {
  it('makes each radial boundary explicit without double hits in adjacent bands', () => {
    const profiles = [
      zone({ radius: 4 }),
      zone({ innerRadius: 4, radius: 8 }),
      zone({ innerRadius: 8, radius: null })
    ];
    for (const x of [0, 4 - 1e-10, 4, 4 + 1e-10, 8, 1e8])
      expect(profiles.filter((p) => zoneContains(p, { x: 0, y: 0 }, { x, y: 0 }))).toHaveLength(1);
    expect(
      zoneContains(
        zone({ innerRadius: 4, includeInner: false, includeOuter: true }),
        { x: 0, y: 0 },
        { x: 4, y: 0 }
      )
    ).toBe(false);
    expect(zoneContains(zone({ includeOuter: true }), { x: 0, y: 0 }, { x: 6, y: 8 })).toBe(true);
    const clock = createMechanicsScheduler();
    const targets = [target('near', 0), target('middle', 4), target('far', 8)];
    const runtime = createZoneRuntime(clock, targets);
    profiles.forEach((profile) => runtime.place(profile, 'owner', { x: 0, y: 0 }));
    clock.advance(0, true);
    expect(targets.map((t) => t.health)).toEqual([97, 97, 97]);
  });

  it('uses initial delay, immediate policy and exclusive lifetime on one clock', () => {
    const clock = createMechanicsScheduler();
    const victim = target();
    const times: number[] = [];
    const runtime = createZoneRuntime(clock, [victim], {
      onDamage: (event) => times.push(event.at)
    });
    const actor = runtime.place(
      zone({ initialDelaySeconds: 0.25, triggerImmediate: false, durationSeconds: 3.25 }),
      'owner',
      { x: 0, y: 0 }
    );
    clock.advance(1.24, true);
    expect(times).toEqual([]);
    clock.advance(3.25, true);
    expect(times).toEqual([1.25, 2.25]);
    expect(victim.health).toBe(94);
    expect(actor.alive).toBe(false);
    expect(runtime.snapshot()).toEqual([]);
    expect(clock.nextTime).toBeNull();
  });

  it('freezes placement offsets and profiles, and cancels all future node work', () => {
    const clock = createMechanicsScheduler();
    const victim = target('target', 12);
    const runtime = createZoneRuntime(clock, [victim]);
    const profile = zone({ center: { x: 2, y: 0 }, radius: 1 });
    const origin = { x: 10, y: 0 };
    const first = runtime.place(profile, 'first', origin);
    const second = runtime.place(profile, 'second', origin);
    profile.damage = 80;
    origin.x = 100;
    clock.advance(0, true);
    expect(victim.health).toBe(94);
    expect(runtime.snapshot()[0]?.center).toEqual({ x: 12, y: 0 });
    expect(first.remove()).toBe(true);
    expect(first.remove()).toBe(false);
    runtime.clear('second');
    clock.advance(10, true);
    expect(victim.health).toBe(94);
    expect(second.alive).toBe(false);
    expect(clock.nextTime).toBeNull();
  });

  it('samples live positions, newly added targets, visibility, walls and source eligibility', () => {
    const clock = createMechanicsScheduler();
    let targets = [
      target('moving', 12),
      { ...target('hidden'), concealed: true },
      target('blocked', 4),
      target('excluded')
    ];
    const runtime = createZoneRuntime(clock, () => targets, {
      obstacles: [{ x1: 2, y1: -10, x2: 2, y2: 10 }],
      eligible: (victim) => victim.id !== 'excluded'
    });
    runtime.place(zone({ throughWalls: false }), 'owner', { x: 0, y: 0 });
    clock.advance(0, true);
    expect(targets.map((t) => t.health)).toEqual([100, 100, 100, 100]);
    targets[0]!.x = 1;
    targets = [...targets, target('new', 1)];
    clock.advance(1, true);
    expect(targets.map((t) => t.health)).toEqual([97, 100, 100, 100, 97]);
    targets[0]!.x = 12;
    clock.advance(2, true);
    expect(targets.map((t) => t.health)).toEqual([97, 100, 100, 100, 94]);
  });

  it('uses shared damage modifiers and status application while keeping immunity separate', () => {
    const clock = createMechanicsScheduler();
    const targets = [
      { ...target('armored'), armor: 0.5, damageTaken: { additive: 2, multiplier: 2 } },
      { ...target('immune'), tags: ['metal'], damageTaken: { additive: 10, multiplier: 2 } },
      { ...target('invulnerable'), invulnerable: true },
      { ...target('dead'), health: 0 }
    ];
    const statuses = createStatusRuntime(clock, targets);
    const runtime = createZoneRuntime(clock, targets, {
      onStatus(victim, effect, sourceId, damageApplied) {
        statuses.apply(sourceId, victim.id, effect, { damageApplied });
      }
    });
    const actor = runtime.place(
      zone({ damage: 4, immuneTo: ['metal'], statuses: [slow({ requiresDamage: true })] }),
      'owner',
      { x: 0, y: 0 }
    );
    clock.advance(0, true);
    expect(targets.map((t) => t.health)).toEqual([92, 100, 100, 0]);
    expect(statuses.snapshot('armored')[0]?.speedMultiplier).toBe(0.5);
    expect(statuses.snapshot('immune')[0]?.active).toEqual([]);
    actor.remove();
    clock.advance(1, true);
    expect(statuses.snapshot('armored')[0]?.speedMultiplier).toBe(0.5);
    clock.advance(2, true);
    expect(statuses.snapshot('armored')[0]?.active).toEqual([]);
  });

  it('stacks independent overlapping damage while shared status policy controls refresh', () => {
    const clock = createMechanicsScheduler();
    const victim = target();
    const statuses = createStatusRuntime(clock, [victim]);
    const runtime = createZoneRuntime(clock, [victim], {
      onStatus(t, effect, sourceId, damageApplied) {
        statuses.apply(sourceId, t.id, effect, { damageApplied });
      }
    });
    for (const source of ['first', 'second'])
      runtime.place(zone({ statuses: [slow()] }), source, { x: 0, y: 0 });
    clock.advance(1, true);
    expect(victim.health).toBe(88);
    expect(statuses.snapshot()[0]?.active).toHaveLength(1);
    expect(statuses.snapshot()[0]?.active[0]?.expiresAt).toBe(3);
    runtime.clear();
    clock.advance(3, true);
    expect(statuses.snapshot()[0]?.active).toEqual([]);
  });

  it('allows source damage policy to delegate tag bonuses to shared combat', () => {
    const clock = createMechanicsScheduler();
    const victim = { ...target(), tags: ['large'], armor: 0.5 };
    const runtime = createZoneRuntime(clock, [victim], {
      damage(t, raw) {
        return applyDamage(t, raw + (t.tags?.includes('large') ? 5 : 0));
      }
    });
    runtime.place(zone(), 'owner', { x: 0, y: 0 });
    clock.advance(0, true);
    expect(victim.health).toBe(96);
  });

  it('cancels the pending hit when source eligibility removes the zone', () => {
    const clock = createMechanicsScheduler();
    const victim = target();
    const events: string[] = [];
    const runtime = createZoneRuntime(clock, [victim], {
      eligible() {
        runtime.clear('owner');
        return true;
      },
      onDamage() {
        events.push('damage');
      },
      onStatus() {
        events.push('status');
      },
      onEvent(event) {
        events.push(event.kind);
      }
    });
    runtime.place(zone({ statuses: [slow()] }), 'owner', { x: 0, y: 0 });
    clock.advance(10, true);
    expect(victim.health).toBe(100);
    expect(events).toEqual(['zone-place', 'zone-remove']);
    expect(clock.nextTime).toBeNull();
  });

  it('honors node cancellation inside a tick before subsequent targets or statuses', () => {
    const clock = createMechanicsScheduler();
    const targets = [target('a'), target('b')];
    let statusCalls = 0;
    const runtime = createZoneRuntime(clock, targets, {
      onDamage(event) {
        runtime.remove(event.id);
      },
      onStatus() {
        statusCalls++;
      }
    });
    runtime.place(zone({ statuses: [slow()] }), 'owner', { x: 0, y: 0 });
    clock.advance(10, true);
    expect(targets.map((t) => t.health)).toEqual([97, 100]);
    expect(statusCalls).toBe(0);
    expect(clock.nextTime).toBeNull();
  });

  it('rejects invalid profiles and requires executable status handling', () => {
    const runtime = createZoneRuntime(createMechanicsScheduler(), []);
    expect(Value.Check(zoneProfileSchema, zone())).toBe(true);
    expect(Value.Check(zoneProfileSchema, { ...zone(), extra: true })).toBe(false);
    for (const profile of [
      zone({ intervalSeconds: 0 }),
      zone({ innerRadius: 11 }),
      zone({ radius: -1 })
    ])
      expect(() => runtime.place(profile, 'owner', { x: 0, y: 0 })).toThrow('Invalid zone');
    expect(() => runtime.place(zone({ statuses: [slow()] }), 'owner', { x: 0, y: 0 })).toThrow(
      'shared status'
    );
  });
});

// Private proof executes captured scalar damage/cadence. The explicit global test placement
// makes no claim about native path coverage, distance-band selection or mutator replacement.
const sourceFile = process.env.BTD6_ZONE_REFERENCE_FILE;
it.skipIf(!sourceFile)('executes private captured zone damage and tick fields', () => {
  const source = JSON.parse(readFileSync(sourceFile!, 'utf8')) as {
    behaviors: Record<string, unknown>[];
  };
  const parent = source.behaviors.find((node) =>
    String(node.$type).includes('.SpiritOfTheForestModel,')
  );
  expect(parent).toBeDefined();
  for (const key of [
    'damageOverTimeZoneModelFar',
    'damageOverTimeZoneModelMiddle',
    'damageOverTimeZoneModelClose'
  ]) {
    const child = parent![key] as {
      behaviorModel: {
        damage: number;
        interval: number;
        initialDelay: number;
        triggerImmediate: boolean;
      };
    };
    const fields = child.behaviorModel;
    const clock = createMechanicsScheduler();
    const victim = target();
    const times: number[] = [];
    const runtime = createZoneRuntime(clock, [victim], {
      onDamage: (event) => times.push(event.at)
    });
    runtime.place(
      zone({
        radius: null,
        damage: fields.damage,
        intervalSeconds: fields.interval,
        initialDelaySeconds: fields.initialDelay,
        triggerImmediate: fields.triggerImmediate
      }),
      'captured',
      { x: 0, y: 0 }
    );
    const first = fields.initialDelay + (fields.triggerImmediate ? 0 : fields.interval);
    clock.advance(first + fields.interval * 2, true);
    expect(times).toEqual([first, first + fields.interval, first + fields.interval * 2]);
    expect(victim.health).toBe(100 - fields.damage * 3);
  }
});
