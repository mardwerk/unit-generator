import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { get } from 'node:http';
import type {
  AuthorResult,
  CheckedArtifact,
  DraftArtifact,
  ModelClient,
  PreparedRequest,
} from '../src/core/index.js';
import { prepareRequest } from '../src/core/index.js';
import { startLab } from '../src/lab/server.js';
import { FakeModel, miraCandidate, miraRequest, miraReview } from './fixtures/core-fixtures.js';

async function withLab(
  model: ModelClient,
  body: (lab: Awaited<ReturnType<typeof startLab>>, post: Post) => Promise<void>,
) {
  const lab = await startLab({ model, example: miraRequest(), port: 0 });
  const post: Post = (operation, input, options = {}) =>
    fetch(`${lab.origin}/api/${operation}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lab.token}`,
        Origin: lab.origin,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(input),
      signal: options.signal,
    });
  try {
    await body(lab, post);
  } finally {
    await lab.close();
  }
}

type Post = (
  operation: string,
  input: unknown,
  options?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

async function artifact<T>(response: Response): Promise<T> {
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body as T;
}

test('UnitLab runs the core stages and an explicit revision without a CLI intermediary', async () => {
  const changed = miraCandidate();
  changed.role = 'Support-focused revision.';
  const model = new FakeModel([miraCandidate(), miraReview(), changed, miraReview()]);
  await withLab(model, async (lab, post) => {
    const example = await fetch(`${lab.origin}/api/example`, {
      headers: { Authorization: `Bearer ${lab.token}` },
    });
    const request = await artifact<ReturnType<typeof miraRequest>>(example);
    const prepared = await artifact<PreparedRequest>(await post('prepare', { request }));
    assert.deepEqual(prepared, await prepareRequest(request));
    const draft = await artifact<DraftArtifact>(await post('draft', { prepared }));
    const checked = await artifact<CheckedArtifact>(await post('check', { draft }));
    const result = await artifact<AuthorResult>(await post('review', { checked }));
    assert.deepEqual(result.candidate, miraCandidate());
    assert.ok(result.findings.some((finding) => finding.method === 'model'));
    const imported = await artifact<{ kind: string; artifact: AuthorResult }>(
      await post('inspect', { artifact: result }),
    );
    assert.equal(imported.kind, 'result');
    assert.deepEqual(imported.artifact, result);
    const markdown = await artifact<{ markdown: string }>(
      await post('render', { artifact: result }),
    );
    assert.match(markdown.markdown, /# Mira/);

    const revisionRequest = {
      ...request,
      previous: { resultId: result.id, draft: result.candidate, findings: result.findings },
      feedback: 'Prioritize support while preserving confirmed decisions.',
    };
    const next = await artifact<PreparedRequest>(
      await post('prepare', { request: revisionRequest }),
    );
    const nextDraft = await artifact<DraftArtifact>(await post('draft', { prepared: next }));
    const nextChecked = await artifact<CheckedArtifact>(await post('check', { draft: nextDraft }));
    const revised = await artifact<AuthorResult>(await post('review', { checked: nextChecked }));
    assert.equal(revised.prepared.request.previous?.resultId, result.id);
    assert.deepEqual(revised.prepared.request.constraints, result.prepared.request.constraints);
    assert.equal(revised.candidate.role, changed.role);
    assert.equal(result.candidate.role, miraCandidate().role);
  });
});

test('UnitLab preserves supplied provenance, resolves new text and refuses server file reads', async () => {
  await withLab(new FakeModel(), async (_lab, post) => {
    const request = miraRequest();
    const mixed = {
      ...request,
      documents: [
        request.documents[0],
        { id: 'new-rules', kind: 'rules', text: 'Explicit additional rules.' },
      ],
    };
    const prepared = await artifact<PreparedRequest>(await post('prepare', { request: mixed }));
    assert.deepEqual(prepared.request.documents[0]?.origin, request.documents[0]?.origin);
    assert.equal(prepared.request.documents[1]?.origin.access, 'supplied');
    for (const unsafe of [
      { ...request, documents: [{ id: 'secret', kind: 'source', file: '/etc/passwd' }] },
      { ...request, previousResultFile: '/etc/passwd' },
    ]) {
      const response = await post('prepare', { request: unsafe });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error.message, /Upload|Import/);
    }
    const tampered = structuredClone(prepared);
    tampered.request.task = 'Different input without a new preparation.';
    const inspect = await post('inspect', { artifact: tampered });
    assert.equal(inspect.status, 400);
    assert.match((await inspect.json()).error.message, /hash/);
    const draft = await post('draft', { prepared: tampered });
    assert.equal(draft.status, 400);
  });
});

test('UnitLab protects local operations with a session token and exact origin', async () => {
  await withLab(new FakeModel(), async (lab, post) => {
    const request = miraRequest();
    const unauthenticated = await fetch(`${lab.origin}/api/example`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, 'SESSION_REQUIRED');
    const foreign = await post(
      'prepare',
      { request },
      { headers: { Origin: 'https://example.org' } },
    );
    assert.equal(foreign.status, 403);
    const noOrigin = await post('prepare', { request }, { headers: { Origin: '' } });
    assert.equal(noOrigin.status, 403);
    const wrongToken = await post(
      'prepare',
      { request },
      { headers: { Authorization: 'Bearer wrong' } },
    );
    assert.equal(wrongToken.status, 401);
    const foreignHost = await new Promise<number | undefined>((resolve, reject) => {
      get(lab.origin, { headers: { Host: 'example.org' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).once('error', reject);
    });
    assert.equal(foreignHost, 403);
    const missing = await post('unknown', {});
    assert.equal(missing.status, 404);
    const traversal = await fetch(`${lab.origin}/client/..%2f..%2fpackage.json`);
    assert.equal(traversal.status, 404);
    const invalid = await fetch(`${lab.origin}/api/prepare`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lab.token}`,
        Origin: lab.origin,
        'Content-Type': 'application/json',
      },
      body: '{invalid',
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_JSON');
  });
});

test('UnitLab cancellation reaches the model and releases the single active model stage', async () => {
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  let cancelled!: () => void;
  const stopped = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  let calls = 0;
  const model: ModelClient = {
    id: 'test-cancellable',
    async generate({ signal }) {
      calls++;
      if (calls > 1) return miraCandidate();
      assert.ok(signal);
      started();
      return new Promise((_resolve, reject) => {
        const stop = () => {
          cancelled();
          reject(new Error('Cancelled test generation.'));
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      });
    },
  };
  await withLab(model, async (_lab, post) => {
    const prepared = await prepareRequest(miraRequest());
    const controller = new AbortController();
    const pending = post('draft', { prepared }, { signal: controller.signal });
    await Promise.race([
      running,
      delay(2_000).then(() => {
        throw new Error('Model did not start.');
      }),
    ]);
    const duplicate = await post('draft', { prepared });
    assert.equal(duplicate.status, 409);
    const aborted = assert.rejects(pending, /abort/i);
    controller.abort();
    await aborted;
    await Promise.race([
      stopped,
      delay(2_000).then(() => {
        throw new Error('Model did not stop.');
      }),
    ]);
    const retry = await artifact<DraftArtifact>(await post('draft', { prepared }));
    assert.equal(retry.kind, 'draft');
    assert.equal(calls, 2);
  });
});
