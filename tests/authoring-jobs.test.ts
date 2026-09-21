import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareRequest, draftUnit, checkDraft, reviewDraft } from '../src/core/index.js';
import type { LabArtifact } from '../src/lab/contracts.js';
import { AuthoringJobs } from '../src/lab/client/authoring-jobs.js';
import { emptyRequest, requestOf, type Revision } from '../src/lab/client/artifacts.js';
import type { api } from '../src/lab/client/api.js';
import { FakeModel, miraCandidate, miraRequest, miraReview } from './fixtures/core-fixtures.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function artifacts(name: string) {
  const request = miraRequest();
  request.character.name = name;
  const candidate = miraCandidate();
  candidate.character.name = name;
  const prepared = await prepareRequest(request);
  const draft = await draftUnit(prepared, new FakeModel([candidate]));
  const checked = await checkDraft(draft);
  const result = await reviewDraft(checked, new FakeModel([miraReview()]));
  return { prepared, draft, checked, result };
}
function revision(id: string): Revision {
  return {
    id,
    label: id,
    createdAt: '2026-09-21',
    request: { ...emptyRequest(), character: { name: id, work: '', scope: '' } },
    artifact: null,
  };
}

test('overlapping character runs finish out of order and each retains and saves its own result', async () => {
  const a = await artifacts('A');
  const b = await artifacts('B');
  const gates = {
    A: deferred<typeof a.prepared>(),
    B: deferred<typeof b.prepared>(),
  };
  const entered = deferred<void>();
  const signals = new Map<string, AbortSignal>();
  const retained = new Map<string, Revision>();
  const saved: LabArtifact[] = [];
  let selected = 'A';
  let editor = 'A';
  const manager = new AuthoringJobs({
    api: (async (endpoint: string, body: any, signal?: AbortSignal) => {
      if (endpoint === 'provider') return { ready: true };
      if (endpoint === 'character') {
        const name = body.name as 'A' | 'B';
        signals.set(name, signal!);
        if (signals.size === 2) entered.resolve();
        return gates[name].promise;
      }
      const previous = (body.prepared ?? body.draft ?? body.checked) as LabArtifact;
      const bundle = requestOf(previous).character.name === 'A' ? a : b;
      return endpoint === 'draft'
        ? bundle.draft
        : endpoint === 'check'
          ? bundle.checked
          : bundle.result;
    }) as typeof api,
    changed: () => {},
    revision: (value) => {
      retained.set(value.id, value);
      if (selected === value.id) editor = value.request.character.name;
    },
    complete: async (value) => {
      saved.push(value);
    },
    needsProvider: () => assert.fail('Provider is ready'),
  });
  const first = manager.start(revision('A'), { remaining: true, lookup: { name: 'A' } });
  const second = manager.start(revision('B'), { remaining: true, lookup: { name: 'B' } });
  await entered.promise;
  assert.equal(manager.jobs.filter((job) => job.state === 'running').length, 2);
  assert.notEqual(signals.get('A'), signals.get('B'));
  gates.B.resolve(b.prepared);
  await second;
  assert.equal(editor, 'A');
  assert.equal(retained.get('B')!.artifact, b.result);
  assert.equal(manager.jobs.find((job) => job.id === 'A')!.state, 'running');
  // Navigation while A is still running must not let A replace the inspected B editor.
  selected = 'B';
  editor = 'B';
  gates.A.resolve(a.prepared);
  await first;
  assert.equal(editor, 'B');
  assert.equal(retained.get('A')!.artifact, a.result);
  assert.deepEqual(saved, [b.result, a.result]);
  assert.ok(manager.jobs.every((job) => job.state === 'finished'));
});

test('stop cancels only the selected job and preserves its last completed artifact', async () => {
  const a = await artifacts('A');
  const b = await artifacts('B');
  const entered = deferred<void>();
  const pending: { name: string; signal: AbortSignal; finish: (value: LabArtifact) => void }[] = [];
  const retained = new Map<string, Revision>();
  const saved: string[] = [];
  const manager = new AuthoringJobs({
    api: (async (endpoint: string, body: any, signal?: AbortSignal) => {
      if (endpoint === 'draft')
        return new Promise<LabArtifact>((resolve, reject) => {
          const name = body.prepared.request.character.name;
          pending.push({ name, signal: signal!, finish: resolve });
          signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
          if (pending.length === 2) entered.resolve();
        });
      return endpoint === 'check' ? b.checked : b.result;
    }) as typeof api,
    changed: () => {},
    revision: (value) => retained.set(value.id, value),
    complete: async (value) => {
      saved.push(requestOf(value).character.name);
    },
    needsProvider: () => {},
  });
  const ra = { ...revision('A'), request: a.prepared.request, artifact: a.prepared };
  const rb = { ...revision('B'), request: b.prepared.request, artifact: b.prepared };
  retained.set('A', ra);
  retained.set('B', rb);
  const first = manager.start(ra, { remaining: true });
  const second = manager.start(rb, { remaining: true });
  await entered.promise;
  manager.stop('A');
  await first;
  assert.equal(pending.find((entry) => entry.name === 'A')!.signal.aborted, true);
  assert.equal(pending.find((entry) => entry.name === 'B')!.signal.aborted, false);
  assert.equal(retained.get('A')!.artifact, a.prepared);
  assert.equal(manager.jobs.find((job) => job.id === 'A')!.state, 'stopped');
  pending.find((entry) => entry.name === 'B')!.finish(b.draft);
  await second;
  assert.equal(retained.get('B')!.artifact, b.result);
  assert.deepEqual(saved, ['B']);
});

test('ambiguous choices and failures remain attached to their own jobs while another continues', async () => {
  const bundle = await artifacts('B');
  const choices = [{ id: 17, name: 'A from one work', description: 'Work' }];
  const manager = new AuthoringJobs({
    api: (async (endpoint: string, body: any) => {
      if (endpoint === 'provider') return { ready: true };
      if (endpoint === 'character') {
        if (body.name === 'A' && body.choice === undefined) return { kind: 'choices', choices };
        if (body.name === 'A') throw new Error('A lookup unavailable');
        return bundle.prepared;
      }
      throw new Error('No model stages requested');
    }) as typeof api,
    changed: () => {},
    revision: () => {},
    complete: async () => {},
    needsProvider: () => {},
  });
  await Promise.all([
    manager.start(revision('A'), { remaining: false, lookup: { name: 'A' } }),
    manager.start(revision('B'), { remaining: false, lookup: { name: 'B' } }),
  ]);
  assert.deepEqual(manager.jobs.find((job) => job.id === 'A')!.choices, choices);
  assert.equal(manager.jobs.find((job) => job.id === 'B')!.state, 'finished');
  await manager.start(revision('A'), { remaining: false, lookup: { name: 'A', choice: 17 } });
  assert.match(manager.jobs.find((job) => job.id === 'A')!.error, /A lookup unavailable/);
  assert.equal(manager.jobs.find((job) => job.id === 'B')!.error, '');
});
