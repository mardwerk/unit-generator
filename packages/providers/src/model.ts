import {
  CommandModelClient,
  HttpStructuredModelClient,
  type ModelClient,
  type CommandModelClientOptions,
  type HttpStructuredModelClientOptions
} from '@mardwerk/model-client';
import { RunError, jsonCopy, type JsonSchema, type ModelAdapter } from '@mardwerk/unit-core';

/** Conservative capability check. No constraints or meaningful nulls are rewritten. */
export function supportsStructured(schema: JsonSchema): boolean {
  const allowed = new Set([
    '$schema',
    '$id',
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'const',
    'anyOf',
    'description',
    'title',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'minLength',
    'maxLength',
    'pattern'
  ]);
  const check = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const s = value as JsonSchema;
    if (Object.keys(s).some((key) => !allowed.has(key))) return false;
    if (Array.isArray(s.anyOf)) return s.anyOf.every(check);
    if (s.type === 'object') {
      const properties = s.properties as Record<string, unknown> | undefined;
      if (
        !properties ||
        s.additionalProperties !== false ||
        !Array.isArray(s.required) ||
        Object.keys(properties).some((key) => !(s.required as string[]).includes(key))
      )
        return false;
      return Object.values(properties).every(check);
    }
    if (s.type === 'array') return check(s.items);
    return (
      ['string', 'number', 'integer', 'boolean', 'null'].includes(s.type as string) ||
      Array.isArray(s.enum) ||
      Object.hasOwn(s, 'const')
    );
  };
  return schema.type === 'object' && check(schema);
}
function classifyError(error: unknown): RunError {
  if (error instanceof RunError) return error;
  const message = error instanceof Error ? error.message : '';
  const http = message.match(/HTTP (\d{3})/);
  if (http) return new RunError('provider-http', `Model endpoint returned HTTP ${http[1]}.`);
  if (/streaming endpoint reported an error/i.test(message))
    return new RunError(
      'provider-stream',
      'The provider reported an error inside the completion stream.'
    );
  if (/refus/i.test(message)) return new RunError('refusal', 'The model declined the request.');
  if (/truncat|finish|length/i.test(message))
    return new RunError('truncated', 'Model output did not finish.');
  if (/JSON/i.test(message))
    return new RunError('invalid-json', 'The model did not return complete JSON.');
  if (/timeout|timed out|abort/i.test(message))
    return new RunError('timeout', 'The model request timed out or was cancelled.');
  if (/size limit|exceeded|output limit/i.test(message))
    return new RunError('output-limit', 'Model output exceeded the configured byte limit.');
  return new RunError('provider-failed', 'The configured model could not complete the request.');
}
function safeError(error: unknown): RunError {
  const safe = classifyError(error);
  if (error && typeof error === 'object') {
    const metadata = error as { usage?: unknown; provider?: unknown };
    for (const field of ['usage', 'provider'] as const)
      if (metadata[field] && typeof metadata[field] === 'object')
        Object.assign(safe, { [field]: metadata[field] });
  }
  return safe;
}
export function adaptModel(
  client: ModelClient,
  options: { model?: string; structured?: boolean } = {}
): ModelAdapter {
  return {
    async generate(call) {
      const structured = options.structured !== false && supportsStructured(call.schema);
      if (call.requireStructured && !structured)
        throw new RunError(
          'schema-capability',
          'This provider cannot constrain the selected schema. Enable JSON fallback or select a compatible provider.'
        );
      try {
        const request = {
          system:
            call.instructions +
            '\nReturn only one complete JSON value matching the selected schema. Do not include Markdown or hidden reasoning.',
          prompt: JSON.stringify({
            input: call.input,
            ...(!structured ? { outputSchema: call.schema } : {})
          }),
          signal: call.signal,
          maxOutputTokens: call.maxOutputTokens
        };
        const result = structured
          ? await client.generateJson(request, call.schema, (value) => value)
          : await client.generateText(request);
        let value: unknown = result.output;
        if (!structured) {
          try {
            value = JSON.parse(result.output as string);
          } catch {
            throw Object.assign(
              new RunError('invalid-json', 'The model did not return complete JSON.'),
              {
                ...(result.usage ? { usage: result.usage } : {}),
                ...(result.provider ? { provider: result.provider } : {})
              }
            );
          }
        }
        let copied: unknown;
        try {
          copied = jsonCopy(value, call.maxOutputBytes);
        } catch (error) {
          throw Object.assign(error as Error, {
            ...(result.usage ? { usage: result.usage } : {}),
            ...(result.provider ? { provider: result.provider } : {})
          });
        }
        return {
          value: copied,
          mode: structured ? 'structured' : 'json',
          ...(result.usage ? { usage: result.usage } : {}),
          ...(result.provider?.model || options.model
            ? { model: result.provider?.model ?? options.model }
            : {})
        };
      } catch (error) {
        throw safeError(error);
      }
    }
  };
}
export function createHttpProvider(
  options: HttpStructuredModelClientOptions & { structured?: boolean; jsonMode?: boolean }
): ModelAdapter {
  const { jsonMode = true, ...clientOptions } = options;
  const endpoint = new URL(options.endpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password)
    throw new RunError(
      'configuration',
      'Use an HTTP(S) model endpoint without embedded credentials.'
    );
  const makeAdapter = (objectMode: boolean) =>
    adaptModel(
      new HttpStructuredModelClient({
        ...clientOptions,
        ...(objectMode
          ? {
              fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                if (init?.body && typeof init.body === 'string') {
                  try {
                    const body = JSON.parse(init.body) as Record<string, unknown>;
                    if (!body.response_format)
                      init = {
                        ...init,
                        body: JSON.stringify({ ...body, response_format: { type: 'json_object' } })
                      };
                  } catch {
                    /* model-client reports malformed requests */
                  }
                }
                return (clientOptions.fetch ?? globalThis.fetch)(input, init);
              }
            }
          : {}),
        extractResponse: (value, response) => {
          const body = value as {
            model?: string;
            choices?: {
              finish_reason?: string;
              message?: { content?: unknown; refusal?: unknown };
            }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const choice = body.choices?.[0];
          if (choice?.message?.refusal)
            throw new RunError('refusal', 'The model declined the request.');
          if (choice?.finish_reason && choice.finish_reason !== 'stop')
            throw new RunError('truncated', 'Model output did not finish.');
          if (typeof choice?.message?.content !== 'string')
            throw new RunError('invalid-response', 'The model response did not contain text.');
          const usage = body.usage;
          return {
            text: choice.message.content,
            ...(usage
              ? {
                  usage: {
                    ...(Number.isFinite(usage.prompt_tokens)
                      ? { inputTokens: usage.prompt_tokens }
                      : {}),
                    ...(Number.isFinite(usage.completion_tokens)
                      ? { outputTokens: usage.completion_tokens }
                      : {})
                  }
                }
              : {}),
            provider: {
              model: body.model ?? options.model,
              ...(response.headers.get('x-request-id')
                ? { requestId: response.headers.get('x-request-id')! }
                : {})
            }
          };
        }
      }),
      { model: options.model, structured: options.structured }
    );
  const plain = makeAdapter(false);
  const object = jsonMode ? makeAdapter(true) : plain;
  return {
    generate: (call) => (call.schema.type === 'object' ? object : plain).generate(call)
  };
}
export function createCommandProvider(options: CommandModelClientOptions): ModelAdapter {
  return adaptModel(new CommandModelClient(options), { structured: false, model: 'local-command' });
}
