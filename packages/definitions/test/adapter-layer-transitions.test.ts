import { describe, expect, it } from 'vitest';
import {
  createMangaFixture,
  createMangaEncounter,
  type MangaTarget
} from '../src/manga-mayhem/index.js';
import {
  createBtd6FixtureV2,
  createBtd6EncounterV2,
  type Btd6TargetV2
} from '../src/btd6-derived/index.js';
import type { LayerProfile, LayerRegrowthPolicy } from '../src/mechanics/layers.js';
import type { StatusEffect } from '../src/mechanics/status.js';

const regrowth: LayerRegrowthPolicy = {
  ceilingProfileId: 'outer',
  clock: 'periodic',
  health: 'preserve-fraction'
};
const profiles: LayerProfile[] = [
  { id: 'outer', maximumHealth: 4, children: ['inner'], distributeDamageToChildren: true },
  {
    id: 'inner',
    maximumHealth: 2,
    children: [],
    distributeDamageToChildren: true,
    regrowth: { toProfileId: 'outer', intervalSeconds: 1 }
  }
];
type Target = MangaTarget & Btd6TargetV2;
const target = (id = 'parent', profileId = 'inner', health = 2): Target => ({
  id,
  x: 10,
  y: 0,
  health,
  progress: 1,
  strength: 1,
  layer: { profileId, regrowth }
});
interface SceneOptions {
  damage?: number;
  targets?: Target[];
  profiles?: LayerProfile[];
  statuses?: StatusEffect[];
  createTarget?: (profile: LayerProfile, parent: MangaTarget & Partial<Btd6TargetV2>) => Target;
  projectileSpeed?: number;
}
function mangaUnit(options: SceneOptions) {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, {
    damage: options.damage ?? 0,
    period: 120,
    windup: 0,
    reach: 20,
    shape: { kind: 'single' },
    onHit: options.statuses ?? []
  });
  if (options.projectileSpeed)
    Object.assign(unit.forms[0]!.primary, {
      delivery: 'projectile',
      projectileSpeed: options.projectileSpeed,
      projectileRadius: 0.1
    });
  return unit;
}
function layerOptions(options: SceneOptions) {
  let serial = 0;
  return {
    profiles: options.profiles ?? profiles,
    damagePolicy: { distribute: true, overrideBlocker: false, allocation: 'sequential' as const },
    createTarget:
      options.createTarget ??
      ((_profile: LayerProfile, parent: MangaTarget & Partial<Btd6TargetV2>): Target => ({
        ...parent,
        id: `child-${++serial}`,
        progress: 1,
        strength: 1
      }))
  };
}
function mangaScene(options: SceneOptions = {}) {
  return createMangaEncounter(mangaUnit(options), [0, 0, 0], options.targets ?? [target()], {
    layers: layerOptions(options)
  });
}
function towerScene(options: SceneOptions = {}) {
  const model = createBtd6FixtureV2().base!;
  model.abilities = [];
  model.attacks = [model.attacks[0]!];
  delete model.attacks[0]!.projectile;
  Object.assign(model.attacks[0]!, {
    damage: options.damage ?? 0,
    intervalSeconds: 120,
    delivery: 'contact',
    projectiles: 1,
    statuses: options.statuses ?? []
  });
  return createBtd6EncounterV2(
    {
      schemaVersion: 'btd6-derived.build/0.2',
      unitId: 'tower',
      tiers: [0, 0, 0],
      cost: 0,
      model,
      adaptations: [],
      unsupported: []
    },
    { targets: options.targets ?? [target()], layers: layerOptions(options) }
  );
}
const property = (propagate = true): StatusEffect => ({
  id: 'mark',
  kind: 'property',
  durationSeconds: 2,
  immuneTo: [],
  stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
  addTags: ['temporary', 'weak-willed'],
  removeTags: ['stunnable'],
  concealed: true,
  ...(propagate ? { propagation: { overrideDistributionBlocker: false } } : {})
});
for (const adapter of ['manga', 'tower'] as const) {
  describe(`${adapter} layer transition admission and callbacks`, () => {
    const scene = adapter === 'manga' ? mangaScene : towerScene;
    const advanceTo = (encounter: ReturnType<typeof scene>, at: number) => {
      const snapshot = encounter.snapshot();
      return encounter.advance('time' in snapshot ? at - snapshot.time : at);
    };
    it.each(['profile', 'health', 'ceiling', 'duplicate'] as const)(
      'rejects a bad %s after a valid replacement without changing state or pending growth',
      (invalid) => {
        const encounter = scene({ statuses: [property()] });
        advanceTo(encounter, 0.1);
        const before = encounter.snapshot();
        const bad = target('invalid');
        if (invalid === 'profile') bad.layer!.profileId = 'missing';
        if (invalid === 'health') bad.health = 3;
        if (invalid === 'ceiling')
          bad.layer!.regrowth = { ...regrowth, ceilingProfileId: 'missing' };
        if (invalid === 'duplicate') bad.id = 'valid';
        expect(() => encounter.replaceTarget('parent', [target('valid'), bad])).toThrow();
        expect(encounter.snapshot()).toEqual(before);
        const grown = advanceTo(encounter, 1.1);
        expect(grown.layers).toEqual([
          expect.objectContaining({ targetId: 'child-1', profileId: 'outer', health: 4 })
        ]);
        expect(grown.targets.map((t) => t.id)).toEqual(['parent', 'child-1']);
      }
    );
    it('commits a valid replacement batch and both independent growth clocks', () => {
      const encounter = scene();
      encounter.replaceTarget('parent', [target('left'), target('right')]);
      expect(encounter.snapshot().layers.map((t) => t.targetId)).toEqual(['left', 'right']);
      const grown = advanceTo(encounter, 1.1);
      expect(grown.layers.map((t) => [t.profileId, t.health])).toEqual([
        ['outer', 4],
        ['outer', 4]
      ]);
      expect(grown.targets.filter((t) => t.health > 0).map((t) => t.id)).toEqual([
        'child-1',
        'child-2'
      ]);
    });
    it('rejects a health update above the layer maximum before any target field changes', () => {
      const encounter = scene();
      advanceTo(encounter, 0.1);
      const before = encounter.snapshot();
      expect(() => encounter.updateTarget('parent', { health: 3, x: 11 })).toThrow(
        'Invalid layered target health'
      );
      expect(encounter.snapshot()).toEqual(before);
      expect(advanceTo(encounter, 1.1).layers).toEqual([
        expect.objectContaining({ profileId: 'outer', health: 4 })
      ]);
    });
    it.each(['occupied', 'coordinates', 'siblings'] as const)(
      'validates automatic replacement %s before retiring the parent layer or registering children',
      (invalid) => {
        const existing = { ...target('existing'), x: 10000, progress: 0, layer: undefined };
        const customProfiles = structuredClone(profiles);
        if (invalid === 'siblings') customProfiles[0]!.children = ['inner', 'inner'];
        const encounter = scene({
          damage: 4,
          profiles: customProfiles,
          targets: [target('parent', 'outer', 4), existing],
          createTarget: (_profile, parent) => ({
            ...parent,
            id: invalid === 'occupied' ? 'existing' : 'child',
            x: invalid === 'coordinates' ? NaN : parent.x,
            progress: 1,
            strength: 1
          })
        });
        expect(() => advanceTo(encounter, 0.1)).toThrow();
        const after = encounter.snapshot();
        expect(after.targets.map((t) => t.id)).toEqual(['parent', 'existing']);
        expect(after.layers).toEqual([
          expect.objectContaining({ targetId: 'parent', profileId: 'outer', health: 0 })
        ]);
        expect(after.targets[1]).toEqual(
          expect.objectContaining({ id: 'existing', health: 2, layer: undefined })
        );
      }
    );
    it.each([true, false])(
      'keeps base facts separate across regrowth with propagation %s',
      (propagate) => {
        const exposed: StatusEffect = {
          id: 'exposed',
          kind: 'damage-taken',
          durationSeconds: 2,
          immuneTo: [],
          stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
          additive: 2,
          multiplier: 2,
          combine: 'strongest',
          ...(propagate ? { propagation: { overrideDistributionBlocker: false } } : {})
        };
        const encounter = scene({
          targets: [{ ...target(), tags: ['permanent', 'stunnable'], concealed: false }],
          statuses: [property(propagate), exposed]
        });
        advanceTo(encounter, 0.1);
        const grown = advanceTo(encounter, 1.1);
        const child = grown.targets.find((t) => t.health > 0)!;
        expect(child.tags).toEqual(
          propagate ? ['permanent', 'temporary', 'weak-willed'] : ['permanent', 'stunnable']
        );
        expect(child.concealed).toBe(propagate);
        expect(child.damageTaken).toEqual(propagate ? { additive: 2, multiplier: 2 } : undefined);
        expect(
          grown.statuses.find((s) => s.targetId === child.id)!.active.map((e) => e.expiresAt)
        ).toEqual(propagate ? [2, 2] : []);
        const expired = advanceTo(encounter, 2.1);
        const surviving = expired.targets.find((t) => t.health > 0)!;
        expect(surviving.tags).toEqual(['permanent', 'stunnable']);
        expect(surviving.concealed).toBe(false);
        expect(surviving.damageTaken).toBeUndefined();
        expect(expired.statuses.find((s) => s.targetId === child.id)!.active).toEqual([]);
        if ('stunnable' in surviving) expect(surviving.stunnable).toBe(true);
      }
    );
    it('routes original overflow through a child consumed by a destruction payload', () => {
      const chain: LayerProfile[] = [
        { id: 'outer', maximumHealth: 4, children: ['inner'], distributeDamageToChildren: true },
        { id: 'inner', maximumHealth: 2, children: ['core'], distributeDamageToChildren: true },
        { id: 'core', maximumHealth: 5, children: [], distributeDamageToChildren: true }
      ];
      const burn: StatusEffect = {
        id: 'burn',
        kind: 'damage-over-time',
        durationSeconds: 3,
        immuneTo: [],
        stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
        damage: 5,
        intervalSeconds: 1,
        initialDelaySeconds: 0,
        triggerImmediate: false,
        tickOnExpiry: false,
        damageImmuneTo: [],
        refreshTicks: 'preserve',
        onDestroy: { damage: 2, immuneTo: [], delivery: 'replacements' }
      };
      const encounter = scene({
        damage: 1,
        profiles: chain,
        targets: [{ ...target('parent', 'outer', 4), layer: { profileId: 'outer' } }],
        statuses: [burn]
      });
      const after = advanceTo(encounter, 1.1);
      expect(after.targets.map((t) => [t.id, t.health])).toEqual([
        ['parent', 0],
        ['child-1', 0],
        ['child-2', 3]
      ]);
      expect(after.layers).toEqual([
        expect.objectContaining({ targetId: 'child-2', profileId: 'core', health: 3 })
      ]);
      if ('damage' in after) expect(after.damage).toBe(8);
      expect(advanceTo(encounter, 2.1).targets.find((t) => t.id === 'child-2')!.health).toBe(3);
    });
  });
}

it('Manga rejects reset before replacing pending projectiles, growth, targets or allies', () => {
  const encounter = mangaScene({
    damage: 4,
    projectileSpeed: 10,
    targets: [target('parent', 'outer', 4)]
  });
  encounter.advance(0.25);
  expect(encounter.snapshot().projectiles).toHaveLength(1);
  let before = encounter.snapshot();
  expect(() =>
    encounter.reset(
      [target('bad', 'missing')],
      [{ id: 'ally', x: 0, y: 0, health: 1, maximumHealth: 1 }]
    )
  ).toThrow('Unknown layer profile');
  expect(encounter.snapshot()).toEqual(before);
  encounter.advance(0.85);
  expect(encounter.snapshot().layers).toEqual([
    expect.objectContaining({ targetId: 'child-1', nextGrowthAt: expect.any(Number) })
  ]);
  before = encounter.snapshot();
  expect(() => encounter.reset([{ ...target(), x: NaN }])).toThrow('Invalid encounter target');
  expect(encounter.snapshot()).toEqual(before);
  expect(() => encounter.reset([target('bad', 'missing')])).toThrow('Unknown layer profile');
  expect(encounter.snapshot()).toEqual(before);
  encounter.advance(1.1);
  expect(encounter.snapshot().layers).toEqual([
    expect.objectContaining({ targetId: 'child-2', profileId: 'outer', health: 4 })
  ]);
});
