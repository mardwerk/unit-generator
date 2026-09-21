import sharp from 'sharp';
import { ModelExecutionError, type ModelFailure } from '../core/model.js';
import { modelUsageSchema, type ModelUsage } from '../core/schemas.js';
import { openRouterFailure, retryAfter } from './openrouter-errors.js';

export const DEFAULT_IMAGE_MODEL = 'meta/muse-image';
export interface ImageGenerationClient {
  readonly model: string;
  generate(prompt: string, signal?: AbortSignal): Promise<{ png: Uint8Array; usage?: ModelUsage }>;
}

const API = 'https://openrouter.ai/api/v1/images';
const MODEL_API = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 120_000;
const RESPONSE_LIMIT = 12 * 1024 * 1024;
const IMAGE_LIMIT = 8 * 1024 * 1024;
const PIXEL_LIMIT = 16 * 1024 * 1024;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function failure(code: ModelFailure['code'], message: string, usage?: ModelUsage) {
  return new ModelExecutionError(message, usage, {
    failure: { code, message, provider: 'OpenRouter' },
  });
}
function readUsage(value: unknown): ModelUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = record(value);
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
async function boundedJson(response: Response, limit: number): Promise<Record<string, unknown>> {
  const tooLarge = () =>
    failure('OUTPUT_LIMIT', 'OpenRouter image response exceeded the size limit.');
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body)
    throw failure('MODEL_OUTPUT_INVALID', 'OpenRouter returned an empty image response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw tooLarge();
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    throw failure('MODEL_OUTPUT_INVALID', 'OpenRouter returned invalid image response JSON.');
  }
}
function enumSupports(parameters: Record<string, unknown>, key: string, value: string) {
  const descriptor = record(parameters[key]);
  return (
    descriptor.type === 'enum' &&
    Array.isArray(descriptor.values) &&
    descriptor.values.includes(value)
  );
}

/** A single explicitly requested image, with capability preflight and no retries or fallback. */
export class OpenRouterImageClient implements ImageGenerationClient {
  readonly model: string;
  readonly #apiKey: string;
  readonly #fetcher: typeof fetch;
  constructor(
    options: { apiKey: string; model?: string },
    fetcher: typeof fetch = globalThis.fetch,
  ) {
    this.model = options.model ?? DEFAULT_IMAGE_MODEL;
    this.#apiKey = options.apiKey.trim();
    this.#fetcher = fetcher;
    if (
      !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(this.model) ||
      this.model.length > 200 ||
      (this.#apiKey && this.model.includes(this.#apiKey))
    ) {
      throw failure('REQUEST_REJECTED', 'Image model must be a provider/model identifier.');
    }
  }
  async generate(
    prompt: string,
    signal?: AbortSignal,
  ): Promise<{ png: Uint8Array; usage?: ModelUsage }> {
    if (signal?.aborted) throw failure('CANCELLED', 'Image generation was cancelled.');
    if (!this.#apiKey)
      throw failure('AUTHENTICATION', 'Image generation needs an OpenRouter API key in Settings.');
    if (!prompt.trim() || prompt.length > 32_000)
      throw failure(
        'REQUEST_REJECTED',
        'Image prompt must contain between 1 and 32000 characters.',
      );
    const deadline = new AbortController();
    const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    const timer = setTimeout(() => deadline.abort(), TIMEOUT_MS);
    let usage: ModelUsage | undefined;
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(
          failure(
            signal?.aborted ? 'CANCELLED' : 'LOCAL_TIMEOUT',
            signal?.aborted
              ? 'Image generation was cancelled.'
              : 'Image generation exceeded the 120 second deadline.',
            usage,
          ),
        );
      combined.addEventListener('abort', onAbort, { once: true });
    });
    const request = async (url: string, body?: object) => {
      combined.throwIfAborted();
      const response = await this.#fetcher(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${this.#apiKey}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: combined,
      });
      const payload = await boundedJson(response, body ? RESPONSE_LIMIT : 1024 * 1024);
      if (body) usage = readUsage(payload.usage);
      if (!response.ok || payload.error) {
        const rawCode = record(payload.error).code;
        const providerCode =
          typeof rawCode === 'number'
            ? rawCode
            : typeof rawCode === 'string' && /^\d{3}$/.test(rawCode)
              ? Number(rawCode)
              : undefined;
        const facts = openRouterFailure(
          response.status,
          providerCode,
          retryAfter(response.headers.get('retry-after')),
        );
        facts.message = facts.message
          .replaceAll('structured-output support', 'image support')
          .replaceAll('structured output', 'image generation');
        if (this.model === 'meta/muse-image' && facts.code === 'MODEL_UNAVAILABLE') {
          facts.message = `OpenRouter has no available Meta endpoint for Muse image generation (${providerCode ?? response.status}). The catalogue listing does not guarantee access for this request. Check OpenRouter account and provider restrictions, or retry later. Muse remains selected; no fallback was attempted.`;
        }
        throw new ModelExecutionError(facts.message, usage, { failure: facts });
      }
      return payload;
    };
    const generate = async () => {
      let payload: Record<string, unknown>;
      if (this.model === 'meta/muse-image') {
        const catalogue = record(await request(`${MODEL_API}/models/${this.model}/endpoints`));
        const model = record(catalogue.data);
        const modalities = record(model.architecture).output_modalities;
        const endpoint = (Array.isArray(model.endpoints) ? model.endpoints : [])
          .map(record)
          .find((entry) => entry.tag === 'meta');
        if (!Array.isArray(modalities) || !modalities.includes('image') || !endpoint)
          throw failure('MODEL_UNAVAILABLE', 'Muse has no advertised Meta image endpoint.');
        // The live API rejects Muse on chat/completions even though general model metadata lists it.
        // Its dedicated endpoint catalogue is currently empty; do not infer quality/alpha support.
        payload = await request(API, {
          model: this.model,
          prompt: `${prompt}\nReturn exactly one square image.`,
          n: 1,
          provider: { only: [endpoint.tag], allow_fallbacks: false },
        });
      } else {
        const catalogue = await request(`${API}/models/${this.model}/endpoints`);
        const endpoint = (Array.isArray(catalogue.endpoints) ? catalogue.endpoints : [])
          .map(record)
          .find((entry) => {
            const parameters = record(entry.supported_parameters);
            const count = record(parameters.n);
            return (
              typeof entry.provider_tag === 'string' &&
              /^[a-zA-Z0-9._/-]+$/.test(entry.provider_tag) &&
              enumSupports(parameters, 'quality', 'low') &&
              enumSupports(parameters, 'aspect_ratio', '1:1') &&
              count.type === 'range' &&
              typeof count.min === 'number' &&
              count.min <= 1 &&
              typeof count.max === 'number' &&
              count.max >= 1
            );
          });
        if (!endpoint)
          throw failure(
            'MODEL_UNAVAILABLE',
            'The selected image model has no endpoint supporting one square image at low quality.',
          );
        payload = await request(API, {
          model: this.model,
          prompt,
          n: 1,
          aspect_ratio: '1:1',
          quality: 'low',
          output_format: 'png',
          ...(enumSupports(record(endpoint.supported_parameters), 'background', 'transparent')
            ? { background: 'transparent' }
            : {}),
          provider: { only: [endpoint.provider_tag], allow_fallbacks: false },
        });
      }
      const data =
        Array.isArray(payload.data) && payload.data.length === 1 ? record(payload.data[0]) : {};
      const encoded = data.b64_json;
      const mediaType = data.media_type;
      if (
        typeof encoded !== 'string' ||
        !encoded.length ||
        (mediaType !== undefined &&
          !['image/png', 'image/jpeg', 'image/webp'].includes(String(mediaType))) ||
        encoded.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
      ) {
        throw failure(
          'MODEL_OUTPUT_INVALID',
          'OpenRouter did not return one inline PNG, JPEG or WebP image.',
          usage,
        );
      }
      if (encoded.length > Math.ceil(IMAGE_LIMIT / 3) * 4)
        throw failure('OUTPUT_LIMIT', 'Generated PNG exceeded the image size limit.', usage);
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.length > IMAGE_LIMIT)
        throw failure('OUTPUT_LIMIT', 'Generated PNG exceeded the image size limit.', usage);
      if (bytes.toString('base64') !== encoded)
        throw failure(
          'MODEL_OUTPUT_INVALID',
          'OpenRouter returned invalid base64 image data.',
          usage,
        );
      let png: Buffer;
      try {
        const raster = sharp(bytes, { limitInputPixels: PIXEL_LIMIT, animated: false });
        const metadata = await raster.metadata();
        const formats: Record<string, string> = {
          png: 'image/png',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
        };
        const decodedType = metadata.format ? formats[metadata.format] : undefined;
        if (
          !decodedType ||
          (mediaType !== undefined && mediaType !== decodedType) ||
          (metadata.pages ?? 1) !== 1
        )
          throw new Error('Unsupported image format');
        // Decode the complete image, preserving existing alpha without creating transparency.
        png = await raster.timeout({ seconds: 10 }).png().toBuffer();
      } catch {
        throw failure(
          'MODEL_OUTPUT_INVALID',
          'OpenRouter returned invalid or unsupported raster image data.',
          usage,
        );
      }
      if (png.length > IMAGE_LIMIT)
        throw failure('OUTPUT_LIMIT', 'Generated PNG exceeded the image size limit.', usage);
      return { png, ...(usage ? { usage } : {}) };
    };
    try {
      return await Promise.race([generate(), aborted]);
    } catch (error) {
      if (error instanceof ModelExecutionError) throw error;
      if (combined.aborted)
        throw failure(
          signal?.aborted ? 'CANCELLED' : 'LOCAL_TIMEOUT',
          signal?.aborted
            ? 'Image generation was cancelled.'
            : 'Image generation exceeded the 120 second deadline.',
          usage,
        );
      throw failure(
        'NETWORK_ERROR',
        'OpenRouter image request failed. Check the connection before trying again.',
        usage,
      );
    } finally {
      clearTimeout(timer);
      combined.removeEventListener('abort', onAbort);
      deadline.abort();
    }
  }
}
