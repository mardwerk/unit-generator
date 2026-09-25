import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDefaultProfile, defaultProfile } from '../src/node/default-profile.js';
import {
  defaultMechanicsDefinition,
  mechanicsDefinitionSchema,
} from '../src/core/mechanics/index.js';
import { prepareRequest, definitionProgression } from '../src/core/index.js';
import { miraRequest } from './fixtures/core-fixtures.js';

test('the default profile supplies a consistent Gold and Health scale with source provenance', async () => {
  const input = miraRequest();
  input.progression = null;
  const request = applyDefaultProfile(input);
  const prepared = await prepareRequest(request);
  const definition = prepared.request.mechanicsDefinition!;
  assert.equal(definition.id, 'btd6-combat-v1');
  assert.equal(definition.profile.currency, 'Gold');
  assert.equal(definition.profile.authoringMode, undefined);
  assert.ok(Object.isFrozen(defaultProfile.origin));
  assert.throws(() => {
    defaultProfile.text = 'mutated rules';
  }, TypeError);
  assert.equal(definition.profile.designPolicy?.minTier5SpecialtyMultiplier, undefined);
  assert.equal(definition.profile.designPolicy?.distinctFirstUpgrades, true);
  assert.equal(definition.profile.designPolicy?.maxManualAbilityPaths, 1);
  assert.equal(definition.profile.designPolicy?.manualAbilityPath, 'path2');
  assert.equal(definition.revision, '2026-09-25-design-v10');
  assert.equal(defaultProfile.id, 'default-td-profile-v10');
  assert.equal(
    definition.profile.designPolicy?.tier5Uniqueness,
    'one-per-player-unit-type-and-path',
  );
  assert.deepEqual(definition.profile.referenceScale, {
    healthResource: 'Health',
    startingHealth: 150,
    ordinaryEnemyHealth: 1,
    baseCost: 200,
    baseDamage: 1,
    baseIntervalSeconds: 0.95,
    baseRange: 32,
    basePierce: 2,
    incrementalUpgradeCosts: [140, 200, 320, 1800, 15000],
  });
  assert.match(defaultProfile.text, /Units have no Health/);
  assert.match(defaultProfile.text, /unpinned patches/);
  assert.doesNotMatch(defaultProfile.text, /Ink/);
  request.mechanicsDefinition!.profile.currency = 'Test';
  assert.equal(defaultMechanicsDefinition.profile.currency, 'Gold');
});

test('explicit older definitions keep their scale and do not acquire the new defaults', async () => {
  const older = structuredClone(defaultMechanicsDefinition);
  older.id = 'ordinary-combat-v1';
  older.profile.currency = 'Ink';
  delete older.profile.referenceScale;
  assert.deepEqual(mechanicsDefinitionSchema.parse(older), older);
  const request = miraRequest();
  request.mechanicsDefinition = older;
  request.progression = definitionProgression(older);
  const prepared = await prepareRequest(request);
  assert.equal(prepared.request.mechanicsDefinition?.profile.currency, 'Ink');
  assert.equal(prepared.request.mechanicsDefinition?.profile.referenceScale, undefined);
  assert.equal(prepared.request.mechanicsDefinition?.profile.designPolicy, undefined);
  assert.ok(!prepared.request.documents.some((document) => document.id === defaultProfile.id));
});
