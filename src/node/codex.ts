import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import type { ModelClient, ModelRequest } from '../core/model.js';

export interface CodexOptions {
  executable?: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Config inspected for tool isolation. Must match the config Codex itself loads. */
  configPath?: string;
}

/** Each generation is a fresh local Codex invocation using the existing login. */
export class CodexModelClient implements ModelClient {
  private selectedModel: string | undefined;
  private selectedEffort: string | undefined;
  private readonly options: CodexOptions & Required<Pick<CodexOptions, 'executable' | 'timeoutMs' | 'maxOutputBytes' | 'configPath'>>;

  get id(): string {
    return `codex:${this.selectedModel ?? 'configured-default'}${this.selectedEffort ? `:reasoning=${this.selectedEffort}` : ''}`;
  }

  constructor(options: CodexOptions = {}) {
    this.options = { ...options, executable: options.executable ?? 'codex', timeoutMs: options.timeoutMs ?? 600_000, maxOutputBytes: options.maxOutputBytes ?? 2_000_000, configPath: options.configPath ?? join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml') };
    if (!Number.isSafeInteger(this.options.timeoutMs) || this.options.timeoutMs <= 0 || !Number.isSafeInteger(this.options.maxOutputBytes) || this.options.maxOutputBytes <= 0) {
      throw new Error('Codex timeout and output limit must be positive integers.');
    }
    this.selectedModel = options.model;
    this.selectedEffort = options.reasoningEffort;
  }

  async generate(request: ModelRequest): Promise<unknown> {
    if (request.signal?.aborted) throw new Error('Codex generation was cancelled.');
    const config = await this.inspectConfig();
    this.selectedModel = this.options.model ?? config.model;
    this.selectedEffort = this.options.reasoningEffort ?? config.reasoningEffort;
    const directory = await mkdtemp(join(tmpdir(), 'unit-generator-codex-'));
    try {
      const workspace = join(directory, 'workspace');
      const schema = join(directory, 'schema.json');
      const output = join(directory, 'result.json');
      await mkdir(workspace);
      await writeFile(schema, JSON.stringify(request.schema), { mode: 0o600 });
      const args = ['exec', '--ephemeral', '--ignore-rules', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '--output-schema', schema, '--output-last-message', output,
        '-c', 'approval_policy="never"', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', '-c', 'notify=[]',
        '-c', 'developer_instructions="Produce only the requested structured answer from the supplied input. Do not use tools, inspect files, execute commands, browse, or access any external context."',
        '--enable', 'skip_host_skill_discovery'];
      for (const feature of ['shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'multi_agent', 'multi_agent_v2', 'memories', 'skill_search', 'shell_snapshot']) {
        args.push('--disable', feature);
      }
      // Codex splits override paths on dots without unquoting keys. Put quoted
      // server names in the TOML value so dotted names target the real server.
      if (config.servers.length) args.push('-c', `mcp_servers={${config.servers.map(server => `${JSON.stringify(server)}={enabled=false}`).join(',')}}`);
      if (this.options.reasoningEffort) args.push('-c', `model_reasoning_effort=${JSON.stringify(this.options.reasoningEffort)}`);
      if (this.options.model) args.push('--model', this.options.model);
      args.push('-');
      const prompt = `${request.system}\n\n${request.prompt}`;
      await this.run(args, workspace, output, prompt, request.signal);
      let result: string;
      try {
        const size = (await stat(output)).size;
        if (size > this.options.maxOutputBytes) throw new Error('Codex structured response exceeded the configured output limit.');
        result = await readFile(output, 'utf8');
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Codex')) throw error;
        throw new Error('Codex did not produce a structured final response. Check the local Codex login and model configuration.');
      }
      try {
        return JSON.parse(result);
      } catch {
        throw new Error('Codex returned invalid JSON in its structured final response.');
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async inspectConfig(): Promise<{ servers: string[]; model?: string; reasoningEffort?: string }> {
    try {
      const info = await stat(this.options.configPath);
      if (!info.isFile() || info.size > 1_000_000) throw new Error('Invalid configuration file.');
      const config = parse(await readFile(this.options.configPath, 'utf8'));
      const servers = config.mcp_servers;
      return {
        servers: servers && typeof servers === 'object' && !Array.isArray(servers) ? Object.keys(servers) : [],
        ...(typeof config.model === 'string' ? { model: config.model } : {}),
        ...(typeof config.model_reasoning_effort === 'string' ? { reasoningEffort: config.model_reasoning_effort } : {}),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { servers: [] };
      // TOML errors can quote source lines containing credentials. Never expose them.
      throw new Error('Codex configuration could not be inspected safely. Check that config.toml is valid TOML and under 1 MB.');
    }
  }

  private run(args: string[], cwd: string, output: string, prompt: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('Codex generation was cancelled.')); return; }
      const child = spawn(this.options.executable, args, { cwd, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      let failure: Error | undefined;
      let bytes = 0;
      const stop = (message: string) => {
        if (failure) return;
        failure = new Error(message);
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch { child.kill('SIGKILL'); }
      };
      const timer = setTimeout(() => stop('Codex generation timed out.'), this.options.timeoutMs);
      const monitor = setInterval(() => {
        void stat(output).then(info => {
          if (info.size > this.options.maxOutputBytes) stop('Codex structured response exceeded the configured output limit.');
        }).catch(() => {});
      }, 100);
      const cancelled = () => stop('Codex generation was cancelled.');
      signal?.addEventListener('abort', cancelled, { once: true });
      const count = (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > this.options.maxOutputBytes) stop('Codex process exceeded the configured output limit.');
      };
      child.stdout.on('data', count);
      child.stderr.on('data', count);
      child.stdin.on('error', () => { /* Process errors and exit status provide safe diagnostics. */ });
      child.on('error', () => { failure ??= new Error('Codex could not start. Install Codex and run codex login before generating.'); });
      child.on('close', (code) => {
        clearTimeout(timer);
        clearInterval(monitor);
        signal?.removeEventListener('abort', cancelled);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`Codex failed with exit status ${code ?? 'unknown'}. Check codex login status and the configured model. Provider output was omitted to protect secrets.`));
        else resolve();
      });
      child.stdin.end(prompt);
    });
  }
}
