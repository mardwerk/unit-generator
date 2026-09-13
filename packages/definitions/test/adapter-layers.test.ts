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

const profiles: LayerProfile[] = [
  { id: 'outer', maximumHealth: 1, children: ['inner'], distributeDamageToChildren: true },
  {
    id: 'inner',
    maximumHealth: 4,
    children: [],
    distributeDamageToChildren: true,
    regrowth: { toProfileId: 'outer', intervalSeconds: 1 }
  }
];
const regrowth: LayerRegrowthPolicy = {
  ceilingProfileId: 'outer',
  clock: 'after-damage',
  health: 'full'
};
const target = () => ({
  id: 'enemy',
  x: 10,
  y: 0,
  health: 1,
  progress: 1,
  strength: 1,
  layer: { profileId: 'outer', regrowth }
});
function mangaUnit() {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, {
    damage: 3,
    period: 120,
    windup: 0,
    reach: 20,
    shape: { kind: 'single' }
  });
  return unit;
}
function layerOptions() {
  let serial = 0;
  return {
    profiles,
    damagePolicy: { distribute: true, overrideBlocker: false, allocation: 'sequential' as const },
    createTarget: (_profile: LayerProfile, parent: MangaTarget & Partial<Btd6TargetV2>) => ({
      ...parent,
      id: `child-${++serial}`,
      progress: 1,
      strength: 1
    })
  };
}
function towerScene(options: ReturnType<typeof layerOptions>) {
  const model = createBtd6FixtureV2().base!;
  model.abilities = [];
  model.attacks = [model.attacks[0]!];
  delete model.attacks[0]!.projectile;
  Object.assign(model.attacks[0]!, {
    damage: 3,
    intervalSeconds: 120,
    delivery: 'contact',
    projectiles: 1
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
    { targets: [target()], layers: options }
  );
}
for (const adapter of ['manga', 'tower'] as const) {
  describe(`${adapter} layered encounters`, () => {
    const scene = () =>
      adapter === 'manga'
        ? createMangaEncounter(mangaUnit(), [0, 0, 0], [target()], { layers: layerOptions() })
        : towerScene(layerOptions());
    it('applies overflow once to the live child, then regrows on the shared clock', () => {
      const encounter = scene();
      const hit = encounter.advance(0.1);
      expect(hit.targets.filter((t) => t.health > 0).map((t) => [t.id, t.health])).toEqual([
        ['child-1', 2]
      ]);
      expect(hit.layers).toEqual([
        expect.objectContaining({
          targetId: 'child-1',
          profileId: 'inner',
          health: 2,
          nextGrowthAt: 1
        })
      ]);
      const grown = encounter.advance(1.1);
      expect(grown.targets.filter((t) => t.health > 0).map((t) => [t.id, t.health])).toEqual([
        ['child-2', 1]
      ]);
      expect(grown.layers).toEqual([
        expect.objectContaining({ targetId: 'child-2', profileId: 'outer', health: 1 })
      ]);
    });
    it('cancels growth after an explicit host removal', () => {
      const encounter = scene();
      encounter.advance(0.1);
      encounter.updateTarget('child-1', { health: 0 });
      expect(encounter.advance(1.1).layers).toEqual([]);
      expect(encounter.snapshot().targets.some((t) => t.id === 'child-2')).toBe(false);
    });
    it('requires replacement for a layer profile change', () => {
      const encounter = scene();
      expect(() => encounter.updateTarget('enemy', { layer: { profileId: 'inner' } })).toThrow(
        'Replace the target'
      );
      expect(encounter.snapshot().layers[0]?.profileId).toBe('outer');
    });
  });
}
it('resets Manga layer state and pending growth with the encounter', () => {
  const encounter = createMangaEncounter(mangaUnit(), [0, 0, 0], [target()], {
    layers: layerOptions()
  });
  encounter.advance(0.1);
  encounter.reset([target()]);
  expect(encounter.snapshot().layers.map((t) => t.targetId)).toEqual(['enemy']);
  expect(
    encounter
      .advance(0.1)
      .targets.filter((t) => t.health > 0)
      .map((t) => t.health)
  ).toEqual([2]);
});
