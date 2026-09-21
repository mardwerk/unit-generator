import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { startLab } from '../src/lab/server.js';
import { LabLibrary } from '../src/lab/library.js';
import { draftUnit, prepareRequest } from '../src/core/index.js';
import { FakeModel, miraRequest } from './fixtures/core-fixtures.js';
import type { IconGenerationResponse } from '../src/lab/contracts.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7VQAAAAASUVORK5CYII=',
  'base64',
);
const usage = {
  inputTokens: 50,
  outputTokens: 20,
  totalTokens: 70,
  reasoningTokens: null,
  cachedInputTokens: null,
  costUsd: 0.0051,
  actualModel: null,
  provider: null,
  generationId: null,
};

test('icon generation requires explicit confirmation, the displayed model and a Unit-owned key before a model call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unit-icons-'));
  const library = await LabLibrary.open({
    settingsFile: join(root, 'settings.json'),
    defaultDirectory: join(root, 'library'),
  });
  const draft = await draftUnit(await prepareRequest(miraRequest()), new FakeModel());
  let calls = 0;
  const lab = await startLab({
    example: miraRequest(),
    library,
    port: 0,
    imageModel: {
      model: 'test/images',
      async generate(prompt) {
        calls++;
        assert.match(prompt, /Spark/);
        assert.match(prompt, /1024 by 1024 PNG/);
        assert.doesNotMatch(prompt, /Save the finished PNG|unit-icons-/);
        return { png, usage };
      },
    },
  });
  const headers = {
    Authorization: `Bearer ${lab.token}`,
    Origin: lab.origin,
    'Content-Type': 'application/json',
  };
  const payload = {
    artifact: draft,
    iconKey: 'basic-attack',
    model: 'test/images',
    confirmed: true,
    destination: (await library.icons(draft)).icons.find((icon) => icon.key === 'basic-attack')!
      .path,
  };
  const post = (body: unknown, extraHeaders = {}) =>
    fetch(`${lab.origin}/api/library/icon/generate`, {
      method: 'POST',
      headers: { ...headers, ...extraHeaders },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post({ ...payload, confirmed: false })).status, 400);
    const { confirmed: _ignored, ...unconfirmed } = payload;
    assert.equal((await post(unconfirmed)).status, 400);
    assert.equal((await post({ ...payload, model: 'different/images' })).status, 409);
    assert.equal((await post({ ...payload, iconKey: '../../outside.png' })).status, 400);
    assert.equal((await post({ ...payload, path: '/tmp/unauthorized.png' })).status, 400);
    assert.equal((await post({ ...payload, destination: '/tmp/stale.png' })).status, 409);
    assert.equal((await post(payload, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await post(payload, { Authorization: '' })).status, 401);
    assert.equal(calls, 0);
    const response = await post(payload);
    assert.equal(response.status, 200);
    const result = (await response.json()) as IconGenerationResponse;
    assert.equal(calls, 1);
    assert.deepEqual(result.usage, usage);
    const icon = result.icons.icons.find((entry) => entry.key === 'basic-attack')!;
    assert.ok(icon.path.startsWith(join(root, 'library', 'assets')));
    assert.equal(icon.dataUrl, `data:image/png;base64,${png.toString('base64')}`);
    assert.deepEqual(await readFile(icon.path), png);
    const receipts = (await readdir(dirname(icon.path))).filter((name) =>
      /^image-.*\.json$/.test(name),
    );
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(await readFile(join(dirname(icon.path), receipts[0]!), 'utf8'));
    assert.equal(receipt.model, 'test/images');
    assert.equal(receipt.key, 'basic-attack');
    assert.deepEqual(receipt.usage, usage);
    const refreshed = await library.icons(draft);
    assert.equal(
      refreshed.icons.find((entry) => entry.key === 'basic-attack')?.dataUrl,
      icon.dataUrl,
    );
    assert.equal((await post(payload)).status, 200);
    assert.equal(calls, 2);
    assert.equal(
      (await readdir(dirname(icon.path))).filter((name) => /^image-.*\.json$/.test(name)).length,
      2,
    );
  } finally {
    await lab.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('provider configuration and duplicate icons are locked while independent work can continue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unit-image-busy-'));
  const library = await LabLibrary.open({
    settingsFile: join(root, 'settings.json'),
    defaultDirectory: join(root, 'library'),
  });
  const draft = await draftUnit(await prepareRequest(miraRequest()), new FakeModel());
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entering = new Promise<void>((resolve) => {
    started = resolve;
  });
  const lab = await startLab({
    example: miraRequest(),
    library,
    port: 0,
    imageModel: {
      model: 'test/images',
      async generate() {
        started();
        await waiting;
        return { png };
      },
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
    const first = post('library/icon/generate', {
      artifact: draft,
      iconKey: 'basic-attack',
      model: 'test/images',
      confirmed: true,
      destination: (await library.icons(draft)).icons.find((icon) => icon.key === 'basic-attack')!
        .path,
    });
    await entering;
    assert.equal((await post('provider', { provider: 'codex' })).status, 409);
    assert.equal(
      (await post('library/configure', { directory: join(root, 'changed') })).status,
      409,
    );
    assert.equal(
      (
        await post('library/icon/generate', {
          artifact: draft,
          iconKey: 'basic-attack',
          model: 'test/images',
          confirmed: true,
          destination: (await library.icons(draft)).icons.find(
            (icon) => icon.key === 'basic-attack',
          )!.path,
        })
      ).status,
      409,
    );
    assert.equal((await post('prepare', { request: miraRequest() })).status, 200);
    release();
    assert.equal((await first).status, 200);
  } finally {
    release();
    await lab.close();
    await rm(root, { recursive: true, force: true });
  }
});
