import { createProvidersFromEnv } from '../../../packages/providers/dist/index.js';

export const executionModel = 'gpt-5.6-luna';

export function createLunaExecution(env, { effort, streaming = true }) {
  if (!['low', 'medium', 'high', 'xhigh'].includes(effort))
    throw Error('Invalid reasoning effort.');
  const { execution } = createProvidersFromEnv({
    ...env,
    UNIT_PROVIDER: 'openai-compatible',
    UNIT_COMMAND_EXECUTABLE: undefined,
    UNIT_OPENAI_MODEL: executionModel,
    UNIT_OPENAI_REASONING_EFFORT: effort,
    UNIT_OPENAI_STREAM: String(streaming)
  });
  if (!execution.model) throw Error('No configured Luna HTTP provider.');
  return execution;
}

export function assertLunaReply(reply) {
  // The HTTP adapter uses the configured model when the server omits its model ID.
  // This checks the adapter identity, not independent proof of remote execution.
  if (typeof reply.model !== 'string' || reply.model.toLowerCase() !== executionModel)
    throw Error('Provider returned a different model than authorized.');
}
