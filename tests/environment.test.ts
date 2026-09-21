import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

test('local env settings load for startup without overriding explicit environment variables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unit-environment-'));
  const moduleUrl = new URL('../src/node/environment.js', import.meta.url).href;
  const source = `import {loadLocalEnvironment} from ${JSON.stringify(moduleUrl)};
    loadLocalEnvironment(); console.log(JSON.stringify({fromFile:process.env.UNIT_TEST_LOCAL,override:process.env.UNIT_TEST_OVERRIDE}));`;
  const run = () =>
    promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], {
      cwd: directory,
      env: { ...process.env, UNIT_TEST_OVERRIDE: 'explicit' },
    });
  try {
    assert.deepEqual(JSON.parse((await run()).stdout), { override: 'explicit' });
    await writeFile(
      join(directory, '.env'),
      'UNIT_TEST_LOCAL=from-file\nUNIT_TEST_OVERRIDE=from-file\n',
    );
    assert.deepEqual(JSON.parse((await run()).stdout), {
      fromFile: 'from-file',
      override: 'explicit',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
