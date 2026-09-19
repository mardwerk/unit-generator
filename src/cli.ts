#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { lstat, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { prepareRequest, draftUnit, checkDraft, reviewDraft, authorUnit } from './core/index.js';
import { CodexModelClient } from './node/codex.js';
import { loadRequestFile, readJsonFile } from './node/request-file.js';
import { renderArtifact } from './presentation/markdown.js';

const help = `Unit Generator

Usage: unit-generator <command> <input.json> [options]

Commands:
  prepare   Resolve an input request and record its exact content and hash
  draft     Generate a candidate from a prepared request using Codex
  check     Run deterministic checks on a draft, without a model call
  review    Review a checked draft using a fresh Codex call
  author    Run prepare, draft, check and review together
  render    Render a draft, checked artifact or final result as Markdown

Options:
  -o, --output FILE       Write a new file; existing files are never replaced
  --previous FILE        Supply a prior Result to prepare or author
  --feedback TEXT        Requested changes for prepare or author
  --model NAME           Override the model in your Codex configuration
  --reasoning LEVEL      Override reasoning: low, medium or high
  --timeout SECONDS      Timeout per model call (default: 600)
  --codex FILE           Codex executable (default: codex on PATH)
  -h, --help             Show this help

Without --output, the complete artifact is written to stdout.
Diagnostics use stderr. Exit 0 means the operation completed, not that all
findings passed. Review the structured findings before using a candidate.
`;

async function ensureNewOutput(file: string): Promise<void> {
  try { await lstat(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`Output already exists: ${file}. Choose a new revision filename.`);
}

async function writeOutput(file: string, content: string): Promise<void> {
  const path = resolve(file);
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.unit-generator-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Output already exists: ${file}. Choose a new revision filename.`);
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      output: { type: 'string', short: 'o' }, previous: { type: 'string' }, feedback: { type: 'string' },
      model: { type: 'string' }, reasoning: { type: 'string' }, timeout: { type: 'string' },
      codex: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { process.stdout.write(help); return; }
  const [command, file] = positionals;
  if (positionals.length !== 2 || !command || !file || !['prepare', 'draft', 'check', 'review', 'author', 'render'].includes(command)) {
    throw new Error('Expected a command and input JSON file. Run unit-generator --help.');
  }
  if ((values.previous || values.feedback) && !['prepare', 'author'].includes(command)) {
    throw new Error('--previous and --feedback apply only to prepare or author.');
  }
  if (values.output) await ensureNewOutput(values.output);
  const timeout = Number(values.timeout ?? '600');
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout * 1000 > 2_147_483_647) throw new Error('--timeout must be a positive number of seconds within the timer limit.');
  const reasoning = values.reasoning;
  if (reasoning && !['low', 'medium', 'high'].includes(reasoning)) throw new Error('--reasoning must be low, medium or high.');
  const executable = values.codex && /[/\\]/.test(values.codex) ? resolve(values.codex) : values.codex;
  const model = new CodexModelClient({ ...(values.model ? { model: values.model } : {}), ...(reasoning ? { reasoningEffort: reasoning } : {}), timeoutMs: Math.ceil(timeout * 1000), ...(executable ? { executable } : {}) });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const options = { signal: controller.signal };
  try {
    let artifact: unknown;
    if (command === 'prepare' || command === 'author') {
      process.stderr.write('Loading explicit inputs...\n');
      const request = await loadRequestFile(file, { ...options,
        ...(values.previous ? { previousResultFile: resolve(values.previous) } : {}),
        ...(values.feedback !== undefined ? { feedback: values.feedback } : {}),
      });
      if (command === 'prepare') artifact = await prepareRequest(request);
      else { process.stderr.write('Drafting and reviewing with Codex...\n'); artifact = await authorUnit(request, model, options); }
    } else {
      const input = await readJsonFile(file);
      if (command === 'draft') { process.stderr.write('Drafting with Codex...\n'); artifact = await draftUnit(input as Parameters<typeof draftUnit>[0], model, options); }
      else if (command === 'check') artifact = await checkDraft(input as Parameters<typeof checkDraft>[0]);
      else if (command === 'review') { process.stderr.write('Reviewing with Codex...\n'); artifact = await reviewDraft(input as Parameters<typeof reviewDraft>[0], model, options); }
      else artifact = renderArtifact(input);
    }
    const content = command === 'render' ? String(artifact) : JSON.stringify(artifact, null, 2) + '\n';
    if (values.output) { await writeOutput(values.output, content); process.stderr.write(`Wrote ${values.output}\n`); }
    else process.stdout.write(content);
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof ZodError
    ? error.issues.slice(0, 12).map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('\n')
    : error instanceof Error ? error.message : 'Unexpected failure.';
  process.stderr.write(`unit-generator: ${message}\n`);
  process.exitCode = 1;
});
