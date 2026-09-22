import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ModelExecutionError } from '../src/core/model.js';
import { createEvidenceRun, EvidenceWriteError } from '../src/node/evidence.js';
import { OpenRouterModelClient } from '../src/node/openrouter.js';
import { CodexModelClient } from '../src/node/codex.js';

const request = {
  system: 'Use the supplied source.',
  prompt: 'An independent kick while the fist is away.',
  schema: { type: 'object' },
};
const secret = 'PRIVATE_PROVIDER_CREDENTIAL';
const json = async (directory: string, name: string) =>
  JSON.parse(await readFile(join(directory, name), 'utf8'));
async function inDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'unit-evidence-test-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function completion(content: string, finish = 'stop', refusal?: string) {
  return Response.json({
    id: 'generation-1',
    created: 1,
    model: 'test/model',
    object: 'chat.completion',
    system_fingerprint: null,
    choices: [
      { index: 0, finish_reason: finish, message: { role: 'assistant', content, refusal } },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

test('evidence saves exact inputs and requests before invocation, and original output before caller validation', async () => {
  await inDirectory(async (directory) => {
    const input = {
      rules: 'arbitrary rules',
      source: 'original source',
      previous: { independent: true },
    };
    const run = await createEvidenceRun({
      directory,
      input,
      settings: { apiKey: secret, timeoutMs: 1000 },
    });
    assert.deepEqual(await json(run.directory, 'input.json'), input);
    const model = run.wrap({
      id: 'test:model',
      async generate(received) {
        assert.deepEqual(received, request);
        assert.equal((await json(run.directory, '001-request.json')).prompt, request.prompt);
        return { output: { incomplete: true } };
      },
    });
    const response = await model.generate(request);
    assert.deepEqual((await json(run.directory, '001-output.json')).output, response.output);
    assert.equal(
      (await json(run.directory, '001-outcome.json')).validation,
      'not-performed-by-recorder',
    );
    await run.fail(new Error('Core schema rejected the incomplete output: ' + secret));
    assert.equal((await json(run.directory, 'outcome.json')).status, 'failed');
    const manifest = await json(run.directory, 'manifest.json');
    assert.ok(Object.keys(manifest.runtimeFiles).some((name) => name.endsWith('evidence.js')));
    assert.ok(
      Object.values(manifest.runtimeFiles).every((hash) => /^[a-f0-9]{64}$/.test(String(hash))),
    );
    assert.equal(manifest.settings.temperature, null);
    assert.equal(manifest.settings.timeoutMs, 1000);
    assert.equal((await stat(join(run.directory, 'input.json'))).mode & 0o777, 0o600);
    for (const name of await readdir(run.directory))
      assert.ok(!(await readFile(join(run.directory, name), 'utf8')).includes(secret));
  });
});

test('successful runs retain final artifact and leave scenarios, preservation and acceptance unassessed', async () => {
  await inDirectory(async (directory) => {
    const run = await createEvidenceRun({ directory, input: { request } });
    const artifact = {
      unit: { independentKick: true },
      checks: [{ kind: 'deterministic', status: 'passed' }],
    };
    await run.finish(artifact);
    assert.deepEqual(await json(run.directory, 'artifact.json'), artifact);
    assert.equal((await json(run.directory, 'outcome.json')).acceptance, 'not-assessed');
    const observations = await json(run.directory, 'observations.json');
    assert.equal(observations.demonstration.execution, 'not-executed');
    assert.equal(observations.preservation.classification, null);
    assert.equal(observations.acceptance.status, 'not-assessed');
    const second = await createEvidenceRun({ directory, input: {} });
    assert.notEqual(run.directory, second.directory);
  });
});

test('OpenRouter malformed, incomplete and refused answers survive adapter rejection without SDK envelopes', async () => {
  await inDirectory(async (directory) => {
    for (const [content, finish, refusal, code] of [
      ['{invalid', 'stop', undefined, 'MODEL_OUTPUT_INVALID'],
      ['{"part":', 'length', undefined, 'OUTPUT_LIMIT'],
      ['', 'stop', 'declined', 'MODEL_REFUSAL'],
    ] as const) {
      const run = await createEvidenceRun({ directory, input: {} });
      const client = new OpenRouterModelClient(
        { apiKey: secret, model: 'test/model', reasoningEffort: 'low' },
        async () => completion(content, finish, refusal),
      );
      await assert.rejects(run.wrap(client).generate(request), (error: unknown) => {
        assert.ok(error instanceof ModelExecutionError);
        assert.equal(error.failure?.code, code);
        return true;
      });
      const raw = await json(run.directory, '001-raw-output.json');
      assert.equal(raw.content, content);
      assert.equal(raw.refusal, refusal ?? null);
      assert.equal(raw.finishReason, finish);
      const outcome = await json(run.directory, '001-outcome.json');
      assert.equal(outcome.failure.code, code);
      assert.equal(outcome.usage.totalTokens, 15);
      assert.equal(outcome.settings.reasoningEffort, 'low');
      for (const name of await readdir(run.directory))
        assert.ok(!(await readFile(join(run.directory, name), 'utf8')).includes(secret));
    }
  });
});

test('provider errors and cancelled attempts retain safe failure facts without private error text', async () => {
  await inDirectory(async (directory) => {
    const run = await createEvidenceRun({ directory, input: {} });
    const failed = new OpenRouterModelClient({ apiKey: secret }, async () =>
      Response.json(
        { error: { code: 401, message: secret, metadata: { raw: secret } } },
        { status: 401 },
      ),
    );
    await assert.rejects(run.wrap(failed).generate(request));
    const controller = new AbortController();
    controller.abort(secret);
    await assert.rejects(run.wrap(failed).generate({ ...request, signal: controller.signal }));
    assert.equal((await json(run.directory, '001-outcome.json')).failure.code, 'AUTHENTICATION');
    assert.equal((await json(run.directory, '002-outcome.json')).failure.code, 'CANCELLED');
    assert.equal((await json(run.directory, '002-outcome.json')).rawOutput, 'unavailable');
    for (const name of await readdir(run.directory))
      assert.ok(!(await readFile(join(run.directory, name), 'utf8')).includes(secret));
  });
});

test('evidence write failure prevents model dispatch and adapter decode rather than silently losing evidence', async () => {
  await inDirectory(async (directory) => {
    const run = await createEvidenceRun({ directory, input: {} });
    let calls = 0;
    const client = run.wrap({
      id: 'test:model',
      async generate() {
        calls++;
        return { output: {} };
      },
    });
    await rm(run.directory, { recursive: true });
    await assert.rejects(client.generate(request), EvidenceWriteError);
    assert.equal(calls, 0);
    const adapter = new OpenRouterModelClient({ apiKey: secret }, async () =>
      completion('{invalid'),
    );
    await assert.rejects(
      adapter.generateWithEvidence(request, async () => {
        throw new EvidenceWriteError();
      }),
      EvidenceWriteError,
    );
    const notDirectory = join(directory, 'file');
    await writeFile(notDirectory, 'occupied');
    await assert.rejects(
      createEvidenceRun({ directory: notDirectory, input: {} }),
      EvidenceWriteError,
    );
  });
});

test('Codex retains malformed and failed final files before deleting its temporary workspace', async () => {
  await inDirectory(async (directory) => {
    const executable = join(directory, 'codex.mjs');
    const configPath = join(directory, 'config.toml');
    await writeFile(configPath, 'model = "configured-model"\nmodel_reasoning_effort = "high"\n');
    for (const exitCode of [0, 7]) {
      await writeFile(
        executable,
        `#!${process.execPath}\nimport fs from 'node:fs';\nconst args = process.argv.slice(2);\nconst output = args[args.indexOf('--output-last-message') + 1];\nfs.writeFileSync(output, '{original-incomplete');\nconsole.error('${secret}');\nprocess.exit(${exitCode});\n`,
      );
      await chmod(executable, 0o700);
      const run = await createEvidenceRun({ directory, input: {} });
      const client = new CodexModelClient({ executable, configPath, timeoutMs: 5000 });
      await assert.rejects(run.wrap(client).generate(request));
      assert.equal(
        (await json(run.directory, '001-raw-output.json')).content,
        '{original-incomplete',
      );
      const outcome = await json(run.directory, '001-outcome.json');
      assert.equal(outcome.settings.model, 'configured-model');
      assert.equal(outcome.settings.reasoningEffort, 'high');
      for (const name of await readdir(run.directory))
        assert.ok(!(await readFile(join(run.directory, name), 'utf8')).includes(secret));
    }
  });
});

test('credential-bearing OpenRouter completions cannot enter parsed output or final artifacts', async () => {
  await inDirectory(async (directory) => {
    const run = await createEvidenceRun({ directory, input: {} });
    const client = new OpenRouterModelClient({ apiKey: secret, model: 'test/model' }, async () =>
      completion(JSON.stringify({ behavior: `Echoed credential: ${secret}` })),
    );
    let failure: unknown;
    await assert.rejects(run.wrap(client).generate(request), (error: unknown) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
      assert.match(error.message, /credential/);
      assert.ok(!error.message.includes(secret));
      failure = error;
      return true;
    });
    await run.fail(failure);
    const raw = await json(run.directory, '001-raw-output.json');
    assert.equal(raw.redacted, true);
    assert.equal(raw.content, JSON.stringify({ behavior: 'Echoed credential: [REDACTED]' }));
    const files = await readdir(run.directory);
    assert.ok(!files.includes('001-output.json'));
    assert.ok(!files.includes('artifact.json'));
    assert.equal((await json(run.directory, '001-outcome.json')).usage.totalTokens, 15);
    for (const name of files)
      assert.ok(!(await readFile(join(run.directory, name), 'utf8')).includes(secret));
    await assert.rejects(client.generate(request), (error: unknown) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
      return true;
    });
  });
});
