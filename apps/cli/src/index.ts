#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  generate,
  research,
  validate,
  accepted,
  RunError,
  type Execution,
  type ResearchInput,
  type RunResult,
  type ResearchResult
} from '@mardwerk/unit-core';
import { loadDefinition, loadTrustedModule, readJson, readText } from '@mardwerk/unit-core/files';
import {
  loadBundledDefinition,
  defaultDefinitionId,
  bundledDefinitions,
  implementations,
  createBundledFixture
} from '@mardwerk/unit-definitions';
import { qualifyUnit } from '@mardwerk/unit-lab';
import { createProvidersFromEnv } from '@mardwerk/unit-providers';

const help = `mardwerk-unit generate <subject> [--original] [--research] [--allow-ungrounded]
  [--input request.json] [--knowledge research.json] [--source-url URL] [--source-file file]
  [--intent text] [--constraints constraints.json] [--context context.json]
  [--definition tower-defense|manga-mayhem|classic-three-path|btd6-derived|merge-family-example|directory|trusted.mjs]
  [--mode default|quality] [--provider fixture|openai-compatible|command] [--out result.json] [--json]
  [--max-sources 1..8]
mardwerk-unit research <subject> [--research] [--source-url URL] [--source-file file]
  [--knowledge research.json] [--continuity text] [--out research.json]
mardwerk-unit validate <result-or-content.json> [--definition definition] [--input request.json]
mardwerk-unit playground [--port 5173]

Stdout is JSON; progress is JSON lines on stderr. Nothing is saved unless --out is given.
Character generation discovers and reads public sources by default. --no-research disables network research.
Default uses Luna High; --mode quality uses Astra Low. Both run the same validation.
--original identifies an invented concept. --allow-ungrounded explicitly permits unverified generation.
--no-research overrides any configured network permission. A .mjs definition is trusted local code.
`;
export interface CliOptions {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  execution?: Execution;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}
function exitFor(result: { status?: string; error?: { code: string } }) {
  if (result.status === 'success') return 0;
  if (result.status === 'cancelled' && result.error?.code !== 'deadline') return 130;
  const code = result.error?.code ?? '';
  if (
    [
      'invalid-input',
      'invalid-definition',
      'invalid-configuration',
      'invalid-limits',
      'invalid-policy'
    ].includes(code)
  )
    return 2;
  if (/limit|deadline/.test(code)) return 4;
  if (/provider|model|timeout|refusal|truncated|invalid-json/.test(code)) return 3;
  if (code === 'internal-error') return 5;
  return 1;
}
async function selectDefinition(name: string) {
  if ((bundledDefinitions as readonly string[]).includes(name)) return loadBundledDefinition(name);
  return /\.[cm]?js$/.test(name) ? loadTrustedModule(name) : loadDefinition(name, implementations);
}
export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((text) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  let command = argv[0] ?? 'help';
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        json: { type: 'boolean' },
        input: { type: 'string' },
        request: { type: 'string' },
        out: { type: 'string' },
        definition: { type: 'string' },
        knowledge: { type: 'string' },
        intent: { type: 'string' },
        constraints: { type: 'string' },
        context: { type: 'string' },
        continuity: { type: 'string' },
        provider: { type: 'string' },
        mode: { type: 'string' },
        original: { type: 'boolean' },
        research: { type: 'boolean' },
        'no-research': { type: 'boolean' },
        'allow-ungrounded': { type: 'boolean' },
        'follow-links': { type: 'boolean' },
        'source-url': { type: 'string', multiple: true },
        'source-file': { type: 'string', multiple: true },
        'max-sources': { type: 'string' },
        port: { type: 'string' }
      }
    });
    command = positionals[0] ?? 'help';
    if (values.help || command === 'help') {
      stdout(help);
      return 0;
    }
    if (!['generate', 'research', 'validate', 'playground'].includes(command))
      throw new RunError('usage', 'Use generate, research, validate, or playground.');
    if (values.research && values['no-research'])
      throw new RunError('usage', 'Choose either --research or --no-research.');
    if (values.input && values.request) throw new RunError('usage', 'Use one input file.');
    if (values.out)
      await access(values.out).then(
        () => {
          throw new RunError('output-exists', 'Export destination already exists.');
        },
        (error) => {
          if (error.code !== 'ENOENT') throw error;
        }
      );
    if (command === 'playground') {
      const entry = fileURLToPath(new URL('../../web/start.mjs', import.meta.url));
      try {
        await access(entry);
        await access(fileURLToPath(new URL('../../web/build/index.js', import.meta.url)));
      } catch {
        throw new RunError(
          'playground-unavailable',
          'Build the optional playground with pnpm --filter @mardwerk/unit-web build.'
        );
      }
      const port = Number(values.port ?? 5173);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new RunError('usage', 'Invalid playground port.');
      stderr(`Local playground: http://127.0.0.1:${port}\n`);
      return await new Promise<number>((resolve) => {
        const child = spawn(process.execPath, [entry], {
          stdio: 'inherit',
          env: {
            ...(options.env ?? process.env),
            HOST: '127.0.0.1',
            PORT: String(port),
            ORIGIN: `http://127.0.0.1:${port}`
          }
        });
        const abort = () => child.kill('SIGTERM');
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
        const done = (code: number) => {
          options.signal?.removeEventListener('abort', abort);
          resolve(code);
        };
        child.once('error', () => done(1));
        child.once('exit', (code) => done(options.signal?.aborted ? 130 : (code ?? 1)));
      });
    }
    if (values.mode && !['default', 'quality'].includes(values.mode))
      throw new RunError('usage', 'Choose --mode default or --mode quality.');
    const maxSources =
      values['max-sources'] === undefined ? undefined : Number(values['max-sources']);
    if (
      maxSources !== undefined &&
      (!Number.isInteger(maxSources) || maxSources < 1 || maxSources > 8)
    )
      throw new RunError('usage', '--max-sources must be an integer from 1 to 8.');
    if (values.mode && values.provider)
      throw new RunError(
        'usage',
        'Choose a generation mode or an advanced provider override, not both.'
      );
    const fixtureMode = values.provider === 'fixture';
    const configured =
      options.execution || fixtureMode || command === 'validate'
        ? { providers: {}, execution: options.execution ?? {}, executionForMode: undefined }
        : createProvidersFromEnv(options.env ?? process.env);
    const selectedExecution =
      !options.execution &&
      !fixtureMode &&
      command !== 'validate' &&
      !(command === 'research' && (values.original || values['no-research'] || values.knowledge)) &&
      !values.provider
        ? configured.executionForMode!(values.mode === 'quality' ? 'quality' : 'default')
        : configured.execution;
    const execution: Execution = {
      ...selectedExecution,
      ...(maxSources === undefined ? {} : { limits: { ...selectedExecution.limits, maxSources } }),
      ...(!fixtureMode && command === 'generate' ? { reviewFidelity: true } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      policy: {
        ...selectedExecution.policy,
        ...(!options.execution && !fixtureMode && command !== 'validate'
          ? { network: 'allow' as const, discovery: true, followLinks: true }
          : {}),
        ...(values.research ? { network: 'allow' as const, discovery: true } : {}),
        ...(values['no-research']
          ? { network: 'deny' as const, discovery: false, followLinks: false }
          : {}),
        ...(values['allow-ungrounded'] ? { allowUngrounded: true } : {}),
        ...(values['follow-links'] ? { followLinks: true } : {})
      },
      ...(!fixtureMode
        ? {
            evaluate:
              selectedExecution.evaluate ??
              (({ definitionId, candidate, research }) =>
                qualifyUnit({ definitionId, candidate, research }))
          }
        : {}),
      onProgress: (event) => stderr(JSON.stringify(event) + '\n')
    };
    if (values.provider && !fixtureMode) {
      const provider = (configured.providers as Record<string, Execution['model']>)[
        values.provider
      ];
      if (!provider)
        throw new RunError('model-unavailable', 'Selected provider is not configured.');
      execution.model = provider;
    }
    const inputPath = values.input ?? values.request;
    let input: unknown = inputPath ? await readJson(inputPath) : undefined;
    let result: unknown;
    let exitCode = 0;
    if (command === 'validate') {
      if (positionals.length !== 2) throw new RunError('usage', 'Validate requires one JSON file.');
      const value = await readJson(positionals[1]!);
      const envelope = value as Partial<RunResult>;
      const name = values.definition ?? envelope.definition?.id ?? defaultDefinitionId;
      const definition = await selectDefinition(name);
      if (
        envelope.definition &&
        !values.definition &&
        (envelope.definition.version !== definition.version ||
          envelope.definition.fileDigest !== definition.fileDigest ||
          envelope.definition.implementationVersion !== definition.implementationVersion ||
          JSON.stringify(envelope.definition.configuration) !==
            JSON.stringify(definition.configuration))
      )
        throw new RunError(
          'definition-mismatch',
          'Select the original definition explicitly before revalidating changed rules.'
        );
      const report = await validate(
        definition,
        envelope.output ?? envelope.candidate ?? value,
        input ?? envelope.input,
        execution.signal
      );
      result = {
        schemaVersion: '0.2',
        status: accepted(report) ? 'success' : 'failed',
        definition: { id: definition.id, version: definition.version },
        validation: report
      };
      exitCode = accepted(report) ? 0 : 1;
    } else {
      const definition =
        command === 'generate'
          ? await selectDefinition(values.definition ?? defaultDefinitionId)
          : undefined;
      if (input === undefined) {
        if (positionals.length !== 2)
          throw new RunError('usage', `${command} requires a subject or --input file.`);
        input =
          definition?.id === 'merge-family-example'
            ? { brief: positionals[1] }
            : { subject: positionals[1] };
      } else if (positionals.length !== 1)
        throw new RunError('usage', 'Choose positional input or an input file.');
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new RunError('usage', 'Input must be a JSON object.');
      const request = input as Record<string, unknown>;
      if (values.original) request.kind = 'original';
      for (const field of ['intent', 'continuity'] as const)
        if (values[field]) request[field] = values[field];
      for (const field of ['constraints', 'context', 'knowledge'] as const)
        if (values[field]) request[field] = await readJson(values[field]);
      const supplied: Array<unknown> = Array.isArray(request.sources) ? [...request.sources] : [];
      supplied.push(...(values['source-url'] ?? []));
      for (const filename of values['source-file'] ?? []) {
        const content = await readText(filename, 256 * 1024);
        supplied.push({
          id: createHash('sha256').update(content).digest('hex').slice(0, 24),
          title: path.basename(filename),
          content,
          origin: 'supplied',
          status: 'read',
          truncated: false,
          omissions: []
        });
      }
      if (supplied.length) request.sources = supplied;
      if (fixtureMode) {
        if (command !== 'generate')
          throw new RunError(
            'usage',
            'Fixture mode generates demo content; it does not research real characters.'
          );
        const fixture = createBundledFixture(definition!.id, request);
        execution.model = { generate: async () => ({ value: fixture, mode: 'fixture' }) };
      }
      const outcome: RunResult | ResearchResult =
        command === 'generate'
          ? await generate(definition!, request, execution)
          : await research(request as unknown as ResearchInput, execution);
      result = outcome;
      exitCode = exitFor(outcome);
    }
    const text = JSON.stringify(result, null, 2) + '\n';
    if (values.out) {
      try {
        await writeFile(values.out, text, { flag: 'wx' });
      } catch {
        stderr(
          JSON.stringify({
            type: 'error',
            code: 'export-failed',
            message: 'Export failed. The complete result is returned on stdout.'
          }) + '\n'
        );
        exitCode = 1;
      }
    }
    stdout(text);
    return exitCode;
  } catch (error) {
    const known = error instanceof RunError;
    const code = known ? error.code : 'usage-or-io';
    const message = known
      ? error.message
      : 'Check arguments and supplied file paths. No output was accepted.';
    stdout(
      JSON.stringify({
        schemaVersion: '0.2',
        status: 'failed',
        command,
        error: { code, message }
      }) + '\n'
    );
    return code === 'usage' || code === 'usage-or-io'
      ? 2
      : exitFor({ status: 'failed', error: { code } });
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal });
  process.removeListener('SIGINT', abort);
  process.removeListener('SIGTERM', abort);
}
