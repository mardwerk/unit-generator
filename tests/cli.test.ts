import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { miraCandidate, miraRequest, miraReview } from './fixtures/core-fixtures.js';
import { loadRequestFile } from '../src/node/request-file.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import { authorUnit } from '../src/core/index.js';
import { FakeModel } from './fixtures/core-fixtures.js';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

async function run(args: string[], cwd: string, callerEnvironment: NodeJS.ProcessEnv = process.env) {
  try {
    const output = await execute(process.execPath, [cli, ...args], {
      cwd, timeout: 15_000, maxBuffer: 4_000_000,
      env: { ...callerEnvironment, CODEX_HOME: join(cwd, 'codex-home') },
    });
    return { code: 0, ...output };
  } catch (error) {
    const failed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? failed.message };
  }
}

async function setup(body: (directory: string, requestPath: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'unit-generator-cli-test-'));
  try {
    await mkdir(join(directory, 'codex-home'));
    await writeFile(join(directory, 'codex-home', 'config.toml'), '');
    const request = miraRequest();
    const input = { ...request, documents: request.documents.map(({ origin: _origin, ...document }) => document) };
    const requestPath = join(directory, 'request.json');
    await writeFile(requestPath, JSON.stringify(input));
    const executable = join(directory, 'fake-codex.mjs');
    await writeFile(executable, `#!${process.execPath}\nimport fs from 'node:fs';
const args = process.argv.slice(2);
const schema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1], 'utf8'));
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
const candidate = ${JSON.stringify(miraCandidate())};
if (prompt.includes('Prioritize support in this revision')) candidate.role = 'Revised support-focused candidate.';
fs.writeFileSync(args[args.indexOf('--output-last-message')+1], JSON.stringify(schema.properties.summary ? ${JSON.stringify(miraReview())} : candidate));
`);
    await chmod(executable, 0o700);
    await body(directory, requestPath);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('CLI stages serialize and reload; combined authoring and explicit revisions share the same core', async () => {
  await setup(async (directory, request) => {
    const stages = [['prepare', request, 'prepared.json'], ['draft', 'prepared.json', 'draft.json'], ['check', 'draft.json', 'checked.json'], ['review', 'checked.json', 'result.json']] as const;
    for (const [command, input, output] of stages) {
      const response = await run([command, input, '--output', output, '--codex', './fake-codex.mjs'], directory);
      assert.equal(response.code, 0, response.stderr);
      assert.equal(response.stdout, '');
      const artifact = JSON.parse(await readFile(join(directory, output), 'utf8'));
      assert.equal(artifact.kind, { prepare: 'prepared', draft: 'draft', check: 'checked', review: 'result' }[command]);
    }
    const combined = await run(['author', request, '--codex', './fake-codex.mjs'], directory);
    assert.equal(combined.code, 0, combined.stderr);
    const result = JSON.parse(combined.stdout);
    const staged = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    assert.deepEqual(result.candidate, staged.candidate);
    assert.deepEqual(result.findings, staged.findings);
    const revised = await run(['author', request, '--previous', 'result.json', '--feedback', 'Prioritize support in this revision', '--codex', './fake-codex.mjs'], directory);
    assert.equal(revised.code, 0, revised.stderr);
    const revision = JSON.parse(revised.stdout);
    assert.equal(revision.prepared.request.previous.resultId, staged.id);
    assert.equal(revision.candidate.role, 'Revised support-focused candidate.');
    assert.notEqual(revision.prepared.inputHash, staged.prepared.inputHash);
    const rendered = await run(['render', 'result.json'], directory);
    assert.equal(rendered.code, 0, rendered.stderr);
    assert.match(rendered.stdout, /# Mira/);
    assert.match(rendered.stdout, /Deterministic checks:/);
    assert.match(rendered.stdout, /Model review:/);
    assert.match(rendered.stdout, /perception, tier 2/);
  });
});

test('fake CLI model calls use fixture configuration even when the caller configuration is malformed', async () => {
  await setup(async (directory, request) => {
    const callerHome = join(directory, 'caller-codex-home');
    await mkdir(callerHome);
    await writeFile(join(callerHome, 'config.toml'), 'invalid = [');
    const response = await run(['author', request, '--codex', './fake-codex.mjs'], directory, { ...process.env, CODEX_HOME: callerHome });
    assert.equal(response.code, 0, response.stderr);
    assert.equal(JSON.parse(response.stdout).kind, 'result');
    assert.equal(await readFile(join(callerHome, 'config.toml'), 'utf8'), 'invalid = [');
  });
});

test('CLI failures leave stdout and intended output empty and never overwrite existing work', async () => {
  await setup(async (directory, request) => {
    const output = join(directory, 'existing.json');
    await writeFile(output, 'keep this work');
    const existing = await run(['author', request, '-o', output, '--codex', '/does-not-exist'], directory);
    assert.equal(existing.code, 1);
    assert.equal(existing.stdout, '');
    assert.match(existing.stderr, /already exists/);
    assert.equal(await readFile(output, 'utf8'), 'keep this work');
    await writeFile(join(directory, 'bad.json'), '{bad');
    for (const args of [
      ['author', 'bad.json'],
      ['prepare', 'missing.json'],
      ['check', request, '--feedback', 'invalid here'],
      ['author', request, '--codex', '/does-not-exist'],
      ['prepare', request, '--timeout', '-1'],
    ]) {
      const response = await run(args, directory);
      assert.equal(response.code, 1, response.stderr);
      assert.equal(response.stdout, '');
      assert.ok(response.stderr.trim());
    }
    const help = await run(['--help'], directory);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /prepare/);
    assert.match(help.stdout, /review/);
  });
});

test('request file references resolve relative to the request, including explicit prior Results', async () => {
  await setup(async (directory, requestPath) => {
    const input = JSON.parse(await readFile(requestPath, 'utf8'));
    await writeFile(join(directory, 'source.txt'), input.documents[0].text);
    input.documents[0] = { id: input.documents[0].id, kind: 'source', file: 'source.txt' };
    const previous = await authorUnit(miraRequest(), new FakeModel());
    await writeFile(join(directory, 'previous.json'), JSON.stringify(previous));
    input.previousResultFile = 'previous.json';
    input.feedback = 'Preserve the same gameplay choices.';
    await writeFile(requestPath, JSON.stringify(input));
    const resolved = await loadRequestFile(requestPath);
    assert.equal(resolved.documents[0]!.origin.access, 'local-file');
    assert.equal(resolved.previous!.resultId, previous.id);
    input.previous = resolved.previous;
    await writeFile(requestPath, JSON.stringify(input));
    await assert.rejects(loadRequestFile(requestPath), /either previous context/);
  });
});

test('Markdown escapes embedded HTML and table separators while retaining meaningful evidence', async () => {
  const candidate = miraCandidate();
  candidate.basicAttack.name = '<script>alert(1)</script>|Spark';
  const result = await authorUnit(miraRequest(), new FakeModel([candidate, miraReview()]));
  const rendered = renderArtifact(result);
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.ok(rendered.includes('\\|Spark'));
  assert.match(rendered, /mira-brief-v1/);
});
