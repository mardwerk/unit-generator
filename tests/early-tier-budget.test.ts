import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { tierEffectLimit } from '../src/core/planned-v1/model-output.js';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import {
  defaultMechanicsDefinition,
  mechanicsDefinitionSchema,
  type Change,
} from '../src/core/mechanics/schemas.js';
import { validateBlueprint } from '../src/core/mechanics/validate.js';
import { miraRequest } from './fixtures/core-fixtures.js';

const fourEffects: Change[] = [
  { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 },
  { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 1 },
  { kind: 'stat', target: 'base', stat: 'pierce', operation: 'add', value: 1 },
  { kind: 'stat', target: 'base', stat: 'intervalSeconds', operation: 'multiply', value: 0.9 },
];

test('legacy omitted early-tier boundary still rejects four effects at tier 3', () => {
  const legacy = structuredClone(defaultMechanicsDefinition);
  assert.equal(Object.hasOwn(legacy.profile, 'earlyTierThrough'), false);
  const input = miraRequest();
  input.mechanicsDefinition = legacy;
  assert.equal(tierEffectLimit(input, 'tier3'), 3);
  assert.equal(tierEffectLimit(input, 'tier4'), 4);
  const unit = structuredClone(referenceRecipes[0]!.blueprint);
  // This policy-free legacy-shaped definition enables the fixture's explicit
  // extensions, leaving its older change budget as the only differing check.
  legacy.rules.attackExtensions = ['distinct-volley', 'volley-follow-up'];
  unit.paths.path1.tiers.tier3.changes = structuredClone(fourEffects);
  assert.deepEqual(validateBlueprint(unit, legacy), [
    { path: 'paths.path1.tiers.tier3.changes', message: 'Exceeds the Definition change budget.' },
  ]);
});

test('fresh authoring explicitly allows four tier-3 effects but limits tiers 1 and 2', () => {
  const input = miraRequest();
  input.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  assert.equal(input.mechanicsDefinition.profile.earlyTierThrough, 2);
  assert.equal(tierEffectLimit(input, 'tier1'), 3);
  assert.equal(tierEffectLimit(input, 'tier2'), 3);
  assert.equal(tierEffectLimit(input, 'tier3'), 4);
  const unit = structuredClone(referenceRecipes[0]!.blueprint);
  unit.paths.path1.tiers.tier3.changes = structuredClone(fourEffects);
  assert.deepEqual(validateBlueprint(unit, input.mechanicsDefinition), []);
  for (const tier of ['tier1', 'tier2'] as const) {
    const early = structuredClone(unit);
    early.paths.path1.tiers[tier].changes = structuredClone(fourEffects);
    assert.ok(
      validateBlueprint(early, input.mechanicsDefinition).some(
        ({ path, message }) =>
          path === `paths.path1.tiers.${tier}.changes` && message.includes('change budget'),
      ),
    );
  }
});

test('custom early-tier boundaries are optional integers from 1 through 3', () => {
  const input = miraRequest();
  input.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  for (const boundary of [0, 1.5, 4]) {
    input.mechanicsDefinition.profile.earlyTierThrough = boundary;
    assert.equal(mechanicsDefinitionSchema.safeParse(input.mechanicsDefinition).success, false);
  }
  input.mechanicsDefinition.profile.earlyTierThrough = 1;
  assert.equal(mechanicsDefinitionSchema.safeParse(input.mechanicsDefinition).success, true);
  assert.equal(tierEffectLimit(input, 'tier1'), 3);
  assert.equal(tierEffectLimit(input, 'tier2'), 4);
});
