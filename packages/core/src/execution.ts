import type {
  Context,
  Execution,
  Failure,
  Limits,
  Metadata,
  ProgressEvent,
  ResearchPolicy,
  ResearchResult
} from './contracts.js';
import { jsonCopy, RunError } from './json.js';
import { researchWithin } from './research.js';

export const DEFAULT_LIMITS: Limits = {
  maxModelCalls: 6,
  maxResearchCalls: 4,
  maxRepairs: 1,
  timeoutMs: 360_000,
  callTimeoutMs: 120_000,
  maxInputBytes: 4 * 1024 * 1024,
  maxOutputBytes: 2 * 1024 * 1024,
  maxResultBytes: 32 * 1024 * 1024,
  maxOutputTokens: 24_000,
  maxSources: 4,
  maxSourceBytes: 256 * 1024
};
export const DEFAULT_POLICY: ResearchPolicy = {
  network: 'deny',
  discovery: false,
  followLinks: false,
  allowUngrounded: false
};
export function failure(error: unknown, signal: AbortSignal, stage = 'execution'): Failure {
  if (signal.aborted && signal.reason instanceof RunError && signal.reason.code === 'deadline')
    return { stage, code: 'deadline', message: 'Execution deadline expired.' };
  if (signal.aborted)
    return {
      stage,
      code: 'cancelled',
      message: 'Execution was cancelled or its deadline expired.'
    };
  if (error instanceof RunError)
    return {
      stage: error.stage === 'execution' ? stage : error.stage,
      code: error.code,
      message: error.message
    };
  return {
    stage,
    code: 'internal-error',
    message: 'Execution failed. No incomplete content was accepted.'
  };
}
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  // Attach to the already-started promise even if it synchronously triggered cancellation.
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      })
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
export function createExecution(execution: Execution) {
  const limits = { ...DEFAULT_LIMITS, ...execution.limits };
  for (const [key, value] of Object.entries(limits))
    if (
      !Number.isSafeInteger(value) ||
      value < (['maxModelCalls', 'maxRepairs', 'maxResearchCalls'].includes(key) ? 0 : 1)
    )
      throw new RunError('invalid-limits', `Invalid execution limit: ${key}.`);
  // Even escaped JSON source text fits inside the complete outcome alongside two candidates.
  if (
    limits.maxInputBytes +
      limits.maxSources * limits.maxSourceBytes * 6 +
      limits.maxOutputBytes * (limits.maxResearchCalls + 2) +
      512 * 1024 >
    limits.maxResultBytes
  )
    throw new RunError(
      'invalid-limits',
      'Result limit must cover captured sources and accepted/candidate content.'
    );
  const policy = Object.freeze({ ...DEFAULT_POLICY, ...execution.policy });
  if (
    !['allow', 'deny'].includes(policy.network) ||
    ['discovery', 'followLinks', 'allowUngrounded'].some(
      (key) => typeof policy[key as keyof ResearchPolicy] !== 'boolean'
    )
  )
    throw new RunError('invalid-policy', 'Invalid research policy.');
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new RunError('deadline', 'Execution deadline expired.')),
    limits.timeoutMs
  );
  timer.unref();
  const signal = execution.signal
    ? AbortSignal.any([execution.signal, controller.signal])
    : controller.signal;
  const started = Date.now();
  const metadata: Metadata = { modelCalls: 0, repairs: 0, elapsedMs: 0, calls: [] };
  const researchResults: ResearchResult[] = [];
  let capturedSources = 0;
  const reserveSources = (count: number) => {
    signal.throwIfAborted();
    if (capturedSources + count > limits.maxSources)
      throw new RunError(
        'source-limit',
        'The shared source acquisition allowance was exhausted.',
        'research'
      );
    capturedSources += count;
  };
  const emit = (event: ProgressEvent) => {
    if (execution.onProgress) {
      try {
        execution.onProgress(jsonCopy(event, limits.maxResultBytes));
      } catch {
        /* Observers cannot erase completed work. */
      }
    }
  };
  const context: Context = {
    signal,
    policy,
    progress: (stage, message) =>
      emit({ type: 'progress', stage, message: message.slice(0, 1024) }),
    model: async (call) => {
      signal.throwIfAborted();
      if (!execution.model)
        throw new RunError(
          'model-unavailable',
          'Configure a model or explicitly select fixture mode.',
          call.stage
        );
      if (metadata.modelCalls >= limits.maxModelCalls)
        throw new RunError(
          'model-call-limit',
          'The total model call budget was exhausted.',
          call.stage
        );
      const bounded = jsonCopy(call, limits.maxInputBytes);
      metadata.modelCalls++;
      const record: Metadata['calls'][number] = { stage: call.stage, completed: false };
      metadata.calls.push(record);
      context.progress(call.stage, `Running ${call.stage}.`);
      const callController = new AbortController();
      const callTimer = setTimeout(() => callController.abort(), limits.callTimeoutMs);
      callTimer.unref();
      const callSignal = AbortSignal.any([signal, callController.signal]);
      try {
        const reply = await abortable(
          execution.model.generate({
            ...bounded,
            signal: callSignal,
            maxOutputTokens: limits.maxOutputTokens,
            maxOutputBytes: limits.maxOutputBytes
          }),
          callSignal
        );
        record.mode = reply.mode;
        if (reply.model !== undefined) record.model = reply.model;
        if (reply.usage !== undefined) record.usage = reply.usage;
        record.completed = true;
        return jsonCopy(reply.value, limits.maxOutputBytes);
      } catch (error) {
        if (callSignal.aborted && !signal.aborted)
          throw new RunError('timeout', 'Model call timed out.', call.stage);
        throw error;
      } finally {
        clearTimeout(callTimer);
      }
    },
    research: async (input) => {
      signal.throwIfAborted();
      if (researchResults.length >= limits.maxResearchCalls)
        throw new RunError(
          'research-call-limit',
          'The research call budget was exhausted.',
          'research'
        );
      const remainingSources =
        limits.maxSources -
        researchResults.reduce((count, result) => count + result.sources.length, 0);
      const result = await researchWithin(
        input,
        {
          context,
          limits: { ...limits, maxSources: remainingSources },
          sources: execution.sources,
          reserveSources,
          publish: (result) => emit({ type: 'research', result })
        },
        (result) => researchResults.push(result)
      );
      return jsonCopy(result, limits.maxResultBytes);
    }
  };
  return {
    context,
    limits,
    metadata,
    researchResults,
    close: () => {
      clearTimeout(timer);
      controller.abort();
      metadata.elapsedMs = Date.now() - started;
    }
  };
}
