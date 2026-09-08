import { createServer } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import {
  createHttpProvider,
  createCommandProvider,
  createProvidersFromEnv,
  createWikipediaDiscovery,
  supportsStructured
} from '../src/index.js';
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: { value: { type: 'integer', minimum: 2 } }
};
const call = {
  stage: 'draft',
  instructions: 'Return JSON.',
  input: {},
  schema,
  signal: new AbortController().signal,
  maxOutputTokens: 100,
  maxOutputBytes: 4096
};
async function server(
  response: unknown,
  run: (endpoint: string, requests: Record<string, unknown>[]) => Promise<void>
) {
  const requests: Record<string, unknown>[] = [];
  const app = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response));
  });
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  const address = app.address();
  if (!address || typeof address === 'string') throw Error('address');
  try {
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    app.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));
  }
}
describe('generic model transport', () => {
  it('passes a supported schema unchanged and preserves usage', async () => {
    await server(
      {
        choices: [{ finish_reason: 'stop', message: { content: '{"value":2}' } }],
        usage: { prompt_tokens: 23, completion_tokens: 8 }
      },
      async (endpoint, requests) => {
        const reply = await createHttpProvider({ endpoint, model: 'test' }).generate(call);
        expect(reply.value).toEqual({ value: 2 });
        expect(reply.usage).toEqual({ inputTokens: 23, outputTokens: 8 });
        expect(reply.mode).toBe('structured');
        expect(requests[0]).toMatchObject({ response_format: { json_schema: { schema } } });
      }
    );
  });
  it('uses explicit JSON fallback without dropping nulls or local references', async () => {
    const custom = {
      ...schema,
      $defs: { nullable: { type: ['integer', 'null'] } },
      properties: { value: { $ref: '#/$defs/nullable' } }
    };
    expect(supportsStructured(custom)).toBe(false);
    await server(
      { choices: [{ message: { content: '{"value":null}' } }] },
      async (endpoint, requests) => {
        const model = createHttpProvider({ endpoint, model: 'test' });
        const reply = await model.generate({ ...call, schema: custom });
        expect(reply.value).toEqual({ value: null });
        expect(reply.mode).toBe('json');
        expect(requests[0]?.response_format).toBeUndefined();
        await expect(
          model.generate({ ...call, schema: custom, requireStructured: true })
        ).rejects.toMatchObject({ code: 'schema-capability' });
        expect(requests).toHaveLength(1);
      }
    );
  });
  it('accepts a definition whose root output is an array', async () => {
    const custom = { type: 'array', items: { type: 'integer' }, minItems: 1 };
    await server(
      { choices: [{ finish_reason: 'stop', message: { content: '[1,2]' } }] },
      async (endpoint, requests) => {
        const reply = await createHttpProvider({ endpoint, model: 'test' }).generate({
          ...call,
          schema: custom
        });
        expect(reply.value).toEqual([1, 2]);
        expect(reply.mode).toBe('json');
        expect(JSON.stringify(requests)).toContain('selected schema');
        expect(requests[0]?.response_format).toBeUndefined();
      }
    );
  });
  it.each([
    [{ choices: [{ message: { refusal: 'private refusal' } }] }, 'refusal'],
    [
      { choices: [{ finish_reason: 'length', message: { content: 'private partial' } }] },
      'truncated'
    ],
    [{ choices: [{ message: { content: 'not JSON secret' } }] }, 'invalid-json']
  ])('returns safe errors without remote content', async (response, code) => {
    await server(response, async (endpoint) => {
      await expect(
        createHttpProvider({ endpoint, model: 'test' }).generate(call)
      ).rejects.toMatchObject({ code });
    });
  });
  it('runs a command without a shell and bounds timeout/output/cancellation', async () => {
    const options = {
      executable: process.execPath,
      args: [
        '-e',
        'process.stdin.resume(); process.stdin.on("end",()=>process.stdout.write(JSON.stringify({value:2})))'
      ],
      timeoutMs: 1000,
      maxOutputBytes: 4096
    };
    expect((await createCommandProvider(options).generate(call)).value).toEqual({ value: 2 });
    await expect(
      createCommandProvider({
        ...options,
        args: ['-e', 'setInterval(()=>{},1000)'],
        timeoutMs: 20
      }).generate(call)
    ).rejects.toMatchObject({ code: 'timeout' });
    await expect(
      createCommandProvider({
        ...options,
        args: ['-e', 'process.stdout.write("x".repeat(10000))'],
        maxOutputBytes: 10
      }).generate(call)
    ).rejects.toBeInstanceOf(Error);
    const controller = new AbortController();
    const promise = createCommandProvider({
      ...options,
      args: ['-e', 'setInterval(()=>{},1000)']
    }).generate({ ...call, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(Error);
  });
  it('publishes no credentials and rejects invalid command settings', () => {
    const configured = createProvidersFromEnv({
      UNIT_OPENAI_MODEL: 'test',
      UNIT_OPENAI_ENDPOINT: 'https://example.org',
      UNIT_OPENAI_API_KEY: 'secret'
    });
    expect(JSON.stringify(configured.descriptions)).not.toContain('secret');
    expect(() =>
      createProvidersFromEnv({
        UNIT_COMMAND_EXECUTABLE: 'test',
        UNIT_COMMAND_ARGS: '"shell string"'
      })
    ).toThrow();
  });
});
describe('name-to-source discovery', () => {
  it('uses a fixed public search endpoint and returns source candidates', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            query: {
              search: [{ title: 'Monkey D. Luffy', snippet: 'A <b>One Piece</b> character.' }]
            }
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    );
    const result = await createWikipediaDiscovery(fetcher as typeof fetch)('Monkey D. Luffy', {
      signal: call.signal,
      limit: 2
    });
    expect(result[0]?.url).toBe('https://en.wikipedia.org/wiki/Monkey_D._Luffy');
    expect(result[0]?.description).toBe('A One Piece character.');
    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.hostname).toBe('en.wikipedia.org');
    expect(url.searchParams.get('srsearch')).toBe('Monkey D. Luffy');
  });
  it('rejects unbounded or invalid discovery responses', async () => {
    for (const body of ['x'.repeat(256 * 1024 + 1), '{}'])
      await expect(
        createWikipediaDiscovery(async () => new Response(body))('Hero', {
          signal: call.signal,
          limit: 2
        })
      ).rejects.toBeInstanceOf(Error);
  });
});
