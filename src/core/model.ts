import { modelUsageSchema, type ModelUsage } from './schemas.js';

/** The core's only model dependency. Adapters own transport and credentials. */

export interface ModelRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ModelClient {
  readonly id: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

/** Usage belongs to this response. Omitted usage means the adapter did not report it. */
export interface ModelResponse {
  output: unknown;
  usage?: ModelUsage;
}

/** Safe failure facts supplied by an adapter, independent of its SDK error payload. */
export interface ModelFailure {
  code:
    | 'LOCAL_TIMEOUT'
    | 'PROVIDER_TIMEOUT'
    | 'RATE_LIMIT'
    | 'INSUFFICIENT_CREDITS'
    | 'AUTHENTICATION'
    | 'REQUEST_REJECTED'
    | 'MODEL_UNAVAILABLE'
    | 'PROVIDER_UNAVAILABLE'
    | 'NETWORK_ERROR'
    | 'MODEL_OUTPUT_INVALID'
    | 'OUTPUT_LIMIT'
    | 'CANCELLED'
    | 'MODEL_REFUSAL'
    | 'CONTEXT_LIMIT'
    | 'MODEL_FAILED';
  message: string;
  provider?: string;
  httpStatus?: number;
  providerCode?: number;
  timeoutMs?: number;
  retryAfterSeconds?: number;
  stage?: 'draft' | 'review';
}

/** A failed attempt can still have provider-reported usage. Invalid metadata stays unavailable. */
export class ModelExecutionError extends Error {
  declare readonly usage?: ModelUsage;
  declare readonly failure?: Readonly<ModelFailure>;

  constructor(
    message: string,
    usage?: ModelUsage,
    options?: ErrorOptions & { failure?: ModelFailure },
  ) {
    super(message, options);
    this.name = 'ModelExecutionError';
    const parsed = modelUsageSchema.safeParse(usage);
    if (parsed.success) this.usage = Object.freeze(parsed.data);
    if (options?.failure) this.failure = Object.freeze({ ...options.failure });
  }
}

/** Retain diagnostic causes internally, while keeping public CLI and HTTP messages safe. */
export function stageFailure(
  error: unknown,
  stage: 'draft' | 'review',
  usage: ModelUsage | undefined,
  invalidOutput: boolean,
): ModelExecutionError {
  const retained = error instanceof ModelExecutionError ? error : undefined;
  const operation = stage === 'draft' ? 'Unit draft' : 'review';
  const cancelled = error instanceof Error && error.name === 'AbortError';
  const failure: ModelFailure = cancelled
    ? { code: 'CANCELLED', stage, message: `${operation} was cancelled.` }
    : retained?.failure
      ? { ...retained.failure, stage }
      : {
          code: invalidOutput ? 'MODEL_OUTPUT_INVALID' : 'MODEL_FAILED',
          stage,
          message: invalidOutput
            ? `The model returned an incomplete or invalid ${operation}. Retry this stage or choose another model.`
            : `The model could not complete the ${operation}. Check the provider configuration and retry this stage.`,
        };
  return new ModelExecutionError(
    `${stage === 'draft' ? 'Draft' : 'Review'} model execution failed: ${failure.message}`,
    retained?.usage ?? usage,
    { cause: error, failure },
  );
}
