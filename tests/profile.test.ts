import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyConceptProfile,
  applyDefaultProfile,
  applyProfile,
  bundledProfiles,
  defaultProgression,
  defaultUnitProfile,
  prepareRequest,
  qualitativeUnitProfile,
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

test('bundled Profiles validate and reproduce the rules of the existing presets', async () => {
  for (const profile of bundledProfiles) assert.deepEqual(await validateProfile(profile), profile);
  assert.equal(bundledProfiles[0], defaultUnitProfile);

  const numerical = applyProfile(sourceRequest(), defaultUnitProfile);
  const preset = applyDefaultProfile(sourceRequest());
  assert.equal(numerical.deliverable, 'mechanics');
  assert.deepEqual(numerical.mechanicsDefinition, preset.mechanicsDefinition);
  assert.deepEqual(numerical.documents, preset.documents);
  assert.deepEqual(numerical.progression, defaultProgression);
  const prepared = await prepareRequest(numerical);
  assert.equal(prepared.request.mechanicsDefinition?.profile.authoringMode, 'planned-v1');

  const qualitative = applyProfile(sourceRequest(), qualitativeUnitProfile);
  const concept = applyConceptProfile(sourceRequest());
  for (const field of [
    'deliverable',
    'task',
    'progression',
    'conceptRules',
    'conceptDefinition',
    'documents',
  ] as const)
    assert.deepEqual(qualitative[field], concept[field], field);
  assert.equal(qualitative.mechanicsDefinition, undefined);
  await prepareRequest(qualitative);
});

test('switching Profiles replaces the previous rules instead of mixing them', () => {
  const concept = applyProfile(sourceRequest(), qualitativeUnitProfile);
  const back = applyProfile(concept, defaultUnitProfile);
  assert.deepEqual(back, applyProfile(sourceRequest(), defaultUnitProfile));
  assert.equal(back.conceptDefinition, undefined);
  assert.equal(back.conceptRules, undefined);
  assert.deepEqual(
    back.documents.map(({ id }) => id),
    ['mira-source', defaultUnitProfile.rules.id],
  );
  assert.deepEqual(applyProfile(back, defaultUnitProfile), back);
});

test('a Profile needs exactly one Definition, a rules document and a safe ID', async () => {
  const both = {
    ...defaultUnitProfile,
    conceptDefinition: qualitativeUnitProfile.conceptDefinition,
  };
  assert.equal(unitProfileSchema.safeParse(both).success, false);
  const { mechanicsDefinition: _removed, ...neither } = defaultUnitProfile;
  assert.equal(unitProfileSchema.safeParse(neither).success, false);
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
  const definition = qualitativeUnitProfile.conceptDefinition!;
  const forbidden = {
    ...qualitativeUnitProfile,
    conceptProfile: {
      id: 'custom',
      version: '1',
      definition: { id: definition.id, version: definition.version },
      overrides: { earlySupport: 'unrestricted' as const },
    },
  };
  await assert.rejects(validateProfile(forbidden), /does not permit this earlySupport/);
});
