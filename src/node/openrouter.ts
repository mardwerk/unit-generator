import { HTTPClient, OpenRouter, type Fetcher } from '@openrouter/sdk';
import type { ModelClient, ModelRequest, ModelResponse, ModelFailure } from '../core/model.js';
import { ModelExecutionError } from '../core/model.js';
import { modelUsageSchema, type ModelUsage } from '../core/schemas.js';
import { openRouterFailure, retryAfter } from './openrouter-errors.js';

export const OPENROUTER_FREE_MODEL = 'openrouter/free';

export interface OpenRouterOptions {
  /** Server-side only. Defaults to OPENROUTER_API_KEY. */
  apiKey?: string;
  /** An explicit override may select a paid model. There is no automatic paid fallback. */
  model?: string;
  /** Default: none for interactive authoring. Override for deliberate reasoning experiments. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  timeoutMs?: number;
  /** Limit for the complete HTTP response, including provider metadata. */
  maxOutputBytes?: number;
}

class ResponseError extends Error {
  constructor(
    message: string,
    readonly code: ModelFailure['code'] = 'MODEL_OUTPUT_INVALID',
  ) {
    super(message);
  }
}

/** A direct SDK adapter. Each call returns parsed JSON for the core to validate. */
export class OpenRouterModelClient implements ModelClient {
  readonly id: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #reasoningEffort: NonNullable<OpenRouterOptions['reasoningEffort']>;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;
  readonly #fetcher: Fetcher;

  constructor(options: OpenRouterOptions = {}, fetcher: Fetcher = globalThis.fetch) {
    this.#apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY ?? '').trim();
    this.#model = options.model ?? (process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_FREE_MODEL);
    const reasoning =
      options.reasoningEffort ?? (process.env.OPENROUTER_REASONING?.trim() || 'none');
    if (!['none', 'low', 'medium', 'high'].includes(reasoning)) {
      throw new Error('OpenRouter reasoning must be none, low, medium or high.');
    }
    this.#reasoningEffort = reasoning as NonNullable<OpenRouterOptions['reasoningEffort']>;
    this.#timeoutMs = options.timeoutMs ?? 120_000;
    this.#maxOutputBytes = options.maxOutputBytes ?? 2_000_000;
    this.#fetcher = fetcher;
    if (
      !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/.test(this.#model) ||
      this.#model.length > 200 ||
      (this.#apiKey && this.#model.includes(this.#apiKey))
    ) {
      throw new Error('OpenRouter model must be a provider/model identifier.');
    }
    if (
      !Number.isSafeInteger(this.#timeoutMs) ||
      this.#timeoutMs <= 0 ||
      this.#timeoutMs > 2_147_483_647 ||
      !Number.isSafeInteger(this.#maxOutputBytes) ||
      this.#maxOutputBytes <= 0
    ) {
      throw new Error('OpenRouter timeout and response limit must be positive bounded integers.');
    }
    this.id = `openrouter:${this.#model}`;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.signal?.aborted)
      throw failureError({ code: 'CANCELLED', message: 'OpenRouter generation was cancelled.' });
    if (!this.#apiKey) {
      throw failureError({
        code: 'AUTHENTICATION',
        message: 'OpenRouter needs an API key. Set it in Settings or OPENROUTER_API_KEY.',
      });
    }

    const deadline = new AbortController();
    const signal = request.signal
      ? AbortSignal.any([request.signal, deadline.signal])
      : deadline.signal;
    const timer = setTimeout(() => deadline.abort(), this.#timeoutMs);
    let status: number | undefined;
    let limitExceeded = false;
    let reportedFailure: ModelFailure | undefined;
    let retryAfterSeconds: number | undefined;
    let usage: ModelUsage | undefined;
    const sdk = new OpenRouter({
      apiKey: this.#apiKey,
      serverURL: 'https://openrouter.ai/api/v1',
      appTitle: 'mardwerk-unit',
      retryConfig: { strategy: 'none' },
      // Override OPENROUTER_DEBUG, which would otherwise log credentials and source text.
      debugLogger: { group() {}, groupEnd() {}, log() {} },
      httpClient: new HTTPClient({
        fetcher: async (input, init) => {
          // Also bind the transport directly; cancellation must reach the HTTP request.
          const response = await this.#fetcher(input, { ...init, signal });
          status = response.status;
          retryAfterSeconds = retryAfter(response.headers.get('retry-after'));
          try {
            const bounded = await boundedResponse(response, this.#maxOutputBytes);
            // OpenRouter can also return an error envelope after HTTP 200.
            const payload: unknown = await bounded
              .clone()
              .json()
              .catch(() => null);
            const envelope =
              payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
            if (!bounded.ok || (envelope && typeof envelope === 'object')) {
              const data = envelope && typeof envelope === 'object' ? envelope : {};
              const rawCode = 'code' in data ? data.code : undefined;
              const code =
                typeof rawCode === 'number'
                  ? rawCode
                  : typeof rawCode === 'string' && /^\d{3}$/.test(rawCode)
                    ? Number(rawCode)
                    : undefined;
              const message =
                'message' in data && typeof data.message === 'string'
                  ? data.message.slice(0, 4000)
                  : '';
              const metadata = 'metadata' in data ? data.metadata : null;
              const upstreamMessage =
                metadata &&
                typeof metadata === 'object' &&
                'raw' in metadata &&
                typeof metadata.raw === 'string'
                  ? metadata.raw.slice(0, 4000)
                  : '';
              if (payload && typeof payload === 'object' && 'usage' in payload) {
                usage = errorEnvelopeUsage(payload.usage);
              }
              reportedFailure = openRouterFailure(
                response.status,
                code,
                retryAfterSeconds,
                `${message}\n${upstreamMessage}`,
              );
              throw failureError(reportedFailure);
            }
            return bounded;
          } catch (error) {
            limitExceeded = error instanceof ResponseError;
            throw error;
          }
        },
      }),
    });
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const response = await Promise.race([
        sdk.chat.send(
          {
            chatRequest: {
              model: this.#model,
              reasoning: { effort: this.#reasoningEffort },
              messages: [
                { role: 'system', content: request.system },
                { role: 'user', content: request.prompt },
              ],
              responseFormat: {
                type: 'json_schema',
                jsonSchema: { name: 'unit_result', strict: true, schema: request.schema },
              },
              provider: {
                requireParameters: true,
                ...(this.#model === OPENROUTER_FREE_MODEL || this.#model.endsWith(':free')
                  ? { maxPrice: { prompt: '0', completion: '0', request: '0' } }
                  : {}),
              },
              stream: false,
            },
          },
          { signal, retries: { strategy: 'none' } },
        ),
        aborted,
      ]);
      if (!('choices' in response)) {
        throw new ResponseError('OpenRouter did not return a structured final response.');
      }
      usage = modelUsageSchema.parse({
        inputTokens: response.usage?.promptTokens ?? null,
        outputTokens: response.usage?.completionTokens ?? null,
        totalTokens: response.usage?.totalTokens ?? null,
        reasoningTokens: response.usage?.completionTokensDetails?.reasoningTokens ?? null,
        cachedInputTokens: response.usage?.promptTokensDetails?.cachedTokens ?? null,
        costUsd: response.usage?.cost ?? null,
        actualModel: safeIdentifier(response.model, this.#apiKey),
        // The SDK does not expose the optional upstream provider name.
        provider: null,
        generationId: safeIdentifier(response.id, this.#apiKey),
      });
      const choice = response.choices[0];
      if (choice?.message.refusal || choice?.finishReason === 'content_filter') {
        throw new ResponseError(
          'OpenRouter declined to generate this response. Check the character brief or try another model.',
          'MODEL_REFUSAL',
        );
      }
      if (choice?.finishReason !== 'stop') {
        throw new ResponseError(
          choice?.finishReason === 'length'
            ? 'The model reached its output token limit before completing the Unit. Reduce the requested detail or choose a model with a larger output allowance.'
            : 'OpenRouter did not complete the structured response. Retry this stage or choose another model.',
          choice?.finishReason === 'length' ? 'OUTPUT_LIMIT' : 'MODEL_OUTPUT_INVALID',
        );
      }
      const content = choice.message.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new ResponseError('OpenRouter did not return a structured final response.');
      }
      try {
        return {
          output: JSON.parse(content),
          usage,
        };
      } catch {
        throw new ResponseError('OpenRouter returned invalid JSON in its structured response.');
      }
    } catch (error) {
      if (request.signal?.aborted)
        throw failureError(
          { code: 'CANCELLED', message: 'OpenRouter generation was cancelled.' },
          usage,
        );
      if (reportedFailure) throw failureError(reportedFailure, usage);
      if (status !== undefined && status >= 400)
        throw failureError(openRouterFailure(status, undefined, retryAfterSeconds), usage);
      if (deadline.signal.aborted)
        throw failureError(
          {
            code: 'LOCAL_TIMEOUT',
            timeoutMs: this.#timeoutMs,
            message: `Generation timed out at the app's ${this.#timeoutMs / 1000}-second limit while waiting for OpenRouter. Retry this stage or choose a faster model. No OpenRouter rate-limit or credit error was received.`,
          },
          usage,
        );
      if (limitExceeded)
        throw failureError(
          {
            code: 'OUTPUT_LIMIT',
            message: `OpenRouter's response exceeded the app's ${this.#maxOutputBytes.toLocaleString('en-US')}-byte output limit. Request a shorter Unit draft.`,
          },
          usage,
        );
      if (error instanceof ResponseError)
        throw failureError({ code: error.code, message: error.message }, usage);
      // SDK errors may include headers, provider text and full payloads. Never expose them.
      throw failureError(
        status === undefined
          ? {
              code: 'NETWORK_ERROR',
              message:
                'The app could not connect to OpenRouter. Check the connection and retry this stage. No provider error response was received.',
            }
          : openRouterFailure(status),
        usage,
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }
}

function failureError(failure: ModelFailure, usage?: ModelUsage) {
  return new ModelExecutionError(failure.message, usage, {
    failure: { provider: 'OpenRouter', ...failure },
  });
}

async function boundedResponse(response: Response, limit: number): Promise<Response> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new ResponseError('Response limit exceeded');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Error envelopes sometimes include billable work; retain only validated numeric usage. */
function errorEnvelopeUsage(value: unknown): ModelUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const parsed = modelUsageSchema.safeParse({
    inputTokens: raw.prompt_tokens ?? null,
    outputTokens: raw.completion_tokens ?? null,
    totalTokens: raw.total_tokens ?? null,
    costUsd: raw.cost ?? null,
    reasoningTokens: null,
    cachedInputTokens: null,
    actualModel: null,
    provider: null,
    generationId: null,
  });
  return parsed.success ? parsed.data : undefined;
}

function safeIdentifier(value: string | undefined, apiKey: string): string | null {
  return value && value.length <= 256 && !value.includes(apiKey) ? value : null;
}
