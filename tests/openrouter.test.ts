import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fetcher } from '@openrouter/sdk';
import { OpenRouterModelClient, OPENROUTER_FREE_MODEL } from '../src/node/openrouter.js';
import { ModelExecutionError } from '../src/core/index.js';
import { retryAfter } from '../src/node/openrouter-errors.js';

const request = {
  system: 'Use only supplied evidence.',
  prompt: 'SOURCE_PRIVATE_TEXT',
  schema: {
    type: 'object',
    properties: { role: { type: 'string' } },
    required: ['role'],
    additionalProperties: false,
  },
};
const apiKey = 'TEST_SECRET_KEY';

function completion(content = '{"role":"support"}', finishReason = 'stop', refusal?: string) {
  return Response.json({
    id: 'test-completion',
    created: 1,
    model: 'provider/selected:free',
    object: 'chat.completion',
    system_fingerprint: null,
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        message: { role: 'assistant', content, ...(refusal ? { refusal } : {}) },
      },
    ],
  });
}

test('OpenRouter uses the official SDK with authenticated, strictly structured free routing', async () => {
  let calls = 0;
  const fetcher: Fetcher = async (input, init) => {
    calls++;
    const sent = new Request(input, init);
    assert.equal(sent.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(sent.headers.get('authorization'), `Bearer ${apiKey}`);
    assert.equal(sent.headers.get('x-openrouter-title'), 'mardwerk-unit');
    const body = await sent.json();
    assert.equal(body.model, OPENROUTER_FREE_MODEL);
    assert.equal(body.stream, false);
    assert.deepEqual(body.reasoning, { effort: 'none' });
    assert.deepEqual(body.messages, [
      { role: 'system', content: request.system },
      { role: 'user', content: request.prompt },
    ]);
    assert.deepEqual(body.response_format, {
      type: 'json_schema',
      json_schema: { name: 'unit_result', strict: true, schema: request.schema },
    });
    assert.deepEqual(body.provider, {
      require_parameters: true,
      max_price: { prompt: '0', completion: '0', request: '0' },
    });
    assert.equal(body.models, undefined);
    assert.equal(body.plugins, undefined);
    assert.equal(body.tools, undefined);
    return completion();
  };
  const client = new OpenRouterModelClient({ apiKey }, fetcher);
  assert.equal(client.id, 'openrouter:openrouter/free');
  const response = await client.generate(request);
  assert.deepEqual(response.output, { role: 'support' });
  assert.equal(response.usage?.costUsd, null);
  assert.equal(response.usage?.inputTokens, null);
  assert.equal(response.usage?.actualModel, 'provider/selected:free');
  assert.equal(response.usage?.generationId, 'test-completion');
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(client), /TEST_SECRET_KEY|SOURCE_PRIVATE_TEXT/);
});

test('OpenRouter supports explicit model selection without a fallback list', async () => {
  for (const model of ['provider/chosen:free', 'provider/explicit-paid']) {
    const client = new OpenRouterModelClient({ apiKey, model }, async (input, init) => {
      const body = await new Request(input, init).json();
      assert.equal(body.model, model);
      assert.equal(body.models, undefined);
      assert.equal(Boolean(body.provider.max_price), model.endsWith(':free'));
      return completion();
    });
    assert.equal(client.id, `openrouter:${model}`);
    await client.generate(request);
  }
});

test('OpenRouter reasoning can be configured with explicit settings taking precedence', async () => {
  const previous = process.env.OPENROUTER_REASONING;
  process.env.OPENROUTER_REASONING = 'low';
  try {
    for (const override of [undefined, 'high'] as const) {
      const client = new OpenRouterModelClient(
        { apiKey, ...(override ? { reasoningEffort: override } : {}) },
        async (input, init) => {
          const body = await new Request(input, init).json();
          assert.deepEqual(body.reasoning, { effort: override ?? 'low' });
          return completion();
        },
      );
      await client.generate(request);
    }
    process.env.OPENROUTER_REASONING = 'invalid-private-setting';
    assert.throws(
      () => new OpenRouterModelClient({ apiKey }),
      /^Error: OpenRouter reasoning must be none, low, medium or high\.$/,
    );
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_REASONING;
    else process.env.OPENROUTER_REASONING = previous;
  }
});

test('OpenRouter retains exact reported usage, including zero cost and reasoning/cache subsets', async () => {
  for (const cost of [0, 0.0000004, 0.052]) {
    const client = new OpenRouterModelClient({ apiKey }, async () => {
      const payload = await completion().json();
      payload.usage = {
        prompt_tokens: 1200,
        completion_tokens: 300,
        total_tokens: 1500,
        completion_tokens_details: { reasoning_tokens: 80 },
        prompt_tokens_details: { cached_tokens: 1000 },
        cost,
      };
      return Response.json(payload);
    });
    const response = await client.generate(request);
    assert.deepEqual(response.usage, {
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      reasoningTokens: 80,
      cachedInputTokens: 1000,
      costUsd: cost,
      actualModel: 'provider/selected:free',
      provider: null,
      generationId: 'test-completion',
    });
  }
});

test('OpenRouter retains reported charges when completed text is invalid JSON', async () => {
  const client = new OpenRouterModelClient({ apiKey }, async () => {
    const payload = await completion('not valid JSON').json();
    payload.usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.001 };
    return Response.json(payload);
  });
  await assert.rejects(client.generate(request), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.usage?.costUsd, 0.001);
    assert.equal(error.usage?.totalTokens, 120);
    assert.equal(error.usage?.generationId, 'test-completion');
    assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
    assert.doesNotMatch(error.message, /not valid JSON|TEST_SECRET_KEY/);
    return true;
  });
});

test('OpenRouter reads the server environment key and rejects missing auth before network access', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  try {
    process.env.OPENROUTER_API_KEY = apiKey;
    await new OpenRouterModelClient({}, async (input, init) => {
      assert.equal(new Request(input, init).headers.get('authorization'), `Bearer ${apiKey}`);
      return completion();
    }).generate(request);
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(
      new OpenRouterModelClient({}, async () => assert.fail('No network without a key')).generate(
        request,
      ),
      /needs an API key/,
    );
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('OpenRouter sanitizes provider failures, does not retry and overrides SDK debug logging', async (t) => {
  const previousDebug = process.env.OPENROUTER_DEBUG;
  const previousURL = process.env.OPENROUTER_BASE_URL;
  process.env.OPENROUTER_DEBUG = 'true';
  process.env.OPENROUTER_BASE_URL = 'https://untrusted.invalid';
  const log = t.mock.method(console, 'log', () => {});
  try {
    for (const [status, expected] of [
      [401, /authentication failed/],
      [429, /rate limit reached/],
      [503, /no available endpoint/],
      [200, /No fallback model/],
    ] as const) {
      let calls = 0;
      await assert.rejects(
        new OpenRouterModelClient({ apiKey }, async (input, init) => {
          calls++;
          assert.equal(
            new Request(input, init).url,
            'https://openrouter.ai/api/v1/chat/completions',
          );
          return new Response('TEST_SECRET_KEY SOURCE_PRIVATE_TEXT PROVIDER_PRIVATE_TEXT', {
            status,
          });
        }).generate(request),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, expected);
          assert.doesNotMatch(
            error.stack!,
            /TEST_SECRET_KEY|SOURCE_PRIVATE_TEXT|PROVIDER_PRIVATE_TEXT/,
          );
          assert.equal(error.cause, undefined);
          return true;
        },
      );
      assert.equal(calls, 1);
    }
    assert.equal(log.mock.callCount(), 0);
  } finally {
    if (previousDebug === undefined) delete process.env.OPENROUTER_DEBUG;
    else process.env.OPENROUTER_DEBUG = previousDebug;
    if (previousURL === undefined) delete process.env.OPENROUTER_BASE_URL;
    else process.env.OPENROUTER_BASE_URL = previousURL;
  }
});

test('OpenRouter rejects invalid, incomplete, refused and oversized responses without content leaks', async () => {
  for (const [response, expected] of [
    [completion('MODEL_PRIVATE_TEXT'), /invalid JSON/],
    [completion(''), /structured final response/],
    [completion('{}', 'length'), /output token limit/],
    [completion('{}', 'stop', 'MODEL_PRIVATE_REFUSAL'), /declined/],
  ] as const) {
    await assert.rejects(
      new OpenRouterModelClient({ apiKey }, async () => response).generate(request),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /MODEL_PRIVATE/);
        return true;
      },
    );
  }
  let cancelled = false;
  await assert.rejects(
    new OpenRouterModelClient({ apiKey, maxOutputBytes: 100 }, async () => {
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(101));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    }).generate(request),
    /output limit/,
  );
  assert.equal(cancelled, true);
});

test('OpenRouter identifies nested grammar rejections without leaking upstream text', async () => {
  let calls = 0;
  const client = new OpenRouterModelClient({ apiKey }, async () => {
    calls++;
    return Response.json(
      {
        error: {
          message: 'Provider returned error',
          code: 400,
          metadata: {
            raw: JSON.stringify({
              error: {
                message: 'The compiled grammar is too large. TEST_SECRET_KEY SOURCE_PRIVATE_TEXT',
              },
            }),
          },
        },
      },
      { status: 400 },
    );
  });
  await assert.rejects(client.generate(request), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.failure?.code, 'REQUEST_REJECTED');
    assert.match(error.message, /output format as too complex/);
    assert.doesNotMatch(error.stack!, /TEST_SECRET_KEY|SOURCE_PRIVATE_TEXT/);
    return true;
  });
  assert.equal(calls, 1);
});

test('OpenRouter cancellation and timeout abort HTTP requests and bound stalled transports', async () => {
  let transportSignal: AbortSignal | undefined;
  const stalled: Fetcher = async (input, init) => {
    transportSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return new Promise<Response>(() => {});
  };
  await assert.rejects(
    new OpenRouterModelClient({ apiKey, timeoutMs: 30 }, stalled).generate(request),
    (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'LOCAL_TIMEOUT');
      assert.equal(error.failure?.timeoutMs, 30);
      assert.equal(error.failure?.httpStatus, undefined);
      assert.match(error.message, /app's 0.03-second limit/);
      return true;
    },
  );
  assert.equal(transportSignal?.aborted, true);
  const controller = new AbortController();
  const pending = new OpenRouterModelClient({ apiKey }, stalled).generate({
    ...request,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort('PRIVATE_ABORT_REASON'), 30);
  await assert.rejects(pending, /cancelled/);
  assert.equal(transportSignal?.aborted, true);
  await assert.rejects(
    new OpenRouterModelClient({ apiKey }, async () => assert.fail('Already aborted')).generate({
      ...request,
      signal: AbortSignal.abort('PRIVATE_ABORT_REASON'),
    }),
    /cancelled/,
  );
});

test('OpenRouter rejects invalid configuration without echoing it', () => {
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: Infinity },
    { timeoutMs: 2 ** 31 },
    { maxOutputBytes: -1 },
    { model: 'PRIVATE INVALID MODEL' },
    { model: `provider/${apiKey}`, apiKey },
  ]) {
    assert.throws(
      () => new OpenRouterModelClient(options),
      (error) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, /PRIVATE INVALID MODEL|TEST_SECRET_KEY/);
        return true;
      },
    );
  }
});

test('OpenRouter classifies provider statuses and HTTP 200 error envelopes without raw details', async () => {
  for (const [status, providerCode, expected] of [
    [429, 429, 'RATE_LIMIT'],
    [402, 402, 'INSUFFICIENT_CREDITS'],
    [503, 503, 'MODEL_UNAVAILABLE'],
    [504, 504, 'PROVIDER_TIMEOUT'],
    [200, '429', 'RATE_LIMIT'],
    [200, 402, 'INSUFFICIENT_CREDITS'],
    [200, 503, 'MODEL_UNAVAILABLE'],
    [400, 400, 'CONTEXT_LIMIT'],
  ] as const) {
    let calls = 0;
    const client = new OpenRouterModelClient({ apiKey }, async () => {
      calls++;
      return Response.json(
        {
          error: {
            code: providerCode,
            message: 'maximum context length exceeded TEST_SECRET_KEY SOURCE_PRIVATE_TEXT',
            metadata: { raw: 'PROVIDER_PRIVATE_TEXT', authorization: apiKey },
          },
        },
        { status, headers: { 'retry-after': '12.2' } },
      );
    });
    await assert.rejects(client.generate(request), (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, expected);
      assert.equal(error.failure?.provider, 'OpenRouter');
      assert.equal(error.failure?.httpStatus, status);
      assert.equal(error.failure?.providerCode, Number(providerCode));
      assert.equal(error.failure?.retryAfterSeconds, 13);
      assert.equal(error.failure?.timeoutMs, undefined);
      assert.doesNotMatch(
        `${error.stack} ${JSON.stringify(error)}`,
        /TEST_SECRET_KEY|SOURCE_PRIVATE_TEXT|PROVIDER_PRIVATE_TEXT/,
      );
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('OpenRouter retains valid reported usage on error envelopes, including HTTP 200', async () => {
  for (const status of [200, 429]) {
    const client = new OpenRouterModelClient({ apiKey }, async () =>
      Response.json(
        {
          id: 'charged-failure',
          model: 'provider/selected:free',
          error: { code: 429, message: 'PROVIDER_PRIVATE_TEXT' },
          usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15, cost: 0.0002 },
        },
        { status },
      ),
    );
    await assert.rejects(client.generate(request), (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'RATE_LIMIT');
      assert.equal(error.usage?.costUsd, 0.0002);
      assert.equal(error.usage?.totalTokens, 15);
      assert.equal(error.usage?.generationId, null);
      assert.equal(error.usage?.actualModel, null);
      assert.doesNotMatch(JSON.stringify(error), /PROVIDER_PRIVATE_TEXT/);
      return true;
    });
  }
});

test('OpenRouter distinguishes network failure from received provider rejection', async () => {
  await assert.rejects(
    new OpenRouterModelClient({ apiKey }, async () => {
      throw new Error('TEST_SECRET_KEY SOURCE_PRIVATE_TEXT PROVIDER_PRIVATE_TEXT');
    }).generate(request),
    (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'NETWORK_ERROR');
      assert.equal(error.failure?.httpStatus, undefined);
      assert.equal(error.usage, undefined);
      assert.doesNotMatch(
        `${error.stack} ${JSON.stringify(error)}`,
        /TEST_SECRET_KEY|SOURCE_PRIVATE_TEXT|PROVIDER_PRIVATE_TEXT/,
      );
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test('retry-after accepts seconds and HTTP dates while rejecting expired or malformed values', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(retryAfter(' 12.2 ', now), 13);
  assert.equal(retryAfter('Sun, 20 Sep 2026 12:00:20 GMT', now), 20);
  assert.equal(retryAfter('Sun, 20 Sep 2026 11:59:59 GMT', now), undefined);
  assert.equal(retryAfter('PRIVATE_HEADER_TEXT', now), undefined);
  assert.equal(retryAfter(null, now), undefined);
});

test('provider usage identifiers cannot retain echoed credentials or oversized metadata', async () => {
  for (const unsafe of [apiKey, `echo:${apiKey}`, 'x'.repeat(257)]) {
    const client = new OpenRouterModelClient({ apiKey }, async () => {
      const payload = await completion().json();
      payload.id = unsafe;
      payload.model = unsafe;
      return Response.json(payload);
    });
    const result = await client.generate(request);
    assert.equal(result.usage?.actualModel, null);
    assert.equal(result.usage?.generationId, null);
    assert.ok(!JSON.stringify(result.usage).includes(apiKey));
  }
});
