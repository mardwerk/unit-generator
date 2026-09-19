import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateOf, compareKits, nextStage, requestOf } from '../src/lab/client/artifacts.js';
import { authorUnit, checkDraft, draftUnit, prepareRequest } from '../src/core/index.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';

test('browser comparisons identify changed scope and stable upgrade entries without flagging unchanged kits', () => {
  const before = miraCandidate();
  assert.deepEqual(compareKits(before, structuredClone(before)), []);
  const after = structuredClone(before);
  after.character.scope = 'A later source period.';
  after.paths[0]!.tiers[0]!.benefit = 'A stronger strike.';
  after.abilities.splice(0, 1);
  after.mechanics.push({ ...after.mechanics[0]!, id: 'new-rule', name: 'New rule' });
  const changes = compareKits(before, after);
  assert.ok(
    changes.some(
      (change) =>
        change.section === 'Character' && change.fields.some((field) => field.name === 'scope'),
    ),
  );
  assert.ok(
    changes.some(
      (change) =>
        change.section === 'Upgrades' &&
        change.kind === 'changed' &&
        change.fields.some((field) => field.after === 'A stronger strike.'),
    ),
  );
  assert.ok(changes.some((change) => change.section === 'Abilities' && change.kind === 'removed'));
  assert.ok(changes.some((change) => change.section === 'Mechanics' && change.kind === 'added'));
});

test('browser stages use actual artifact kinds and retain the same explicit request', async () => {
  const prepared = await prepareRequest(miraRequest());
  const draft = await draftUnit(prepared, new FakeModel());
  const checked = await checkDraft(draft);
  const result = await authorUnit(miraRequest(), new FakeModel());
  assert.equal(nextStage(null), 'prepare');
  for (const [artifact, next] of [
    [prepared, 'draft'],
    [draft, 'check'],
    [checked, 'review'],
    [result, null],
  ] as const) {
    assert.equal(nextStage(artifact), next);
    assert.deepEqual(requestOf(artifact), prepared.request);
  }
  assert.equal(candidateOf(prepared), null);
  assert.deepEqual(candidateOf(checked), draft.candidate);
});
