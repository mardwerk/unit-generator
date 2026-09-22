import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  killsByWave,
  minUsefulFollowUpRadius,
  referenceWaves,
  simulateWave,
  usefulnessIssues,
  type Change,
  type UnitBlueprint,
} from '../src/core/index.js';
import { spines } from '../src/core/index.js';

function dartLike(): UnitBlueprint {
  const spine = spines.find((s) => s.id === 'aimed')!;
  const tier = (name: string, cost: number, changes: Change[]) => ({ name, cost, changes });
  const stat = (statName: 'damage' | 'range', operation: 'add' | 'set', value: number) => ({
    kind: 'stat' as const,
    target: 'base' as const,
    stat: statName,
    operation,
    value,
  });
  const attack = { ...spine.base, name: 'Dart', cost: spine.baseCost };
  const branch = (specialization: 'group-damage' | 'attack-speed' | 'range', damage: number) => ({
    name: 'Branch',
    specialization,
    theme: 'Theme.',
    rationale: 'Rationale.',
    sourceFactIndices: [0],
    tiers: {
      tier1: tier('T1', 140, [stat('damage', 'add', 0)]),
      tier2: tier('T2', 200, [stat('damage', 'add', 0)]),
      tier3: tier('T3', 320, [stat('damage', 'add', damage)]),
      tier4: tier('T4', 1800, [stat('damage', 'add', damage), stat('range', 'set', 70)]),
      tier5: tier('T5', 15000, [stat('range', 'set', 200)]),
    },
  });
  return {
    name: 'Dart',
    role: 'Role.',
    weakness: 'Weakness.',
    sourceFacts: [{ documentId: 'doc', quote: 'A short aimed projectile reference line.' }],
    constraintCoverage: [],
    baseAttack: attack,
    paths: {
      path1: branch('group-damage', 1),
      path2: branch('attack-speed', 1),
      path3: branch('range', 1),
    },
    proposals: [],
    reservedTechniques: [],
  };
}

describe('reference waves', () => {
  it('covers stream, horde, tough, fast, lead, camo, siege and titan', () => {
    assert.deepEqual(
      referenceWaves.map((w) => w.id),
      ['stream', 'horde', 'tough', 'fast', 'lead', 'camo', 'siege', 'titan'],
    );
  });

  it('a cheap aimed attack clears the stream', () => {
    const spine = spines.find((s) => s.id === 'aimed')!;
    const result = simulateWave(
      { ...spine.base, name: 'Dart', cost: 200 },
      null,
      referenceWaves[0]!,
    );
    assert.equal(result.leaked, 0);
    assert.ok(result.kills > 0 && result.shots > 0);
  });

  it('sharp attacks cannot scratch lead, energy can', () => {
    const spine = spines.find((s) => s.id === 'aimed')!;
    const base = { ...spine.base, name: 'Dart', cost: 200 };
    const lead = referenceWaves.find((w) => w.id === 'lead')!;
    assert.equal(simulateWave(base, null, lead).kills, 0);
    const energy = { ...base, damageType: 'energy' as const, stats: { ...base.stats, damage: 2 } };
    assert.ok(simulateWave(energy, null, lead).kills > 0);
  });

  it('camo enemies need detection', () => {
    const spine = spines.find((s) => s.id === 'aimed')!;
    const base = { ...spine.base, name: 'Dart', cost: 200 };
    const camo = referenceWaves.find((w) => w.id === 'camo')!;
    assert.equal(simulateWave(base, null, camo).kills, 0);
    assert.ok(simulateWave({ ...base, camo: true }, null, camo).kills > 0);
  });

  it('kills are deterministic across repeated runs', () => {
    const spine = spines.find((s) => s.id === 'aimed')!;
    const base = { ...spine.base, name: 'Dart', cost: 200 };
    const horde = referenceWaves.find((w) => w.id === 'horde')!;
    const first = simulateWave(base, null, horde);
    const second = simulateWave(base, null, horde);
    assert.deepEqual(first, second);
  });
});

describe('usefulness gates', () => {
  it('passes tiers that add kills and flags saturated capstones', () => {
    const issues = usefulnessIssues(dartLike());
    assert.ok(issues.every((i) => i.path.includes('tier5')));
    assert.equal(issues.length, 3);
  });

  it('flags near-zero follow-up radii and passes useful ones', () => {
    assert.ok(minUsefulFollowUpRadius > 0);
    const blueprint = dartLike();
    blueprint.paths.path1.tiers.tier5.changes = [
      {
        kind: 'followUp',
        target: 'base',
        value: {
          name: 'Splinter',
          count: 1,
          damageMultiplier: 1,
          radius: 0.06,
          inheritStatuses: false,
        },
      },
    ];
    const issues = usefulnessIssues(blueprint);
    assert.ok(issues.some((i) => i.message.includes('below the useful minimum')));
    blueprint.paths.path1.tiers.tier5.changes = [
      {
        kind: 'followUp',
        target: 'base',
        value: {
          name: 'Splinter',
          count: 3,
          damageMultiplier: 1,
          radius: 10,
          inheritStatuses: false,
        },
      },
    ];
    assert.ok(!usefulnessIssues(blueprint).some((i) => i.message.includes('useful minimum')));
  });

  it('resolves kills for every legal build without throwing', () => {
    const blueprint = dartLike();
    for (const selection of [
      [0, 0, 0],
      [5, 2, 0],
      [0, 5, 2],
      [2, 0, 5],
    ] as [number, number, number][]) {
      for (const result of killsByWave(blueprint, selection)) {
        assert.ok(result.kills + result.leaked > 0 || result.shots >= 0);
      }
    }
  });
});
