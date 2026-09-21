import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  candidateOf,
  inputForSelection,
  nextStage,
  requestOf,
  sessionSnapshot,
  type Revision,
} from '../src/lab/client/artifacts.js';
import { compareGameplay } from '../src/lab/client/kit-comparison.js';
import { authorUnit, checkDraft, draftUnit, prepareRequest } from '../src/core/index.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';

test('browser comparisons identify changed scope and stable upgrade entries without flagging unchanged kits', () => {
  const before = miraCandidate();
  assert.deepEqual(compareGameplay(before, structuredClone(before)), []);
  const after = structuredClone(before);
  after.character.scope = 'A later source period.';
  after.paths[0]!.tiers[0]!.benefit = 'A stronger strike.';
  after.abilities.splice(0, 1);
  after.mechanics.push({ ...after.mechanics[0]!, id: 'new-rule', name: 'New rule' });
  const changes = compareGameplay(before, after);
  assert.ok(
    changes.some(
      (change) =>
        change.section === 'Character' && change.fields.some((field) => field.name === 'Scope'),
    ),
  );
  assert.ok(
    changes.some(
      (change) =>
        change.section.endsWith('tier 1') &&
        change.kind === 'changed' &&
        change.fields.some((field) => field.after === 'A stronger strike.'),
    ),
  );
  assert.ok(changes.some((change) => change.section === 'Ability' && change.kind === 'removed'));
  assert.ok(changes.some((change) => change.section === 'Mechanic' && change.kind === 'added'));
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

test('new inputs start empty after a name-only result, while pending inputs retain their own constraints', () => {
  const blank = inputForSelection(undefined, null);
  assert.equal(blank.request.character.name, '');
  assert.deepEqual(blank.request.constraints, []);
  assert.equal(blank.request.previous, null);
  assert.equal(blank.dirty, true);
  const pending = miraRequest();
  pending.constraints = [{ id: 'pending-choice', text: 'Keep the support role.' }];
  const restored = inputForSelection(undefined, pending);
  assert.deepEqual(restored.request, pending);
  restored.request.character.name = 'Edited later';
  assert.equal(pending.character.name, 'Mira');
});

test('session round trips preserve pending inputs while another revision is selected', async () => {
  const artifact = await authorUnit(miraRequest(), new FakeModel());
  const revision: Revision = {
    id: 'revision-1',
    label: 'Mira',
    createdAt: '2026-09-19',
    request: artifact.prepared.request,
    artifact,
  };
  const pending = miraRequest();
  pending.character.name = 'Another character';
  pending.constraints = [{ id: 'new-choice', text: 'Preserve this pending decision.' }];
  const saved = JSON.parse(
    JSON.stringify(sessionSnapshot([revision], revision.id, revision.request, 'Mira', pending)),
  );
  const restored = inputForSelection(undefined, saved.unrunInput);
  assert.equal(restored.request.character.name, 'Another character');
  assert.deepEqual(restored.request.constraints, pending.constraints);
  assert.equal(saved.selectedId, revision.id);
  assert.deepEqual(
    inputForSelection(saved.revisions[0], saved.unrunInput).request,
    revision.request,
  );
  assert.equal(inputForSelection(saved.revisions[0], saved.unrunInput).dirty, false);
  saved.revisions[0].request.constraints = [
    { id: 'edited-choice', text: 'An explicit revision edit.' },
  ];
  assert.equal(inputForSelection(saved.revisions[0], saved.unrunInput).dirty, true);
});

test('rerunning any completed stage derives only its prerequisite and preserves the original result', async () => {
  const { inputBeforeStage } = await import('../src/lab/client/stage-input.js');
  const result = await authorUnit(miraRequest(), new FakeModel());
  const before = JSON.stringify(result);
  for (const stage of ['prepare', 'draft', 'check', 'review'] as const) {
    const input = await inputBeforeStage(result, stage);
    assert.equal(nextStage(input), stage);
    if (input) assert.deepEqual(requestOf(input), result.prepared.request);
    if (input && input.kind !== 'prepared') assert.deepEqual(candidateOf(input), result.candidate);
  }
  assert.equal(JSON.stringify(result), before);
  const checked = await inputBeforeStage(result, 'review');
  assert.equal(checked?.kind, 'checked');
  if (checked?.kind === 'checked') {
    assert.deepEqual(checked.draft.run, result.run.draft);
    assert.ok(checked.findings.every((finding) => finding.method !== 'model'));
  }
  await assert.rejects(inputBeforeStage(null, 'draft'), /Prepare/);
  await assert.rejects(inputBeforeStage(result.prepared, 'check'), /draft first/);
  const draft = await inputBeforeStage(result, 'check');
  await assert.rejects(inputBeforeStage(draft, 'review'), /Check the draft/);
});
