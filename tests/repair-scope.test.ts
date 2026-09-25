import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { authorEvidence } from '../src/core/planned-v1/evidence.js';
import { decodeBlueprintOutput } from '../src/core/planned-v1/model-output.js';
import { targetedTierRepair } from '../src/core/planned-v1/repair.js';
import { validBlueprint } from './fixtures/blueprint.js';
import { pathKeys, tierKeys } from '../src/core/mechanics/schemas.js';
import { miraRequest } from './fixtures/core-fixtures.js';

function fixture() {
  const request = miraRequest();
  request.constraints = [];
  request.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  const sourceIds = [authorEvidence(request)[0]!.id];
  const tier = () => ({
    name: 'Improved attack',
    cost: 100,
    statChanges: [{ stat: 'damage', operation: 'add', value: 1 }],
    slow: null as null | { percent: number; durationSeconds: number },
    burn: null as null | { damagePerSecond: number; durationSeconds: number },
    camo: null,
    delivery: null,
    damageType: null,
    targeting: null,
    distribution: null,
    followUp: null,
    activeFollowUp: null,
    unlockBoost: null as null | {
      name: string;
      durationSeconds: number;
      cooldownSeconds: number;
      damageMultiplier: number;
      intervalMultiplier: number;
      rangeBonus: number;
    },
    boostChanges: [] as { stat: string; operation: string; value: number }[],
  });
  const paths = Object.fromEntries(
    pathKeys.map((path) => [
      path,
      {
        name: path,
        theme: 'Develop the supplied attack.',
        rationale: 'Keep its established purpose.',
        specialization: 'direct-damage',
        sourceIds,
        tiers: Object.fromEntries(tierKeys.map((key) => [key, tier()])),
      },
    ]),
  ) as Record<
    (typeof pathKeys)[number],
    {
      name: string;
      theme: string;
      rationale: string;
      specialization: string;
      sourceIds: string[];
      tiers: Record<(typeof tierKeys)[number], ReturnType<typeof tier>>;
    }
  >;
  paths.path2.tiers.tier3.burn = { damagePerSecond: 1, durationSeconds: 2 };
  paths.path2.tiers.tier4.unlockBoost = {
    name: 'Ignition',
    durationSeconds: 8,
    cooldownSeconds: 30,
    damageMultiplier: 2,
    intervalMultiplier: 0.8,
    rangeBonus: 0,
  };
  paths.path2.tiers.tier5.burn = { damagePerSecond: 2, durationSeconds: 3 };
  paths.path2.tiers.tier5.boostChanges = [
    { stat: 'damageMultiplier', operation: 'add', value: 0.5 },
  ];
  const output = {
    name: request.character.name,
    role: 'Aimed attack.',
    weakness: 'Needs clear delivery.',
    baseAttack: validBlueprint().baseAttack,
    baseSourceIds: sourceIds,
    constraintCoverage: [],
    unsupportedMechanics: [],
    reservedTechniques: [],
    paths,
  };
  return { request, output };
}

const duplicate = [
  'paths.path2.tiers.tier1: Resolved tier 1 behavior duplicates path1; names and prices do not make a distinct upgrade.',
];

test('fresh policy duplicate-first-tier repair leaves an unrelated four-effect capstone untouched', () => {
  const { request, output } = fixture();
  assert.doesNotThrow(() => decodeBlueprintOutput(output, request));
  const original = structuredClone(output);
  const repair = targetedTierRepair(request, output, duplicate)!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  assert.deepEqual(context.dependentCapstones, []);
  const replacement = structuredClone(output.paths.path2.tiers.tier1);
  replacement.statChanges.push({ stat: 'range', operation: 'add', value: 2 });
  const merged = repair.apply({ paths: { path2: { tiers: { tier1: replacement } } } });
  assert.deepEqual(merged.paths.path2.tiers.tier5, output.paths.path2.tiers.tier5);
  assert.throws(() =>
    repair.apply({
      paths: { path2: { tiers: { tier1: replacement, tier5: output.paths.path2.tiers.tier5 } } },
    }),
  );
  assert.deepEqual(output, original);
});

test('custom capstone ratio and behavior policies retain their earlier-tier repair dependencies', () => {
  for (const policy of [{ minTier5SpecialtyMultiplier: 3 }, { requireTier5BehaviorChange: true }]) {
    const { request, output } = fixture();
    Object.assign(request.mechanicsDefinition!.profile.designPolicy!, policy);
    const repair = targetedTierRepair(request, output, duplicate)!;
    const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
    assert.deepEqual(context.dependentCapstones, ['path2.tier5']);
    assert.throws(() =>
      repair.apply({ paths: { path2: { tiers: { tier1: output.paths.path2.tiers.tier1 } } } }),
    );
  }
});

test('fresh policy still repairs a capstone when its manual boost prerequisite can change', () => {
  const { request, output } = fixture();
  const repair = targetedTierRepair(request, output, [
    'paths.path2.tiers.tier4: Correct this boost.',
  ])!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  assert.deepEqual(context.dependentCapstones, ['path2.tier5']);
});

test('adding a new slow to the four-effect burn capstone remains a real six-effect budget failure', () => {
  const { request, output } = fixture();
  output.paths.path2.tiers.tier5.slow = { percent: 50, durationSeconds: 3 };
  assert.throws(() => decodeBlueprintOutput(output, request), /This tier contains 6 effects/);
  assert.deepEqual(output.paths.path2.tiers.tier5.slow, { percent: 50, durationSeconds: 3 });
});
