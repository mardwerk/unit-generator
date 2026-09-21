import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import type { ModelClient, ModelRequest, ModelResponse } from '../core/model.js';
import { ModelExecutionError } from '../core/model.js';
import { codexFailure, runCodexProcess } from './codex-process.js';

export interface CodexOptions {
  executable?: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Config inspected for tool isolation. Must match the config Codex itself loads. */
  configPath?: string;
}

type CodexSettings = CodexOptions &
  Required<Pick<CodexOptions, 'executable' | 'timeoutMs' | 'maxOutputBytes' | 'configPath'>>;

interface CodexConfig {
  servers: string[];
  model?: string;
  reasoningEffort?: string;
}

/** Each generation is a fresh local Codex invocation using the existing login. */
export class CodexModelClient implements ModelClient {
  private selectedModel: string | undefined;
  private selectedEffort: string | undefined;
  private readonly options: CodexSettings;

  constructor(options: CodexOptions = {}) {
    this.options = resolveOptions(options);
    this.selectedModel = options.model;
    this.selectedEffort = options.reasoningEffort;
  }

  get id(): string {
    const model = this.selectedModel ?? 'configured-default';
    const effort = this.selectedEffort ? `:reasoning=${this.selectedEffort}` : '';
    return `codex:${model}${effort}`;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.signal?.aborted) {
      throw codexFailure({ code: 'CANCELLED', message: 'Codex generation was cancelled.' });
    }
    try {
      const config = await inspectConfig(this.options.configPath);
      this.selectedModel = this.options.model ?? config.model;
      this.selectedEffort = this.options.reasoningEffort ?? config.reasoningEffort;
      const directory = await mkdtemp(join(tmpdir(), 'unit-generator-codex-'));
      try {
        const workspace = join(directory, 'workspace');
        const schema = join(directory, 'schema.json');
        const output = join(directory, 'result.json');
        await mkdir(workspace);
        await writeFile(schema, JSON.stringify(request.schema), { mode: 0o600 });
        await runCodexProcess({
          executable: this.options.executable,
          args: codexArguments(this.options, config, {
            schema,
            output,
          }),
          cwd: workspace,
          output,
          prompt: `${request.system}\n\n${request.prompt}`,
          signal: request.signal,
          timeoutMs: this.options.timeoutMs,
          maxOutputBytes: this.options.maxOutputBytes,
        });
        return { output: await readCodexResponse(output, this.options.maxOutputBytes) };
      } finally {
        await rm(directory, {
          recursive: true,
          force: true,
        });
      }
    } catch (error) {
      if (error instanceof ModelExecutionError) throw error;
      // Filesystem and subprocess exceptions may include private paths or source text.
      throw codexFailure({
        code: 'MODEL_FAILED',
        message:
          'Codex generation could not use its temporary workspace safely. Check local disk access and retry this stage.',
      });
    }
  }
}

function resolveOptions(options: CodexOptions): CodexSettings {
  const settings = {
    ...options,
    executable: options.executable ?? 'codex',
    timeoutMs: options.timeoutMs ?? 600_000,
    maxOutputBytes: options.maxOutputBytes ?? 2_000_000,
    configPath:
      options.configPath ??
      join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml'),
  };
  const validTimeout =
    Number.isSafeInteger(settings.timeoutMs) &&
    settings.timeoutMs > 0 &&
    settings.timeoutMs <= 2_147_483_647;
  const validLimit = Number.isSafeInteger(settings.maxOutputBytes) && settings.maxOutputBytes > 0;
  if (!validTimeout || !validLimit) {
    throw codexFailure({
      code: 'MODEL_FAILED',
      message: 'Codex timeout and output limit must be positive bounded integers.',
    });
  }
  return settings;
}

function codexArguments(
  options: CodexSettings,
  config: CodexConfig,
  files: {
    schema: string;
    output: string;
  },
): string[] {
  const { schema, output } = files;
  const args = [
    'exec',
    '--ephemeral',
    '--ignore-rules',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--color',
    'never',
    '--output-schema',
    schema,
    '--output-last-message',
    output,
    '-c',
    'approval_policy="never"',
    '-c',
    'web_search="disabled"',
    '-c',
    'project_doc_max_bytes=0',
    '-c',
    'notify=[]',
    '-c',
    'developer_instructions="Produce only the requested structured answer from the ' +
      'supplied input. Do not use tools, inspect files, execute commands, browse, or ' +
      'access any external context."',
    '--enable',
    'skip_host_skill_discovery',
  ];
  for (const feature of [
    'shell_tool',
    'unified_exec',
    'apps',
    'plugins',
    'hooks',
    'browser_use',
    'browser_use_external',
    'computer_use',
    'image_generation',
    'multi_agent',
    'multi_agent_v2',
    'memories',
    'skill_search',
    'shell_snapshot',
  ]) {
    args.push('--disable', feature);
  }
  // Codex splits override paths on dots without unquoting keys. Put quoted
  // server names in the TOML value so dotted names target the real server.
  if (config.servers.length) {
    args.push(
      '-c',
      `mcp_servers={${config.servers.map((server) => `${JSON.stringify(server)}={enabled=false}`).join(',')}}`,
    );
  }
  if (options.reasoningEffort) {
    args.push('-c', `model_reasoning_effort=${JSON.stringify(options.reasoningEffort)}`);
  }
  if (options.model) {
    args.push('--model', options.model);
  }
  args.push('-');
  return args;
}

async function inspectConfig(configPath: string): Promise<CodexConfig> {
  try {
    const info = await stat(configPath);
    if (!info.isFile() || info.size > 1_000_000) {
      throw new Error('Invalid configuration file.');
    }
    const config = parse(await readFile(configPath, 'utf8'));
    const servers = config.mcp_servers;
    return {
      servers:
        servers && typeof servers === 'object' && !Array.isArray(servers)
          ? Object.keys(servers)
          : [],
      ...(typeof config.model === 'string' ? { model: config.model } : {}),
      ...(typeof config.model_reasoning_effort === 'string'
        ? { reasoningEffort: config.model_reasoning_effort }
        : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { servers: [] };
    }
    // TOML errors can quote source lines containing credentials. Never expose them.
    throw codexFailure({
      code: 'MODEL_FAILED',
      message:
        'Codex configuration could not be inspected safely. Check that config.toml is ' +
        'valid TOML and under 1 MB.',
    });
  }
}

async function readCodexResponse(output: string, maxOutputBytes: number): Promise<unknown> {
  let result: string;
  try {
    const size = (await stat(output)).size;
    if (size > maxOutputBytes) {
      throw codexFailure({
        code: 'OUTPUT_LIMIT',
        message: 'Codex structured response exceeded the configured output limit.',
      });
    }
    result = await readFile(output, 'utf8');
  } catch (error) {
    if (error instanceof ModelExecutionError) {
      throw error;
    }
    throw codexFailure({
      code: 'MODEL_OUTPUT_INVALID',
      message:
        'Codex did not produce a structured final response. Check the local Codex login ' +
        'and model configuration.',
    });
  }
  try {
    return JSON.parse(result);
  } catch {
    throw codexFailure({
      code: 'MODEL_OUTPUT_INVALID',
      message: 'Codex returned invalid JSON in its structured final response.',
    });
  }
}
