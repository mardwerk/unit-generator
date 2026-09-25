import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDefaultProfile,
  applyProfile,
  bundledProfiles,
  defaultProgression,
  defaultUnitProfile,
  prepareRequest,
  starterAuthoringTask,
  unitProfileSchema,
  validateProfile,
  type AuthorRequest,
} from '../src/core/index.js';

function sourceRequest(): AuthorRequest {
  return {
    schemaVersion: '1',
    task: starterAuthoringTask,
    character: { name: 'Mira', work: 'Original test brief', scope: 'Test scope' },
    documents: [
      {
        id: 'mira-source',
        kind: 'source',
        text: 'Mira throws sharp darts at the closest enemy.',
        origin: { location: 'test', access: 'supplied', note: null },
      },
    ],
    constraints: [],
    progression: null,
    previous: null,
    feedback: null,
  };
}

test('the single bundled Profile validates, keeps BTD6 reference values and matches the old preset', async () => {
  assert.deepEqual(bundledProfiles, [defaultUnitProfile]);
  assert.deepEqual(await validateProfile(defaultUnitProfile), defaultUnitProfile);
  const scale = defaultUnitProfile.mechanicsDefinition.profile.referenceScale!;
  assert.deepEqual(
    [scale.startingHealth, scale.baseCost, scale.baseRange, scale.incrementalUpgradeCosts],
    [150, 200, 32, [140, 200, 320, 1800, 15000]],
  );
  const applied = applyProfile(sourceRequest(), defaultUnitProfile);
  const preset = applyDefaultProfile(sourceRequest());
  assert.deepEqual(applied.mechanicsDefinition, preset.mechanicsDefinition);
  assert.deepEqual(applied.documents, preset.documents);
  assert.deepEqual(applied.progression, defaultProgression);
  assert.equal(applied.task, defaultUnitProfile.task);
  const prepared = await prepareRequest(applied);
  assert.equal(prepared.request.mechanicsDefinition?.profile.authoringMode, 'planned-v1');
});

test('switching Profiles replaces the previous rules instead of mixing them', () => {
  const custom = {
    ...structuredClone(defaultUnitProfile),
    id: 'custom',
    name: 'Custom',
    task: 'Custom task.',
    rules: {
      ...structuredClone(defaultUnitProfile.rules),
      id: 'profile:custom',
      text: 'Custom rules.',
    },
  };
  const first = applyProfile(sourceRequest(), custom);
  assert.deepEqual(
    first.documents.map(({ id }) => id),
    ['mira-source', 'profile:custom'],
  );
  const back = applyProfile(first, defaultUnitProfile);
  assert.deepEqual(back, applyProfile(sourceRequest(), defaultUnitProfile));
  assert.deepEqual(
    back.documents.map(({ id }) => id),
    ['mira-source', defaultUnitProfile.rules.id],
  );
  assert.deepEqual(applyProfile(back, defaultUnitProfile), back);
});

test('a Profile needs a mechanics Definition, a rules document and a safe ID', async () => {
  const { mechanicsDefinition: _removed, ...missing } = defaultUnitProfile;
  assert.equal(unitProfileSchema.safeParse(missing).success, false);
  assert.equal(
    unitProfileSchema.safeParse({ ...defaultUnitProfile, id: '../escape' }).success,
    false,
  );
  assert.equal(
    unitProfileSchema.safeParse({
      ...defaultUnitProfile,
      rules: { ...defaultUnitProfile.rules, kind: 'source' },
    }).success,
    false,
  );
  const unsupported = structuredClone(defaultUnitProfile) as { mechanicsDefinition: unknown };
  (
    unsupported.mechanicsDefinition as { progression: { maxAdvancedPaths: number } }
  ).progression.maxAdvancedPaths = 2;
  await assert.rejects(validateProfile(unsupported));
});
