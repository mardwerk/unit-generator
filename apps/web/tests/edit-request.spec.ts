import { expect, test, type APIRequestContext } from '@playwright/test';
import { request as httpRequest } from 'node:http';
import { GENERATION_BODY_LIMIT, VALIDATION_BODY_LIMIT } from '../request-limits.mjs';

async function fixture(request: APIRequestContext, origin: string, input: unknown) {
  const response = await request.post('/api/run', {
    headers: { origin },
    data: { operation: 'generate', definition: 'classic-three-path', provider: 'fixture', input }
  });
  expect(response.status()).toBe(200);
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const result = events.find((event) => event.type === 'result')?.result;
  expect(result?.status).toBe('success');
  return result;
}

test('checks an edited result larger than the generation request limit without losing evidence', async ({
  request,
  baseURL
}) => {
  const sources = Array.from({ length: 4 }, (_, index) => ({
    id: `source-${index}`,
    title: `Escaped source text ${index}`,
    // Each source stays within the 256 KiB captured-text allowance. JSON escaping
    // makes retained input plus research exceed the old 4 MiB edit request limit.
    content: '"\\'.repeat(128 * 1024),
    origin: 'supplied',
    status: 'read',
    truncated: false,
    omissions: []
  }));
  const input = { subject: 'Retained source fixture', kind: 'original', sources };
  expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(GENERATION_BODY_LIMIT);
  const original = await fixture(request, baseURL!, input);
  expect(Buffer.byteLength(JSON.stringify(original))).toBeGreaterThan(GENERATION_BODY_LIMIT);
  const candidate = { ...original.output, name: 'Edited retained source fixture' };
  const response = await request.post('/api/validate', {
    headers: { origin: baseURL! },
    data: { definition: 'classic-three-path', original, candidate, provider: 'fixture' }
  });
  expect(response.status()).toBe(200);
  const checked = await response.json();
  expect(checked.status).toBe('success');
  expect(checked.output).toEqual(candidate);
  expect(checked.input).toEqual(original.input);
  expect(checked.research).toEqual(original.research);
  expect(checked.metadata).toEqual(original.metadata);
  expect(checked.candidate).toBeUndefined();
  expect(checked.edited).toBe(true);
});

test('rejects malformed retained envelopes and missing candidates before checking', async ({
  request,
  baseURL
}) => {
  const original = await fixture(request, baseURL!, {
    subject: 'Envelope validation fixture',
    kind: 'original'
  });
  for (const malformed of [
    null,
    [],
    { ...original, definition: null },
    { ...original, research: undefined },
    { ...original, research: null },
    { ...original, research: [null] },
    { ...original, research: [{ ...original.research[0], sources: [null] }] },
    { ...original, metadata: { calls: null } }
  ]) {
    const response = await request.post('/api/validate', {
      headers: { origin: baseURL! },
      data: {
        definition: 'classic-three-path',
        original: malformed,
        candidate: original.output,
        provider: 'fixture'
      }
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toContain('Invalid original result:');
  }
  const missing = await request.post('/api/validate', {
    headers: { origin: baseURL! },
    data: { definition: 'classic-three-path', original }
  });
  expect(missing.status()).toBe(400);
  expect((await missing.json()).message).toContain('candidate is required');

  // JSON null is present content, not a missing field. Candidate rules decide its validity.
  const invalid = await request.post('/api/validate', {
    headers: { origin: baseURL! },
    data: { definition: 'classic-three-path', original, candidate: null }
  });
  expect(invalid.status()).toBe(200);
  expect((await invalid.json()).status).toBe('failed');
});

test('keeps both generation and validation request sizes bounded', async ({ request, baseURL }) => {
  for (const [route, bytes] of [
    ['/api/run', GENERATION_BODY_LIMIT],
    ['/api/validate', VALIDATION_BODY_LIMIT]
  ] as const) {
    const response = await request.post(route, {
      headers: { origin: baseURL! },
      data: { padding: 'x'.repeat(bytes) }
    });
    expect(response.status()).toBe(413);
  }
});

test('returns 413 for oversized streamed input without closing the response socket', async ({
  baseURL
}) => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      new URL('/api/run', baseURL),
      {
        method: 'POST',
        headers: {
          origin: baseURL!,
          'content-type': 'application/json',
          'transfer-encoding': 'chunked'
        }
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
        response.on('error', reject);
      }
    );
    request.on('error', reject);
    request.end(JSON.stringify({ padding: 'x'.repeat(GENERATION_BODY_LIMIT) }));
  });
  expect(status).toBe(413);
});
