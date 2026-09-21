import assert from 'node:assert/strict';
import sharp from 'sharp';
import { test } from 'node:test';
import { ModelExecutionError } from '../src/core/model.js';
import { DEFAULT_IMAGE_MODEL, OpenRouterImageClient } from '../src/node/image-generation.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==',
  'base64',
);
const endpoint = {
  provider_tag: 'openai',
  supported_parameters: {
    quality: { type: 'enum', values: ['low', 'high'] },
    aspect_ratio: { type: 'enum', values: ['1:1'] },
    background: { type: 'enum', values: ['transparent'] },
    n: { type: 'range', min: 1, max: 10 },
  },
};
const usage = { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32, cost: 0.005 };
const success = { data: [{ b64_json: png.toString('base64'), media_type: 'image/png' }], usage };
function fixture(
  payload: unknown = success,
  status = 200,
  catalogue: unknown = { endpoints: [endpoint] },
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) });
    return Response.json(calls.length === 1 ? catalogue : payload, {
      status: calls.length === 1 ? 200 : status,
    });
  };
  return {
    client: new OpenRouterImageClient(
      { apiKey: 'secret', model: 'openai/gpt-image-1-mini' },
      fetcher,
    ),
    calls,
  };
}
function code(expected: string, cost?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.failure?.code, expected);
    if (cost !== undefined) assert.equal(error.usage?.costUsd, cost);
    assert.doesNotMatch(error.message, /secret|private provider message/);
    return true;
  };
}

test('image adapter preflights capabilities and requests exactly one PNG without fallback or redirects', async () => {
  const { client, calls } = fixture();
  assert.equal(calls.length, 0);
  const result = await client.generate('A square portrait');
  assert.equal((await sharp(result.png).metadata()).format, 'png');
  assert.deepEqual(await sharp(result.png).raw().toBuffer(), await sharp(png).raw().toBuffer());
  assert.equal(result.usage?.totalTokens, 32);
  assert.equal(result.usage?.costUsd, 0.005);
  assert.equal(client.model, 'openai/gpt-image-1-mini');
  assert.equal(
    calls[0]?.url,
    `https://openrouter.ai/api/v1/images/models/openai/gpt-image-1-mini/endpoints`,
  );
  assert.equal(calls[1]?.url, 'https://openrouter.ai/api/v1/images');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    model: 'openai/gpt-image-1-mini',
    prompt: 'A square portrait',
    n: 1,
    aspect_ratio: '1:1',
    quality: 'low',
    output_format: 'png',
    background: 'transparent',
    provider: { only: ['openai'], allow_fallbacks: false },
  });
  for (const call of calls) assert.equal(call.init?.redirect, 'error');
  assert.equal(calls.length, 2);
});

test('unsupported quality stops before the paid image request', async () => {
  const { client, calls } = fixture(success, 200, {
    endpoints: [
      {
        ...endpoint,
        supported_parameters: {
          ...endpoint.supported_parameters,
          quality: { type: 'enum', values: ['high'] },
        },
      },
    ],
  });
  await assert.rejects(client.generate('Portrait'), code('MODEL_UNAVAILABLE'));
  assert.equal(calls.length, 1);
});

test('optional transparency is omitted for an endpoint that does not support it', async () => {
  const { background: _, ...parameters } = endpoint.supported_parameters;
  const { client, calls } = fixture(success, 200, {
    endpoints: [{ ...endpoint, supported_parameters: parameters }],
  });
  await client.generate('Portrait');
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).background, undefined);
});

test('provider failure keeps reported charges, sanitizes messages and never retries', async () => {
  for (const status of [200, 402]) {
    const { client, calls } = fixture(
      { error: { code: 402, message: 'secret private provider message' }, usage },
      status,
    );
    await assert.rejects(client.generate('Portrait'), code('INSUFFICIENT_CREDITS', 0.005));
    assert.equal(calls.length, 2);
  }
});

test('invalid and unsupported outputs are rejected while known usage is retained', async () => {
  for (const data of [
    [{ url: 'https://example.com/image.png' }],
    [{ b64_json: Buffer.from('<svg/>').toString('base64'), media_type: 'image/svg+xml' }],
    [{ b64_json: '%%%=' }],
    [{ b64_json: 'aGVsbG8=' }],
    [
      {
        b64_json:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=',
      },
    ],
    [success.data[0], success.data[0]],
  ]) {
    const { client } = fixture({ data, usage });
    await assert.rejects(client.generate('Portrait'), code('MODEL_OUTPUT_INVALID', 0.005));
  }
});

test('image and response limits reject oversized outputs', async () => {
  const large = Buffer.alloc(8 * 1024 * 1024 + 1);
  png.copy(large);
  const { client } = fixture({ data: [{ b64_json: large.toString('base64') }], usage });
  await assert.rejects(client.generate('Portrait'), code('OUTPUT_LIMIT', 0.005));
  const oversized = new OpenRouterImageClient(
    { apiKey: 'secret' },
    async () => new Response('{}', { headers: { 'content-length': String(13 * 1024 * 1024) } }),
  );
  await assert.rejects(oversized.generate('Portrait'), code('OUTPUT_LIMIT'));
});

test('missing credentials and pre-aborted requests do not contact OpenRouter', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw new Error('secret');
  };
  await assert.rejects(
    new OpenRouterImageClient({ apiKey: '' }, fetcher).generate('Portrait'),
    code('AUTHENTICATION'),
  );
  await assert.rejects(
    new OpenRouterImageClient(
      { apiKey: 'secret', model: 'openai/gpt-image-1-mini' },
      fetcher,
    ).generate('Portrait', AbortSignal.abort()),
    code('CANCELLED'),
  );
  assert.equal(calls, 0);
});

test('cancellation interrupts even a stalled transport and network errors stay sanitized', async () => {
  const controller = new AbortController();
  const stalled = new OpenRouterImageClient(
    { apiKey: 'secret' },
    async () => new Promise(() => {}),
  );
  const pending = stalled.generate('Portrait', controller.signal);
  controller.abort();
  await assert.rejects(pending, code('CANCELLED'));
  const broken = new OpenRouterImageClient({ apiKey: 'secret' }, async () => {
    throw new Error('secret private provider message');
  });
  await assert.rejects(broken.generate('Portrait'), code('NETWORK_ERROR'));
});

test('a stalled provider is bounded by a 120 second deadline', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const client = new OpenRouterImageClient({ apiKey: 'secret' }, async () => new Promise(() => {}));
  const pending = client.generate('Portrait');
  context.mock.timers.tick(120_000);
  await assert.rejects(pending, code('LOCAL_TIMEOUT'));
});

const museCatalogue = {
  data: {
    architecture: { output_modalities: ['image'] },
    endpoints: [{ tag: 'meta' }],
  },
};
const museSuccess = success;
function museFixture(
  payload: unknown = museSuccess,
  catalogue: unknown = museCatalogue,
  status = 200,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new OpenRouterImageClient({ apiKey: 'secret' }, async (input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) });
    return Response.json(calls.length === 1 ? catalogue : payload, {
      status: calls.length === 1 ? 200 : status,
    });
  });
  return { client, calls };
}

test('Muse uses the required image API with one image, Meta pinned and no fallback', async () => {
  const { client, calls } = museFixture();
  const result = await client.generate('Portrait');
  assert.equal(DEFAULT_IMAGE_MODEL, 'meta/muse-image');
  assert.equal(client.model, DEFAULT_IMAGE_MODEL);
  assert.equal((await sharp(result.png).metadata()).format, 'png');
  assert.deepEqual(await sharp(result.png).raw().toBuffer(), await sharp(png).raw().toBuffer());
  assert.equal(result.usage?.costUsd, 0.005);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'https://openrouter.ai/api/v1/models/meta/muse-image/endpoints',
      'https://openrouter.ai/api/v1/images',
    ],
  );
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    model: 'meta/muse-image',
    prompt: 'Portrait\nReturn exactly one square image.',
    n: 1,
    provider: { only: ['meta'], allow_fallbacks: false },
  });
  for (const call of calls) assert.equal(call.init?.redirect, 'error');
});

test('Muse preflight rejects missing image capability or Meta provider before generation', async () => {
  for (const catalogue of [
    {},
    { data: { ...museCatalogue.data, endpoints: [] } },
    { data: { ...museCatalogue.data, architecture: { output_modalities: ['text'] } } },
  ]) {
    const { client, calls } = museFixture(museSuccess, catalogue);
    await assert.rejects(client.generate('Portrait'), code('MODEL_UNAVAILABLE'));
    assert.equal(calls.length, 1);
  }
});

test('Muse rejects remote URLs, other formats and missing or multiple images without losing usage', async () => {
  for (const data of [
    [],
    [{ url: 'https://example.com/image.png' }],
    [{ b64_json: 'aGVsbG8=', media_type: 'image/svg+xml' }],
    [{ b64_json: 'aGVsbG8=', media_type: 'image/png' }],
    [...museSuccess.data, ...museSuccess.data],
  ]) {
    const { client, calls } = museFixture({ data, usage });
    await assert.rejects(client.generate('Portrait'), code('MODEL_OUTPUT_INVALID', 0.005));
    assert.equal(calls.length, 2);
  }
});

test('Muse provider errors retain usage and do not retry another route', async () => {
  const { client, calls } = museFixture({
    error: { code: 402, message: 'secret private provider message' },
    usage,
  });
  await assert.rejects(client.generate('Portrait'), code('INSUFFICIENT_CREDITS', 0.005));
  assert.equal(calls.length, 2);
});

test('Muse converts JPEG and WebP pixels to PNG and rejects MIME mismatch', async () => {
  for (const format of ['jpeg', 'webp'] as const) {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#cc3300' },
    })
      [format]()
      .toBuffer();
    const payload = (mime: string) => ({
      data: [{ b64_json: bytes.toString('base64'), media_type: mime }],
      usage,
    });
    const { client } = museFixture(payload(`image/${format}`));
    const result = await client.generate('Portrait');
    const metadata = await sharp(result.png).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.hasAlpha, false);
    assert.deepEqual(await sharp(result.png).raw().toBuffer(), await sharp(bytes).raw().toBuffer());
    await assert.rejects(
      museFixture(payload('image/png')).client.generate('Portrait'),
      code('MODEL_OUTPUT_INVALID', 0.005),
    );
  }
});

test('image decoder rejects raster inputs beyond the pixel cap', async () => {
  const bytes = await sharp({
    create: { width: 4097, height: 4096, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();
  const { client } = museFixture({
    data: [{ b64_json: bytes.toString('base64'), media_type: 'image/png' }],
    usage,
  });
  await assert.rejects(client.generate('Portrait'), code('MODEL_OUTPUT_INVALID', 0.005));
});

test('Muse endpoint rejection explains availability without changing models or retrying', async () => {
  const { client, calls } = museFixture(
    { error: { code: 404, message: 'secret private provider message' }, usage },
    museCatalogue,
    404,
  );
  await assert.rejects(client.generate('Attack effect'), (error: unknown) => {
    assert.ok(code('MODEL_UNAVAILABLE', 0.005)(error));
    assert.ok(error instanceof ModelExecutionError);
    assert.match(error.message, /catalogue listing does not guarantee access/);
    assert.match(error.message, /Muse remains selected; no fallback was attempted/);
    assert.equal(error.failure?.providerCode, 404);
    assert.equal(error.failure?.httpStatus, 404);
    return true;
  });
  assert.equal(client.model, 'meta/muse-image');
  assert.equal(calls.length, 2);
});

test('Muse rejects the former chat image envelope and never tries a second route', async () => {
  const { client, calls } = museFixture({
    choices: [
      {
        message: {
          images: [{ image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }],
        },
      },
    ],
    usage,
  });
  await assert.rejects(client.generate('Attack'), code('MODEL_OUTPUT_INVALID', 0.005));
  assert.equal(calls.filter((call) => call.init?.method === 'POST').length, 1);
  assert.equal(calls[1]?.url, 'https://openrouter.ai/api/v1/images');
});
