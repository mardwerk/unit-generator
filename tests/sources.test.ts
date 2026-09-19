import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadDocument } from '../src/node/sources.js';
test('supplied evidence preserves attribution without claiming retrieval', async () => {
  const document = await loadDocument(
    {
      id: 'source',
      kind: 'source',
      text: '  He stretches. ',
      sourceUrl: 'https://example.test/character',
    },
    '.',
  );
  assert.equal(document.text, 'He stretches.');
  assert.equal(document.origin.access, 'supplied');
  assert.equal(document.origin.location, 'https://example.test/character');
  assert.match(document.origin.note!, /not retrieved or independently verified/);
  await assert.rejects(
    loadDocument(
      {
        id: 'source',
        kind: 'source',
        text: 'x',
        file: 'x',
      },
      '.',
    ),
    /exactly one/,
  );
  await assert.rejects(
    loadDocument(
      {
        id: 'source',
        kind: 'source',
        text: 'x',
        sourceUrl: 'file:///etc/passwd',
      },
      '.',
    ),
    /HTTP or HTTPS/,
  );
  await assert.rejects(
    loadDocument(
      {
        id: 'source',
        kind: 'source',
        text: 'ééé',
      },
      '.',
      { maxBytes: 5 },
    ),
    /byte limit/,
  );
});
test('relative files and saved Fandom HTML become readable source text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unit-source-test-'));
  try {
    await writeFile(
      join(directory, 'article.html'),
      '<!doctype html><html><body><nav>Site links</nav><div ' +
        'class="mw-parser-output"><h2>Abilities</h2><p>Rubber &amp; ' +
        'speed.</p><script>bad()</script><div class="navbox">Other ' +
        'pages</div></div><footer>Ads</footer></body></html>',
    );
    const document = await loadDocument(
      {
        id: 'wiki',
        kind: 'source',
        file: 'article.html',
        sourceUrl: 'https://onepiece.fandom.com/wiki/Monkey_D._Luffy',
      },
      directory,
    );
    assert.equal(document.text, 'Abilities\nRubber & speed.');
    assert.equal(document.origin.access, 'local-file');
    assert.match(document.origin.note!, /not retrieved/);
    await assert.rejects(
      loadDocument(
        {
          id: 'missing',
          kind: 'rules',
          file: 'missing.txt',
        },
        directory,
      ),
      /referenced file could not be read/,
    );
    await assert.rejects(
      loadDocument(
        {
          id: 'large',
          kind: 'rules',
          file: 'article.html',
        },
        directory,
        { maxBytes: 10 },
      ),
      /byte limit/,
    );
    await writeFile(
      join(directory, 'challenge.html'),
      '<html><head><title>Just a moment...</title></head><body>Enable cookies</body></html>',
    );
    await assert.rejects(
      loadDocument(
        {
          id: 'blocked',
          kind: 'source',
          file: 'challenge.html',
        },
        directory,
      ),
      /access challenge/,
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});
test('HTTP retrieval handles redirects, challenges, failures, byte bounds and timeout', async () => {
  const server = createServer((request, response) => {
    switch (request.url) {
      case '/redirect':
        response.writeHead(302, { location: '/article' });
        response.end();
        break;
      case '/article':
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(
          '<html><body><nav>Noise</nav><article><h1>Character</h1><p>A usable ' +
            'fact.</p></article></body></html>',
        );
        break;
      case '/blocked':
        response.writeHead(403);
        response.end('denied');
        break;
      case '/challenge':
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<title>Access Denied</title><main>Cloudflare challenge</main>');
        break;
      case '/large':
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('x'.repeat(200));
        break;
      case '/slow':
        break;
      case '/binary':
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end('binary');
        break;
      case '/badredirect':
        response.writeHead(302, { location: 'file:///etc/passwd' });
        response.end();
        break;
      default:
        response.writeHead(404);
        response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const spec = (path: string) => ({
    id: 'http',
    kind: 'source' as const,
    url: `${base}${path}`,
  });
  try {
    const document = await loadDocument(spec('/redirect'), '.');
    assert.equal(document.text, 'Character\nA usable fact.');
    assert.equal(document.origin.access, 'retrieved');
    assert.equal(document.origin.location, `${base}/article`);
    assert.match(document.origin.note!, /Retrieved at \d{4}-\d{2}-\d{2}T/);
    await assert.rejects(loadDocument(spec('/blocked'), '.'), /HTTP 403/);
    await assert.rejects(loadDocument(spec('/challenge'), '.'), /access challenge/);
    await assert.rejects(loadDocument(spec('/large'), '.', { maxBytes: 100 }), /byte limit/);
    await assert.rejects(loadDocument(spec('/binary'), '.'), /text or HTML/);
    await assert.rejects(loadDocument(spec('/badredirect'), '.'), /HTTP or HTTPS/);
    await assert.rejects(loadDocument(spec('/slow'), '.', { timeoutMs: 25 }), /timed out/);
    const controller = new AbortController();
    const pending = loadDocument(spec('/slow'), '.', { signal: controller.signal });
    setTimeout(() => controller.abort(), 25);
    await assert.rejects(pending, /cancelled/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('Fandom 403 uses the bounded public API and records the actual retrieval method', async () => {
  const calls: string[] = [];
  let pageStatus = 403;
  let payload: unknown = {
    parse: { text: { '*': '<div class="mw-parser-output"><p>Public article evidence.</p></div>' } },
  };
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return url.includes('/api.php?')
      ? new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } })
      : new Response('blocked', { status: pageStatus });
  };
  const spec = {
    id: 'fandom',
    kind: 'source' as const,
    url: 'https://onepiece.fandom.com/wiki/Monkey_D._Luffy',
  };
  const document = await loadDocument(spec, '.', { fetch: fetcher });
  assert.equal(document.text, 'Public article evidence.');
  assert.equal(document.origin.location, spec.url);
  assert.equal(document.origin.access, 'retrieved');
  assert.match(document.origin.note!, /Retrieved at \d{4}-\d{2}-\d{2}T/);
  assert.match(document.origin.note!, /page returned HTTP 403/);
  assert.match(document.origin.note!, /https:\/\/onepiece\.fandom\.com\/api\.php\?action=parse/);
  assert.equal(calls.length, 2);
  payload = { error: { code: 'missingtitle' } };
  await assert.rejects(loadDocument(spec, '.', { fetch: fetcher }), /did not return article HTML/);
  pageStatus = 404;
  calls.length = 0;
  await assert.rejects(loadDocument(spec, '.', { fetch: fetcher }), /HTTP 404/);
  assert.equal(calls.length, 1);
});
