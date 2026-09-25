import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDefaultProfile,
  defaultProfile,
  starterAuthoringTask,
} from '../src/core/default-profile.js';
import * as nodeProfile from '../src/node/default-profile.js';
import { isReferenceAuthoring } from '../src/core/planned-v1/reference-authoring.js';
import { prepareRequest } from '../src/core/prepare.js';
import { miraRequest } from './fixtures/core-fixtures.js';

function starter() {
  const value = miraRequest();
  value.documents = value.documents.filter((document) => document.kind === 'source');
  value.constraints = [];
  value.progression = null;
  value.task = starterAuthoringTask;
  const request = applyDefaultProfile(value);
  request.mechanicsDefinition!.profile.authoringMode = 'reference-patterns-v1';
  return request;
}

test('unchanged starter rules and generated mechanics retain reference eligibility', async () => {
  const request = starter();
  assert.equal(isReferenceAuthoring(request), true);
  const prepared = await prepareRequest(request);
  assert.equal(isReferenceAuthoring(prepared.request), true);
  assert.equal(nodeProfile.defaultProfile, defaultProfile);
  assert.equal(nodeProfile.starterAuthoringTask, starterAuthoringTask);
});

test('custom task requirements use direct authoring without changing their text', () => {
  for (const task of [
    'Every Unit must cost exactly 725 Gold and never stun enemies.',
    `${starterAuthoringTask} No manual abilities are allowed.`,
  ]) {
    const request = starter();
    request.task = task;
    const before = structuredClone(request);
    assert.equal(isReferenceAuthoring(request), false);
    assert.deepEqual(request, before);
  }
});

test('custom and edited rules cannot acquire starter trust through an id or origin', () => {
  for (const modify of [
    (request: ReturnType<typeof starter>) => {
      request.documents.push({
        ...structuredClone(defaultProfile),
        id: 'custom-rules',
        text: 'Every Unit must cost exactly 725 Gold.',
      });
    },
    (request: ReturnType<typeof starter>) => {
      request.documents.find((document) => document.id === defaultProfile.id)!.text +=
        '\nNever stun enemies.';
    },
    (request: ReturnType<typeof starter>) => {
      request.documents.find((document) => document.id === defaultProfile.id)!.visualNotes = [
        'Never burn enemies.',
      ];
    },
  ]) {
    const request = starter();
    modify(request);
    const before = structuredClone(request);
    assert.equal(isReferenceAuthoring(request), false);
    assert.deepEqual(request, before);
  }
});

test('edited generated mechanics evidence cannot bypass direct decoder routing', async () => {
  const request = structuredClone((await prepareRequest(starter())).request);
  request.documents.find((document) => document.id.startsWith('mechanics:'))!.text +=
    '\nNo manual abilities.';
  assert.equal(isReferenceAuthoring(request), false);
  await assert.rejects(prepareRequest(request), /differs from the supplied definition/);
});
