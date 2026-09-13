import { readFileSync } from 'node:fs';
import { RunError, type Execution, type ModelAdapter } from '@mardwerk/unit-core';
import { createCommandProvider, createHttpProvider } from './model.js';
import { createSourceAdapter } from './discovery.js';

export type GenerationMode = 'default' | 'quality';
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
  const timeoutMs = number('UNIT_PROVIDER_TIMEOUT_MS', 300_000);
  const maxOutputBytes = number('UNIT_PROVIDER_MAX_OUTPUT_BYTES', 2 * 1024 * 1024);
  const maxWireBytes = number('UNIT_PROVIDER_MAX_WIRE_BYTES', 32 * 1024 * 1024);
  const modelFor = {
    default: env.UNIT_DEFAULT_MODEL ?? 'gpt-5.6-luna',
    quality: env.UNIT_QUALITY_MODEL ?? 'gpt-6-astra'
  };
  const effortFor = {
    default: env.UNIT_DEFAULT_REASONING_EFFORT ?? 'high',
    quality: env.UNIT_QUALITY_REASONING_EFFORT ?? 'low'
  };
  const modes = (['default', 'quality'] as const).map((id) => ({
    id,
    label: id === 'default' ? 'Default' : 'Quality',
    model: modelFor[id],
    reasoningEffort: effortFor[id],
    configured: Boolean(env.UNIT_OPENAI_ENDPOINT || key)
  }));
  const modeProviders: Partial<Record<GenerationMode, ModelAdapter>> = {};
  for (const mode of modes)
    if (mode.configured)
      modeProviders[mode.id] = createHttpProvider({
        endpoint: env.UNIT_OPENAI_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions',
        model: mode.model,
        headers: key ? { authorization: `Bearer ${key}` } : undefined,
        reasoningEffort: mode.reasoningEffort,
        stream: env.UNIT_OPENAI_STREAM === 'true',
        jsonMode: true,
        timeoutMs,
        maxResponseBytes: maxWireBytes,
        maxContentBytes: maxOutputBytes,
        structured: env.UNIT_MODEL_STRUCTURED !== 'false'
      });
  if (env.UNIT_OPENAI_MODEL && (env.UNIT_OPENAI_ENDPOINT || key))
    providers['openai-compatible'] = createHttpProvider({
      endpoint: env.UNIT_OPENAI_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions',
      model: env.UNIT_OPENAI_MODEL,
      headers: key ? { authorization: `Bearer ${key}` } : undefined,
      reasoningEffort: env.UNIT_OPENAI_REASONING_EFFORT || undefined,
      stream: env.UNIT_OPENAI_STREAM === 'true',
      jsonMode: true,
      timeoutMs,
      maxResponseBytes: maxWireBytes,
      maxContentBytes: maxOutputBytes,
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
  if (env.UNIT_PROVIDER && !providers[env.UNIT_PROVIDER])
    throw new RunError(
      'configuration',
      'UNIT_PROVIDER names an unconfigured provider. Configure it or remove the override.'
    );
  const execution: Execution = {
    model: providers[selected] ?? modeProviders.default,
    sources: createSourceAdapter(),
    limits: {
      callTimeoutMs: timeoutMs,
      timeoutMs: number('UNIT_RUN_TIMEOUT_MS', Math.max(360_000, timeoutMs * 6)),
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
  const executionForMode = (mode: GenerationMode): Execution => {
    if (mode !== 'default' && mode !== 'quality')
      throw new RunError('configuration', 'Choose Default or Quality.');
    const model = modeProviders[mode];
    if (!model)
      throw new RunError(
        'model-unavailable',
        `Configure UNIT_OPENAI_API_KEY or UNIT_OPENAI_ENDPOINT to use ${mode === 'default' ? 'Default' : 'Quality'} generation.`
      );
    return { ...execution, model, reviewFidelity: true };
  };
  return {
    modes,
    executionForMode,
    providers,
    execution,
    descriptions: Object.keys(providers).map((id) => ({
      id,
      configured: true,
      model: id === 'openai-compatible' ? env.UNIT_OPENAI_MODEL : 'local-command'
    }))
  };
}
