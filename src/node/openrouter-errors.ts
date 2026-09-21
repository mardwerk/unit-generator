import type { ModelFailure } from '../core/model.js';

/** Provider text is used only for classification and never copied into a user-facing error. */
export function openRouterFailure(
  status: number,
  providerCode?: number,
  retryAfterSeconds?: number,
  providerMessage = '',
): ModelFailure {
  const code = providerCode ?? status;
  const facts = {
    provider: 'OpenRouter',
    httpStatus: status,
    ...(providerCode === undefined ? {} : { providerCode }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
  const failure = (code: ModelFailure['code'], message: string): ModelFailure => ({
    ...facts,
    code,
    message,
  });
  switch (code) {
    case 401:
      return failure(
        'AUTHENTICATION',
        'OpenRouter authentication failed (401). Check the API key and its account access in Settings.',
      );
    case 402:
      return failure(
        'INSUFFICIENT_CREDITS',
        'OpenRouter rejected the request for insufficient credits (402). Check the account balance and the API key spending limit.',
      );
    case 403:
      return failure(
        'REQUEST_REJECTED',
        'OpenRouter denied this request (403). Check the key permissions and provider restrictions.',
      );
    case 408:
    case 504:
      return failure(
        'PROVIDER_TIMEOUT',
        `OpenRouter reported a provider timeout (${code}). Retry this stage or choose another model.`,
      );
    case 429:
      return failure(
        'RATE_LIMIT',
        `OpenRouter rate limit reached (429). ${
          retryAfterSeconds === undefined
            ? 'Wait before retrying; check the model request quota if this continues.'
            : `Retry after ${retryAfterSeconds} seconds. Check the model request quota if this continues.`
        }`,
      );
    case 404:
    case 503:
      return failure(
        'MODEL_UNAVAILABLE',
        `OpenRouter has no available endpoint for this model and request (${code}). Try another model supporting structured output, or retry later.`,
      );
    case 400:
    case 413:
    case 422:
      if (
        /compiled grammar is too large|schema.{0,40}(?:too complex|too large)/i.test(
          providerMessage,
        )
      )
        return failure(
          'REQUEST_REJECTED',
          `The selected OpenRouter provider rejected the Unit output format as too complex (${code}). Choose another model.`,
        );
      if (
        code === 413 ||
        /context (?:length|window)|maximum.{0,24}tokens|too many (?:input )?tokens/i.test(
          providerMessage,
        )
      )
        return failure(
          'CONTEXT_LIMIT',
          `OpenRouter rejected the request because the input exceeds the model or request size limit (${code}). Reduce source text or use a model with a larger context window.`,
        );
      return failure(
        'REQUEST_REJECTED',
        `OpenRouter rejected the request parameters (${code}). Check that the selected model supports structured output.`,
      );
    default:
      if (code >= 500 && code < 600)
        return failure(
          'PROVIDER_UNAVAILABLE',
          `OpenRouter or the model provider failed (${code}). Retry this stage later or choose another model.`,
        );
      return failure(
        'MODEL_FAILED',
        `OpenRouter returned an unrecognized response (${code}). Try another model with structured-output support. No fallback model was requested.`,
      );
  }
}

export function retryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header?.trim()) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(header.trim())
    ? Number(header)
    : (Date.parse(header) - now) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}
