#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { lstat, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import {
  prepareRequest,
  draftUnit,
  checkDraft,
  reviewDraft,
  authorUnit,
  type PreparedRequest,
  type DraftArtifact,
  type CheckedArtifact,
} from './core/index.js';
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
  try {
    await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  throw new Error(`Output already exists: ${file}. Choose a new revision filename.`);
}

async function writeOutput(file: string, content: string): Promise<void> {
  const path = resolve(file);
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.unit-generator-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Output already exists: ${file}. Choose a new revision filename.`);
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

const commands = ['prepare', 'draft', 'check', 'review', 'author', 'render'] as const;

type Command = (typeof commands)[number];

function isCommand(value: string): value is Command {
  return commands.some((command) => command === value);
}

function parseInvocation() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      output: {
        type: 'string',
        short: 'o',
      },
      previous: { type: 'string' },
      feedback: { type: 'string' },
      model: { type: 'string' },
      reasoning: { type: 'string' },
      timeout: { type: 'string' },
      codex: { type: 'string' },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  });
  if (values.help) {
    return null;
  }
  const [command, file] = positionals;
  if (positionals.length !== 2 || !command || !file || !isCommand(command)) {
    throw new Error('Expected a command and input JSON file. Run unit-generator --help.');
  }
  if ((values.previous || values.feedback) && !['prepare', 'author'].includes(command)) {
    throw new Error('--previous and --feedback apply only to prepare or author.');
  }
  return {
    command,
    file,
    values,
  };
}

type Invocation = NonNullable<ReturnType<typeof parseInvocation>>;

function createModel(values: Invocation['values']): CodexModelClient {
  const timeout = Number(values.timeout ?? '600');
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout * 1_000 > 2_147_483_647) {
    throw new Error('--timeout must be a positive number of seconds within the timer limit.');
  }
  const reasoning = values.reasoning;
  if (reasoning && !['low', 'medium', 'high'].includes(reasoning)) {
    throw new Error('--reasoning must be low, medium or high.');
  }
  const executable =
    values.codex && /[/\\]/.test(values.codex) ? resolve(values.codex) : values.codex;
  return new CodexModelClient({
    ...(values.model ? { model: values.model } : {}),
    ...(reasoning ? { reasoningEffort: reasoning } : {}),
    timeoutMs: Math.ceil(timeout * 1_000),
    ...(executable ? { executable } : {}),
  });
}

async function executeCommand(
  invocation: Invocation,
  model: CodexModelClient,
  signal: AbortSignal,
): Promise<unknown> {
  const { command, file, values } = invocation;
  const options = { signal };
  if (command === 'prepare' || command === 'author') {
    process.stderr.write('Loading explicit inputs...\n');
    const request = await loadRequestFile(file, {
      signal,
      ...(values.previous ? { previousResultFile: resolve(values.previous) } : {}),
      ...(values.feedback !== undefined ? { feedback: values.feedback } : {}),
    });
    if (command === 'prepare') {
      return prepareRequest(request);
    }
    process.stderr.write('Drafting and reviewing with Codex...\n');
    return authorUnit(request, model, options);
  }
  const input = await readJsonFile(file);
  switch (command) {
    case 'draft':
      process.stderr.write('Drafting with Codex...\n');
      return draftUnit(input as PreparedRequest, model, options);
    case 'check':
      return checkDraft(input as DraftArtifact);
    case 'review':
      process.stderr.write('Reviewing with Codex...\n');
      return reviewDraft(input as CheckedArtifact, model, options);
    case 'render':
      return renderArtifact(input);
  }
}

async function emitArtifact(invocation: Invocation, artifact: unknown): Promise<void> {
  const content =
    invocation.command === 'render' ? String(artifact) : JSON.stringify(artifact, null, 2) + '\n';
  if (invocation.values.output) {
    await writeOutput(invocation.values.output, content);
    process.stderr.write(`Wrote ${invocation.values.output}\n`);
  } else {
    process.stdout.write(content);
  }
}

async function main(): Promise<void> {
  const invocation = parseInvocation();
  if (invocation === null) {
    process.stdout.write(help);
    return;
  }
  if (invocation.values.output) {
    await ensureNewOutput(invocation.values.output);
  }
  const model = createModel(invocation.values);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const artifact = await executeCommand(invocation, model, controller.signal);
    await emitArtifact(invocation, artifact);
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .slice(0, 12)
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('\n');
  }
  return error instanceof Error ? error.message : 'Unexpected failure.';
}
main().catch((error: unknown) => {
  process.stderr.write(`unit-generator: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
