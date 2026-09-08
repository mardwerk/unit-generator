import { readFileSync } from 'node:fs';
import { RunError, type Execution, type ModelAdapter } from '@mardwerk/unit-core';
import { createCommandProvider, createHttpProvider } from './model.js';
import { createSourceAdapter } from './discovery.js';

export function createProvidersFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const providers: Record<string, ModelAdapter> = {};
  let key = env.UNIT_OPENAI_API_KEY;
  if (!key && env.UNIT_OPENAI_API_KEY_FILE) {
    try {
      key = readFileSync(env.UNIT_OPENAI_API_KEY_FILE, 'utf8').trim();
    } catch {
      throw new RunError('configuration', 'Cannot read the configured model credential file.');
    }
  }
  const number = (name: string, fallback: number) => {
    const value = env[name] ? Number(env[name]) : fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > 2 ** 30)
      throw new RunError('configuration', `Invalid numeric setting: ${name}`);
    return value;
  };
  const timeoutMs = number('UNIT_PROVIDER_TIMEOUT_MS', 120_000);
  const maxOutputBytes = number('UNIT_PROVIDER_MAX_OUTPUT_BYTES', 2 * 1024 * 1024);
  if (env.UNIT_OPENAI_MODEL && (env.UNIT_OPENAI_ENDPOINT || key))
    providers['openai-compatible'] = createHttpProvider({
      endpoint: env.UNIT_OPENAI_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions',
      model: env.UNIT_OPENAI_MODEL,
      headers: key ? { authorization: `Bearer ${key}` } : undefined,
      reasoningEffort: env.UNIT_OPENAI_REASONING_EFFORT || undefined,
      stream: env.UNIT_OPENAI_STREAM === 'true',
      timeoutMs,
      maxResponseBytes: maxOutputBytes,
      structured: env.UNIT_MODEL_STRUCTURED !== 'false'
    });
  if (env.UNIT_COMMAND_EXECUTABLE) {
    let args: unknown, commandEnv: unknown;
    try {
      args = JSON.parse(env.UNIT_COMMAND_ARGS ?? '[]');
      commandEnv = JSON.parse(env.UNIT_COMMAND_ENV ?? '{}');
    } catch {
      throw new RunError('configuration', 'Command arguments and environment must be valid JSON.');
    }
    if (
      !Array.isArray(args) ||
      args.some((v) => typeof v !== 'string') ||
      !commandEnv ||
      typeof commandEnv !== 'object' ||
      Array.isArray(commandEnv) ||
      Object.values(commandEnv).some((v) => typeof v !== 'string')
    )
      throw new RunError(
        'configuration',
        'Command configuration requires an argument array and string environment values.'
      );
    providers.command = createCommandProvider({
      executable: env.UNIT_COMMAND_EXECUTABLE,
      args,
      env: { PATH: env.PATH ?? '', ...(commandEnv as Record<string, string>) },
      timeoutMs,
      maxOutputBytes
    });
  }
  const selected =
    env.UNIT_PROVIDER ?? (providers['openai-compatible'] ? 'openai-compatible' : 'command');
  const execution: Execution = {
    model: providers[selected],
    sources: createSourceAdapter(),
    limits: {
      callTimeoutMs: timeoutMs,
      timeoutMs: number('UNIT_RUN_TIMEOUT_MS', Math.max(360_000, timeoutMs * 3)),
      maxOutputBytes,
      maxOutputTokens: number('UNIT_PROVIDER_MAX_OUTPUT_TOKENS', 24000)
    },
    policy: {
      network: env.UNIT_RESEARCH_NETWORK === 'allow' ? 'allow' : 'deny',
      discovery: env.UNIT_RESEARCH_DISCOVERY === 'true',
      followLinks: env.UNIT_RESEARCH_FOLLOW_LINKS === 'true',
      allowUngrounded: env.UNIT_ALLOW_UNGROUNDED === 'true'
    }
  };
  return {
    providers,
    execution,
    descriptions: Object.keys(providers).map((id) => ({
      id,
      configured: true,
      model: id === 'openai-compatible' ? env.UNIT_OPENAI_MODEL : 'local-command'
    }))
  };
}
