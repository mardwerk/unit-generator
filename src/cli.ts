#!/usr/bin/env node
import { createRoleRankingClient } from './node/role-ranking.js';
import { rankUnitRoles } from './core/roles.js';
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
  ModelExecutionError,
  resolveBuild,
  type BuildSelection,
  type PreparedRequest,
  type DraftArtifact,
  type CheckedArtifact,
  type ModelClient,
  applyConceptProfile,
} from './core/index.js';
import { CodexModelClient } from './node/codex.js';
import { OpenRouterModelClient } from './node/openrouter.js';
import { loadLocalEnvironment } from './node/environment.js';
import { loadRequestFile, readJsonFile } from './node/request-file.js';
import { prepareCharacter } from './node/character-source.js';
import { applyDefaultProfile, defaultAuthoringDefinition } from './node/default-profile.js';
import { verifyPrepared } from './core/prepare.js';
import { readArtifactView } from './presentation/view.js';
import { renderArtifact } from './presentation/markdown.js';
import { formatCost } from './presentation/usage.js';
import { createEvidenceRun, type EvidenceRun } from './node/evidence.js';

const help = `Unit Generator

Usage: unit-generator <command> [input.json | "Character name"] [options]

Commands:
  character Resolve a character name to cited source text and the default definition
  generate  Resolve a name, draft and check a Unit with the default definition
  rank      Classify a saved Unit base and completed paths without regenerating
  definition Print the default BTD6-inspired mechanics definition (no input)
  build     Resolve a saved Unit at --tiers 5,2,0 without a model call
  prepare   Resolve an input request and record its exact content and hash
  draft     Generate a candidate from a prepared request
  check     Run deterministic checks on a draft, without a model call
  review    Review a checked draft using a fresh model call
  author    Run prepare, draft, check and review together
  render    Render a draft, checked artifact or final result as Markdown

Options:
  -o, --output FILE       Write a new file; existing files are never replaced
  --previous FILE        Supply a prior Result to prepare or author
  --feedback TEXT        Requested changes for prepare or author
  --provider NAME        openrouter (default) or codex
  --model NAME           Override the selected provider's model
  --reasoning LEVEL      low, medium or high; OpenRouter also accepts none (default)
  --timeout SECONDS      Timeout per call (OpenRouter: 120, Codex: 600)
  --codex FILE           Codex executable (default: codex on PATH)
  --preset btd6          Apply the default definition to prepare or author
  --deliverable MODE     concept or mechanics for character, generate, prepare or author
  --operation MODE       generate, redesign or prose-edit for prepare or author
  --evidence-dir DIR     Retain model attempts here (concept default: .runs/evidence)
  --choice ID            Select a character when name lookup is ambiguous
  --tiers A,B,C          Purchased tiers for build, e.g. 5,2,0
  --roles MODE           Optional ranking: auto (default), typesafe, openrouter or off
  --repairs COUNT        Design repair attempts: 0, 1 (default), or 2
  --details              Include evidence and technical details with render
  -h, --help             Show this help

Without --output, the complete artifact is written to stdout.
Diagnostics use stderr. Exit 0 means the operation completed, not that all
findings passed. Review the structured findings before using a candidate.
OpenRouter defaults to openrouter/free and requires OPENROUTER_API_KEY.
For the name-only browser app, run pnpm start or mardwerk-unit.
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

const commands = [
  'character',
  'generate',
  'rank',
  'definition',
  'build',
  'prepare',
  'draft',
  'check',
  'review',
  'author',
  'render',
] as const;

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
      provider: { type: 'string' },
      model: { type: 'string' },
      reasoning: { type: 'string' },
      timeout: { type: 'string' },
      codex: { type: 'string' },
      details: { type: 'boolean' },
      preset: { type: 'string' },
      deliverable: { type: 'string' },
      operation: { type: 'string' },
      'evidence-dir': { type: 'string' },
      choice: { type: 'string' },
      tiers: { type: 'string' },
      repairs: { type: 'string' },
      roles: { type: 'string' },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  });
  if (values.help) {
    return null;
  }
  if (values.timeout !== undefined) timeoutMilliseconds(values.timeout);
  const [command, file] = positionals;
  if (
    !command ||
    !isCommand(command) ||
    (command === 'definition' ? positionals.length !== 1 : positionals.length !== 2 || !file)
  ) {
    throw new Error('Expected a command and its input. Run unit-generator --help.');
  }
  if (values.preset && (values.preset !== 'btd6' || !['prepare', 'author'].includes(command)))
    throw new Error('--preset btd6 applies only to prepare or author.');
  if (
    values.deliverable !== undefined &&
    (!['concept', 'mechanics'].includes(values.deliverable) ||
      !['character', 'generate', 'prepare', 'author'].includes(command))
  )
    throw new Error(
      '--deliverable must be concept or mechanics with character, generate, prepare or author.',
    );
  if (
    values.operation !== undefined &&
    (!['generate', 'redesign', 'prose-edit'].includes(values.operation) ||
      !['prepare', 'author'].includes(command))
  )
    throw new Error('--operation must be generate, redesign or prose-edit with prepare or author.');
  if (values.preset && values.deliverable === 'concept')
    throw new Error(
      '--preset btd6 is numerical. Use --deliverable concept for the public concept profile.',
    );
  if (
    values['evidence-dir'] !== undefined &&
    !['draft', 'author', 'generate', 'review'].includes(command)
  )
    throw new Error('--evidence-dir applies only to draft, author, generate or review.');
  if (
    values.choice &&
    (!['character', 'generate'].includes(command) || !/^[1-9][0-9]*$/.test(values.choice))
  )
    throw new Error('--choice requires a positive character ID with character or generate.');
  if (
    command === 'build'
      ? !/^[0-5],[0-5],[0-5]$/.test(values.tiers ?? '')
      : values.tiers !== undefined
  )
    throw new Error('--tiers A,B,C is required for build only, with three tiers from 0 to 5.');
  if (
    values.repairs !== undefined &&
    (!['draft', 'author', 'generate'].includes(command) || !/^[0-2]$/.test(values.repairs))
  )
    throw new Error('--repairs must be 0, 1 or 2 with draft, author or generate.');
  if (
    values.roles !== undefined &&
    (!['auto', 'typesafe', 'openrouter', 'off'].includes(values.roles) ||
      !['draft', 'author', 'generate', 'rank'].includes(command))
  )
    throw new Error(
      '--roles requires auto, typesafe, openrouter or off with draft, author, generate or rank.',
    );
  if ((values.previous || values.feedback) && !['prepare', 'author'].includes(command)) {
    throw new Error('--previous and --feedback apply only to prepare or author.');
  }
  if (values.details && command !== 'render') {
    throw new Error('--details applies only to render.');
  }
  return {
    command,
    file: file ?? '',
    values,
  };
}

type Invocation = NonNullable<ReturnType<typeof parseInvocation>>;

function timeoutMilliseconds(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1_000 > 2_147_483_647)
    throw new Error('--timeout must be a positive number of seconds within the timer limit.');
  return Math.ceil(seconds * 1_000);
}

function createModel(values: Invocation['values']): ModelClient {
  const provider = values.provider ?? (values.codex ? 'codex' : 'openrouter');
  if (!['openrouter', 'codex'].includes(provider)) {
    throw new Error('--provider must be openrouter or codex.');
  }
  if (provider !== 'codex' && values.codex) {
    throw new Error('--codex requires --provider codex.');
  }
  const timeoutMs = timeoutMilliseconds(values.timeout ?? (provider === 'codex' ? '600' : '120'));
  const reasoning = values.reasoning;
  const reasoningLevels =
    provider === 'codex' ? ['low', 'medium', 'high'] : ['none', 'low', 'medium', 'high'];
  if (reasoning && !reasoningLevels.includes(reasoning)) {
    throw new Error(`--reasoning must be one of: ${reasoningLevels.join(', ')}.`);
  }
  if (provider === 'openrouter') {
    return new OpenRouterModelClient({
      ...(values.model ? { model: values.model } : {}),
      ...(reasoning ? { reasoningEffort: reasoning as 'none' | 'low' | 'medium' | 'high' } : {}),
      timeoutMs,
    });
  }
  const executable =
    values.codex && /[/\\]/.test(values.codex) ? resolve(values.codex) : values.codex;
  return new CodexModelClient({
    ...(values.model ? { model: values.model } : {}),
    ...(reasoning ? { reasoningEffort: reasoning } : {}),
    timeoutMs,
    ...(executable ? { executable } : {}),
  });
}

async function executeCommand(
  invocation: Invocation,
  model: (input: unknown, concept: boolean) => Promise<ModelClient>,
  signal: AbortSignal,
): Promise<unknown> {
  const { command, file, values } = invocation;
  const options = {
    signal,
    roleRankingClient: createRoleRankingClient({
      env: { ...process.env, ...(values.roles ? { UNIT_ROLE_PROVIDER: values.roles } : {}) },
    }),
    ...(values.repairs !== undefined ? { maxRepairAttempts: Number(values.repairs) } : {}),
  };
  if (command === 'definition') return defaultAuthoringDefinition;
  if (command === 'character' || command === 'generate') {
    process.stderr.write('Finding character evidence...\n');
    const prepared = await prepareCharacter(file, {
      signal,
      ...(values.deliverable ? { deliverable: values.deliverable as 'concept' | 'mechanics' } : {}),
      ...(values.choice ? { choice: Number(values.choice) } : {}),
    });
    if (prepared.kind === 'choices') {
      throw new Error(
        'Choose a character using --choice ID: ' +
          prepared.choices.map((choice) => `${choice.id}: ${choice.name}`).join('; '),
      );
    }
    if (command === 'character') return prepared;
    process.stderr.write('Designing and checking the Unit...\n');
    return checkDraft(
      await draftUnit(
        prepared,
        await model(prepared, prepared.request.deliverable === 'concept'),
        options,
      ),
    );
  }
  if (command === 'prepare' || command === 'author') {
    process.stderr.write('Loading explicit inputs...\n');
    let request = await loadRequestFile(file, {
      signal,
      ...(values.previous ? { previousResultFile: resolve(values.previous) } : {}),
      ...(values.feedback !== undefined ? { feedback: values.feedback } : {}),
    });
    if (values.preset === 'btd6') request = applyDefaultProfile(request);
    if (values.deliverable === 'concept') request = applyConceptProfile(request);
    if (values.deliverable === 'mechanics') {
      if (request.deliverable === 'concept')
        throw new Error(
          'Concept formalization is not implemented. Supply a separate mechanics request with an explicit mechanicsDefinition; --deliverable does not translate concept rules.',
        );
      const { conceptRules: _conceptRules, ...fields } = request;
      request = { ...fields, deliverable: 'mechanics' };
      if (!request.mechanicsDefinition) request = applyDefaultProfile(request);
    }
    if (values.operation)
      request = {
        ...request,
        operation: values.operation as 'generate' | 'redesign' | 'prose-edit',
      };
    if (command === 'prepare') {
      return prepareRequest(request);
    }
    process.stderr.write('Drafting and reviewing...\n');
    return authorUnit(request, await model(request, request.deliverable === 'concept'), options);
  }
  const input = await readJsonFile(file);
  switch (command) {
    case 'rank': {
      const view = readArtifactView(input);
      await verifyPrepared(view.prepared);
      if (!view.prepared.request.mechanicsDefinition)
        throw new Error('Role ranking requires a Unit with a structured mechanics definition.');
      return rankUnitRoles(
        view.candidate,
        view.prepared.request.mechanicsDefinition,
        options.roleRankingClient,
        signal,
      );
    }
    case 'build': {
      const view = readArtifactView(input);
      await verifyPrepared(view.prepared);
      if (!view.candidate.blueprint || !view.prepared.request.mechanicsDefinition)
        throw new Error(
          'This Unit has no typed mechanics blueprint. Generate it with the default definition first.',
        );
      return resolveBuild(
        view.candidate.blueprint,
        values.tiers!.split(',').map(Number) as BuildSelection,
        view.prepared.request.mechanicsDefinition,
      );
    }
    case 'draft':
      process.stderr.write('Drafting...\n');
      return draftUnit(
        input as PreparedRequest,
        await model(input, (input as PreparedRequest).request?.deliverable === 'concept'),
        options,
      );
    case 'check':
      return checkDraft(input as DraftArtifact);
    case 'review':
      process.stderr.write('Reviewing...\n');
      return reviewDraft(
        input as CheckedArtifact,
        await model(
          input,
          (input as CheckedArtifact).draft?.prepared?.request?.deliverable === 'concept',
        ),
        options,
      );
    case 'render':
      return renderArtifact(input, { details: values.details });
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
  loadLocalEnvironment();
  const invocation = parseInvocation();
  if (invocation === null) {
    process.stdout.write(help);
    return;
  }
  if (invocation.values.output) {
    await ensureNewOutput(invocation.values.output);
  }
  let evidence: EvidenceRun | undefined;
  let evidenceFinished = false;
  const model = async (input: unknown, concept: boolean) => {
    const client = createModel(invocation.values);
    if (concept || invocation.values['evidence-dir']) {
      evidence = await createEvidenceRun({
        directory: invocation.values['evidence-dir'] ?? '.runs/evidence',
        input,
        settings: { operation: invocation.command },
      });
      process.stderr.write(`Evidence: ${evidence.directory}\n`);
      return evidence.wrap(client);
    }
    return client;
  };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const artifact = await executeCommand(invocation, model, controller.signal);
    await evidence?.finish(artifact);
    evidenceFinished = true;
    await emitArtifact(invocation, artifact);
  } catch (error) {
    if (!evidenceFinished) await evidence?.fail(error);
    throw error;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ModelExecutionError && error.usage) {
    return (
      `${error.message}\nFailed attempt: ${formatCost(error.usage.costUsd)}; ` +
      `tokens: ${error.usage.totalTokens?.toLocaleString('en-US') ?? 'unavailable'}.`
    );
  }
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
