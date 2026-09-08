import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { runCli } from '../src/index.js';
async function invoke(args: string[]) {
  let stdout = '',
    stderr = '';
  const code = await runCli(args, {
    env: {},
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });
  return { code, result: JSON.parse(stdout), stderr };
}
describe('stateless CLI', () => {
  it('returns content and reports to stdout without writing files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'unit-cli-'));
    const before = await readdir(directory);
    try {
      const result = await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(new URL('../src/index.ts', import.meta.url)),
          'generate',
          'Clockwork falcon',
          '--original',
          '--provider',
          'fixture'
        ],
        { cwd: directory, env: { PATH: process.env.PATH ?? '' } }
      );
      expect(JSON.parse(result.stdout).output.upgradeGraph.nodes).toHaveLength(15);
      expect(await readdir(directory)).toEqual(before);
      expect(result.stderr).toContain('"type":"progress"');
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it('writes only explicit exports, refuses overwrite and revalidates an envelope', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'unit-cli-'));
    const out = path.join(directory, 'result.json');
    try {
      expect(
        (
          await invoke([
            'generate',
            'Sentinel',
            '--definition',
            'merge-family-example',
            '--provider',
            'fixture',
            '--out',
            out
          ])
        ).code
      ).toBe(0);
      expect(await readdir(directory)).toEqual(['result.json']);
      expect((await invoke(['validate', out])).code).toBe(0);
      expect(
        (
          await invoke([
            'generate',
            'Sentinel',
            '--definition',
            'merge-family-example',
            '--provider',
            'fixture',
            '--out',
            out
          ])
        ).code
      ).not.toBe(0);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it('exports a failed research outcome and consumes an exported original-concept research envelope', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'unit-cli-'));
    const out = path.join(directory, 'research.json');
    try {
      const denied = await invoke(['research', 'Known character', '--out', out]);
      expect(denied.code).not.toBe(0);
      expect(JSON.parse(await readFile(out, 'utf8')).error.code).toBe('research-not-authorized');
      const knowledge = (await invoke(['research', 'Clockwork falcon', '--original'])).result;
      await writeFile(out, JSON.stringify(knowledge));
      const generated = await invoke([
        'generate',
        'Clockwork falcon',
        '--original',
        '--provider',
        'fixture',
        '--knowledge',
        out
      ]);
      expect(generated.code).toBe(0);
      expect(generated.result.research[0].reused).toBe(true);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
