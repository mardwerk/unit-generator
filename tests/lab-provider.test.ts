import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LabProvider } from '../src/lab/providers.js';
import { startLab } from '../src/lab/server.js';
import {
  checkDraft,
  draftUnit,
  prepareRequest,
  ModelExecutionError,
  type ModelFailure,
  type ModelResponse,
} from '../src/core/index.js';
import { FakeModel, miraRequest, miraReview } from './fixtures/core-fixtures.js';
import { api, LabApiError } from '../src/lab/client/api.js';

test('local provider settings retain keys without returning or serializing them', () => {
  const provider = new LabProvider({ provider: 'openrouter', apiKey: 'test-private-key' });
  assert.equal(provider.state.model, 'openrouter/free');
  assert.equal(provider.state.ready, true);
  assert.equal(provider.client.id, 'openrouter:openrouter/free');
  assert.ok(!JSON.stringify(provider).includes('test-private-key'));
  assert.ok(!JSON.stringify(provider.state).includes('test-private-key'));
  provider.configure({ provider: 'codex' });
  assert.match(provider.client.id, /^codex:/);
  provider.configure({ provider: 'openrouter' });
  assert.equal(provider.state.ready, true);
  assert.throws(() => provider.configure({ provider: 'unknown' }));
  assert.throws(() =>
    provider.configure({ provider: 'openrouter', model: 'secret/test-private-key' }),
  );
  assert.equal(provider.state.model, 'openrouter/free');
});

test('missing OpenRouter credentials allow startup but require setup before a model call', async () => {
  // Empty local environment is explicit and restored before asynchronous work.
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  let provider: LabProvider;
  try {
    provider = new LabProvider();
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
  assert.equal(provider.state.ready, false);
  await assert.rejects(provider.client.generate({ system: '', prompt: '', schema: {} }), /API key/);
  const lab = await startLab({ provider, example: miraRequest(), port: 0 });
  try {
    const response = await fetch(`${lab.origin}/api/draft`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lab.token}`,
        Origin: lab.origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prepared: await prepareRequest(miraRequest()) }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'PROVIDER_REQUIRED');
  } finally {
    await lab.close();
  }
});

test('Lab character and provider endpoints share local authentication and structured inputs', async () => {
  const expected = await prepareRequest(miraRequest());
  const calls: unknown[] = [];
  const lab = await startLab({
    provider: new LabProvider({ provider: 'codex' }),
    example: miraRequest(),
    port: 0,
    characterLookup: async (name, options) => {
      calls.push({ name, choice: options?.choice, hasSignal: Boolean(options?.signal) });
      return expected;
    },
  });
  const headers = {
    Authorization: `Bearer ${lab.token}`,
    Origin: lab.origin,
    'Content-Type': 'application/json',
  };
  const post = (operation: string, body: unknown) =>
    fetch(`${lab.origin}/api/${operation}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${lab.origin}/api/provider`)).status, 401);
    const response = await post('character', { name: 'Mira', choice: 123 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    assert.deepEqual(calls, [{ name: 'Mira', choice: 123, hasSignal: true }]);
    assert.equal((await post('character', { name: '', choice: -1 })).status, 400);
    assert.equal((await post('character', { name: 'Mira', file: '/etc/passwd' })).status, 400);
    assert.equal(calls.length, 1);
    const configured = await post('provider', { provider: 'openrouter', apiKey: 'session-secret' });
    assert.equal(configured.status, 200);
    const state = await configured.json();
    assert.equal(state.ready, true);
    assert.equal(state.model, 'openrouter/free');
    assert.ok(!JSON.stringify(state).includes('session-secret'));
    const read = await fetch(`${lab.origin}/api/provider`, { headers });
    assert.deepEqual(await read.json(), state);
    const foreign = await fetch(`${lab.origin}/api/provider`, {
      method: 'POST',
      headers: { ...headers, Origin: 'https://example.org' },
      body: JSON.stringify({ provider: 'codex' }),
    });
    assert.equal(foreign.status, 403);
  } finally {
    await lab.close();
  }
});

test('failed Lab model calls return known usage without exposing provider secrets', async () => {
  const usage = {
    inputTokens: 300,
    outputTokens: 20,
    totalTokens: 320,
    reasoningTokens: null,
    cachedInputTokens: null,
    costUsd: 0.005,
    actualModel: 'test/model',
    provider: null,
    generationId: 'test-generation',
  };
  const lab = await startLab({
    model: {
      id: 'test/model',
      async generate() {
        throw new ModelExecutionError('Invalid model response.', usage);
      },
    },
    example: miraRequest(),
    port: 0,
  });
  try {
    const response = await fetch(`${lab.origin}/api/draft`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lab.token}`,
        Origin: lab.origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prepared: await prepareRequest(miraRequest()) }),
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.deepEqual(body.error.usage, usage);
    assert.equal(body.error.code, 'MODEL_FAILED');
  } finally {
    await lab.close();
  }
});

test('Lab preserves safe provider failure details and usage through draft and review stages', async () => {
  const usage = {
    inputTokens: 20,
    outputTokens: 4,
    totalTokens: 24,
    reasoningTokens: null,
    cachedInputTokens: null,
    costUsd: 0.0001,
    actualModel: 'test/model',
    provider: null,
    generationId: 'reported-failure',
  };
  const prepared = await prepareRequest(miraRequest());
  const checked = await checkDraft(await draftUnit(prepared, new FakeModel()));
  let failure: ModelFailure = {
    code: 'LOCAL_TIMEOUT',
    message: 'Safe timeout.',
    timeoutMs: 120000,
  };
  const lab = await startLab({
    model: {
      id: 'test/model',
      async generate() {
        throw new ModelExecutionError('RAW_PROVIDER_TEXT PRIVATE_API_KEY', usage, {
          failure,
          cause: new Error('PRIVATE_SOURCE_TEXT'),
        });
      },
    },
    example: miraRequest(),
    port: 0,
  });
  try {
    const failures: ModelFailure[] = [
      failure,
      {
        code: 'RATE_LIMIT',
        message: 'Safe rate limit.',
        provider: 'OpenRouter',
        httpStatus: 200,
        providerCode: 429,
        retryAfterSeconds: 18,
      },
      {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Safe account balance failure.',
        provider: 'OpenRouter',
        httpStatus: 402,
        providerCode: 402,
      },
      {
        code: 'MODEL_UNAVAILABLE',
        message: 'Safe unavailable model.',
        provider: 'OpenRouter',
        httpStatus: 503,
        providerCode: 503,
      },
    ];
    for (const selected of failures) {
      failure = selected;
      for (const stage of ['draft', 'review'] as const) {
        const response = await fetch(`${lab.origin}/api/${stage}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lab.token}`,
            Origin: lab.origin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(stage === 'draft' ? { prepared } : { checked }),
        });
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.deepEqual(body.error, {
          code: failure.code,
          message: failure.message,
          details: { ...failure, stage },
          usage,
        });
        assert.doesNotMatch(
          JSON.stringify(body),
          /RAW_PROVIDER_TEXT|PRIVATE_API_KEY|PRIVATE_SOURCE_TEXT/,
        );
      }
    }
  } finally {
    await lab.close();
  }
});

test('Lab invalid model output and unclassified executor failures never return raw model text', async () => {
  const usage = {
    inputTokens: 40,
    outputTokens: 10,
    totalTokens: 50,
    reasoningTokens: null,
    cachedInputTokens: null,
    costUsd: 0.002,
    actualModel: 'test/model',
    provider: null,
    generationId: 'invalid-output',
  };
  const prepared = await prepareRequest(miraRequest());
  const checked = await checkDraft(await draftUnit(prepared, new FakeModel()));
  let result: ModelResponse | Error = {
    output: { PRIVATE_MODEL_TEXT: 'PRIVATE_SOURCE_TEXT' },
    usage,
  };
  const lab = await startLab({
    model: {
      id: 'test/model',
      async generate() {
        if (result instanceof Error) throw result;
        return result;
      },
    },
    example: miraRequest(),
    port: 0,
  });
  try {
    for (const stage of ['draft', 'review'] as const) {
      for (const malformed of [true, false]) {
        result = malformed
          ? { output: { PRIVATE_MODEL_TEXT: 'PRIVATE_SOURCE_TEXT' }, usage }
          : new Error('PRIVATE_API_KEY RAW_PROVIDER_TEXT');
        const response = await fetch(`${lab.origin}/api/${stage}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lab.token}`,
            Origin: lab.origin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(stage === 'draft' ? { prepared } : { checked }),
        });
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.equal(body.error.code, malformed ? 'MODEL_OUTPUT_INVALID' : 'MODEL_FAILED');
        assert.equal(body.error.details.stage, stage);
        assert.deepEqual(body.error.usage, malformed ? usage : undefined);
        assert.doesNotMatch(
          JSON.stringify(body),
          /PRIVATE_MODEL_TEXT|PRIVATE_SOURCE_TEXT|PRIVATE_API_KEY|RAW_PROVIDER_TEXT/,
        );
      }
    }
    for (const invalidKind of ['finding-id', 'evidence'] as const) {
      const review = miraReview();
      if (invalidKind === 'finding-id') review.findings[0]!.id = 'PRIVATE_MODEL_TEXT';
      else review.findings[0]!.evidence = ['PRIVATE_SOURCE_TEXT'];
      result = { output: review, usage };
      const response = await fetch(`${lab.origin}/api/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lab.token}`,
          Origin: lab.origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ checked }),
      });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.error.code, 'MODEL_OUTPUT_INVALID');
      assert.equal(body.error.details.stage, 'review');
      assert.deepEqual(body.error.usage, usage);
      assert.doesNotMatch(JSON.stringify(body), /PRIVATE_MODEL_TEXT|PRIVATE_SOURCE_TEXT/);
    }
  } finally {
    await lab.close();
  }
});

test('browser API errors retain structured model facts and distinguish local connection failures', async (t) => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { querySelector: () => ({ content: 'local-session-token' }) },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const details: ModelFailure = {
    code: 'RATE_LIMIT',
    message: 'OpenRouter rate limit reached.',
    stage: 'draft',
    provider: 'OpenRouter',
    httpStatus: 200,
    providerCode: 429,
    retryAfterSeconds: 14,
  };
  const usage = {
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    reasoningTokens: null,
    cachedInputTokens: null,
    costUsd: 0,
    actualModel: null,
    provider: null,
    generationId: null,
  };
  const fetcher = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      {
        error: { code: details.code, message: details.message, details, usage },
      },
      { status: 502 },
    ),
  );
  await assert.rejects(api('draft', {}), (error) => {
    assert.ok(error instanceof LabApiError);
    assert.equal(error.code, 'RATE_LIMIT');
    assert.equal(error.message, details.message);
    assert.deepEqual(error.details, details);
    assert.deepEqual(error.usage, usage);
    return true;
  });
  fetcher.mock.mockImplementation(async () => {
    throw new Error('PRIVATE_TRANSPORT_TEXT');
  });
  await assert.rejects(api('draft', {}), (error) => {
    assert.ok(error instanceof LabApiError);
    assert.equal(error.code, 'SERVER_UNREACHABLE');
    assert.equal(error.details, undefined);
    assert.equal(error.usage, undefined);
    assert.doesNotMatch(error.message, /PRIVATE_TRANSPORT_TEXT/);
    return true;
  });
  fetcher.mock.mockImplementation(async () => new Response('PRIVATE_SERVER_TEXT', { status: 502 }));
  await assert.rejects(api('draft', {}), (error) => {
    assert.ok(error instanceof LabApiError);
    assert.equal(error.code, 'INVALID_SERVER_RESPONSE');
    assert.doesNotMatch(error.message, /PRIVATE_SERVER_TEXT/);
    return true;
  });
});
