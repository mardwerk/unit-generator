import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CodexModelClient } from '../src/node/codex.js';

const request = { system: 'Use only evidence.', prompt: 'Produce the candidate.', schema: { type: 'object' } };

async function fakeCodex(body: string, run: (executable: string, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'fake-codex-test-'));
  const executable = join(directory, 'codex.mjs');
  await writeFile(executable, `#!${process.execPath}\nimport fs from 'node:fs';\nconst args = process.argv.slice(2);\nconst output = args[args.indexOf('--output-last-message') + 1];\nfs.writeFileSync(${JSON.stringify(join(directory, 'cwd.txt'))}, process.cwd());\n${body}\n`);
  await chmod(executable, 0o700);
  await writeFile(join(directory, 'config.toml'), '');
  try { await run(executable, directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

async function assertClean(directory: string) {
  const cwd = await readFile(join(directory, 'cwd.txt'), 'utf8');
  await assert.rejects(access(cwd));
  await assert.rejects(access(join(cwd, '..', 'schema.json')));
}

test('Codex requests are isolated, stdin-fed, tool-limited and parsed from the final file only', async () => {
  await fakeCodex(`let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
    const schema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
    console.log('not the JSON result');
    fs.writeFileSync(output, JSON.stringify({ args, prompt, schema, files: fs.readdirSync(process.cwd()), home: process.env.HOME, codexHome: process.env.CODEX_HOME ?? null }));`, async (executable, directory) => {
    const client = new CodexModelClient({ executable, configPath: join(directory, 'config.toml'), model: 'test-model', timeoutMs: 5000 });
    assert.equal(client.id, 'codex:test-model');
    const result = await client.generate(request) as { args: string[]; prompt: string; schema: unknown; files: string[]; home: string; codexHome: string | null };
    assert.equal(result.prompt, 'Use only evidence.\n\nProduce the candidate.');
    assert.deepEqual(result.schema, request.schema);
    assert.deepEqual(result.files, []);
    assert.equal(result.home, process.env.HOME);
    assert.equal(result.codexHome, process.env.CODEX_HOME ?? null);
    for (const arg of ['--ephemeral', '--skip-git-repo-check', 'read-only', 'approval_policy="never"', 'web_search="disabled"', 'shell_tool', 'unified_exec', 'test-model']) assert.ok(result.args.includes(arg), arg);
    assert.ok(!result.args.includes('--ignore-user-config'));
    assert.equal(result.args.at(-1), '-');
    await assertClean(directory);
    await client.generate(request);
    await assertClean(directory);
  });
});

test('Codex failures do not reveal provider console secrets and always clean temp files', async () => {
  await fakeCodex(`console.error('SECRET_CREDENTIAL_TOKEN'); process.exit(7);`, async (executable, directory) => {
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml') }).generate(request), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /exit status 7/);
      assert.doesNotMatch(error.message, /SECRET_CREDENTIAL_TOKEN/);
      return true;
    });
    await assertClean(directory);
  });
  await fakeCodex(`fs.writeFileSync(output, '{broken');`, async (executable, directory) => {
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml') }).generate(request), /invalid JSON/);
    await assertClean(directory);
  });
  await fakeCodex(`console.log('{"looks":"valid"}');`, async (executable, directory) => {
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml') }).generate(request), /did not produce/);
    await assertClean(directory);
  });
  await assert.rejects(new CodexModelClient({ executable: '/nonexistent/unit-generator-codex', configPath: '/nonexistent/unit-generator-config.toml' }).generate(request), /could not start/);
});

test('Codex timeout, cancellation and output limits terminate the process and clean up', async () => {
  await fakeCodex(`setInterval(() => {}, 1000);`, async (executable, directory) => {
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml'), timeoutMs: 500 }).generate(request), /timed out/);
    await assertClean(directory);
    const controller = new AbortController();
    const pending = new CodexModelClient({ executable, configPath: join(directory, 'config.toml'), timeoutMs: 5000 }).generate({ ...request, signal: controller.signal });
    setTimeout(() => controller.abort(), 300);
    await assert.rejects(pending, /cancelled/);
    await assertClean(directory);
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml') }).generate({ ...request, signal: AbortSignal.abort() }), /cancelled/);
  });
  await fakeCodex(`process.stdout.write('x'.repeat(10000)); setInterval(() => {}, 1000);`, async (executable, directory) => {
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml'), maxOutputBytes: 1000 }).generate(request), /output limit/);
    await assertClean(directory);
  });
  await fakeCodex(`fs.writeFileSync(output, 'x'.repeat(10000));`, async (executable, directory) => {
    await assert.rejects(new CodexModelClient({ executable, configPath: join(directory, 'config.toml'), maxOutputBytes: 1000 }).generate(request), /output limit/);
    await assertClean(directory);
  });
});

test('Codex preserves configured provider and auth while disabling every configured MCP server', async () => {
  await fakeCodex(`for await (const chunk of process.stdin) {} fs.writeFileSync(output, JSON.stringify({ args }));`, async (executable, directory) => {
    const configPath = join(directory, 'config.toml');
    await writeFile(configPath, `model = "configured-model"\nmodel_provider = "private-provider"\nmodel_reasoning_effort = "medium"\n[model_providers.private-provider]\nbase_url = "https://private.invalid/v1"\nexperimental_bearer_token = "SECRET_TOKEN_VALUE"\n[mcp_servers.docs]\ncommand = "SECRET_COMMAND_VALUE"\n[mcp_servers."dotted.server"]\nurl = "https://private.invalid/mcp"\n`);
    const client = new CodexModelClient({ executable, configPath });
    const result = await client.generate(request) as { args: string[] };
    assert.equal(client.id, 'codex:configured-model:reasoning=medium');
    assert.ok(!result.args.includes('--ignore-user-config'));
    assert.ok(!result.args.includes('--model'));
    assert.ok(result.args.includes('mcp_servers={"docs"={enabled=false},"dotted.server"={enabled=false}}'));
    assert.ok(!result.args.some(arg => arg.startsWith('model_reasoning_effort=')));
    assert.doesNotMatch(JSON.stringify(result), /SECRET_TOKEN_VALUE|SECRET_COMMAND_VALUE|private-provider|private\.invalid/);
    const override = new CodexModelClient({ executable, configPath, model: 'override-model', reasoningEffort: 'high' });
    const overridden = await override.generate(request) as { args: string[] };
    assert.equal(override.id, 'codex:override-model:reasoning=high');
    assert.ok(overridden.args.includes('override-model'));
    assert.ok(overridden.args.includes('model_reasoning_effort="high"'));
    await writeFile(configPath, 'token = "SECRET_TOKEN_VALUE" malformed');
    await assert.rejects(client.generate(request), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /configuration could not be inspected/);
      assert.doesNotMatch(error.message, /SECRET_TOKEN_VALUE/);
      return true;
    });
    await assertClean(directory);
  });
});
