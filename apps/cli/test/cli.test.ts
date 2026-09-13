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
  it('allows an explicit larger research source budget without weakening the default', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'unit-source-budget-'));
    try {
      const input = path.join(directory, 'input.json');
      await writeFile(
        input,
        JSON.stringify({
          subject: 'Synthetic archive character',
          sources: Array.from({ length: 6 }, (_, i) => ({
            id: `source-${i}`,
            title: `Source ${i}`,
            content: `Distinct synthetic fact ${i}`,
            origin: 'supplied',
            status: 'read',
            truncated: false,
            omissions: []
          }))
        })
      );
      const seen: number[] = [];
      const run = async (extra: string[]) => {
        let output = '';
        const code = await runCli(['research', '--input', input, '--no-research', ...extra], {
          stdout: (text) => {
            output += text;
          },
          stderr: () => {},
          execution: {
            model: {
              generate: async (call) => {
                const sources = (call.input as { sources: Array<{ id: string }> }).sources;
                seen.push(sources.length);
                return {
                  mode: 'json',
                  value: {
                    subject: 'Synthetic archive character',
                    identity: {
                      status: 'resolved',
                      name: 'Synthetic archive character',
                      continuity: 'Synthetic',
                      explanation: 'Synthetic source-budget test only.'
                    },
                    claims: sources.map((s) => ({
                      text: 'Synthetic fact.',
                      sourceIds: [s.id],
                      kind: 'evidence'
                    })),
                    gaps: []
                  }
                };
              }
            }
          }
        });
        return { code, result: JSON.parse(output) };
      };
      expect((await run([])).result.error.code).toBe('source-limit');
      const expanded = await run(['--max-sources', '6']);
      expect(expanded.code).toBe(0);
      expect(expanded.result.sources).toHaveLength(6);
      expect(seen).toEqual([6]);
      for (const value of ['0', '9', '1.5', 'invalid'])
        expect((await run(['--max-sources', value])).code).toBe(2);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it.each(['manga-mayhem', 'btd6-derived', 'tower-defense'])(
    'generates and revalidates the %s candidate contract',
    async (definition) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'unit-lane-cli-'));
      const out = path.join(directory, 'unit.json');
      try {
        const generated = await invoke([
          'generate',
          'Clockwork sentry',
          '--definition',
          definition,
          '--original',
          '--provider',
          'fixture',
          '--out',
          out
        ]);
        expect(generated.code).toBe(0);
        expect(generated.result.definition.id).toBe(definition);
        expect(generated.result.output.name).toBe('Clockwork sentry');
        expect(generated.result.validation.balance.status).toBe('not-tested');
        expect((await invoke(['validate', out])).code).toBe(0);
        const character = await invoke([
          'generate',
          'Monkey D. Luffy',
          '--definition',
          definition,
          '--provider',
          'fixture'
        ]);
        expect(character.code).not.toBe(0);
        expect(character.result.output).toBeUndefined();
      } finally {
        await rm(directory, { recursive: true });
      }
    }
  );
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
      const denied = await invoke(['research', 'Known character', '--no-research', '--out', out]);
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
