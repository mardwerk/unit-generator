import { error } from '@sveltejs/kit';
import {
  generate,
  research,
  validate,
  accepted,
  RunError,
  type Definition,
  type Execution,
  type ResearchInput,
  type RunResult
} from '@mardwerk/unit-core';
import { loadDefinition } from '@mardwerk/unit-core/files';
import {
  loadBundledDefinition,
  bundledDefinitions,
  implementations,
  classicFixture,
  mergeFixture,
  type ClassicInput
} from '@mardwerk/unit-definitions';
import { createProvidersFromEnv } from '@mardwerk/unit-providers';
import { env } from '$env/dynamic/private';

export function guard(request: Request, url: URL) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    error(403, 'The playground accepts local requests only.');
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin)
    error(403, 'A same-origin request is required.');
}
function customPaths(): Record<string, string> {
  const paths: unknown = JSON.parse(env.UNIT_DEFINITION_PATHS ?? '{}');
  if (
    !paths ||
    typeof paths !== 'object' ||
    Array.isArray(paths) ||
    Object.entries(paths).some(
      ([id, value]) =>
        !/^[a-z0-9-]+$/.test(id) ||
        typeof value !== 'string' ||
        (bundledDefinitions as readonly string[]).includes(id)
    )
  )
    throw new RunError('configuration', 'Invalid configured definition paths.');
  return paths as Record<string, string>;
}
export async function definitionFor(id: string): Promise<Definition> {
  if ((bundledDefinitions as readonly string[]).includes(id)) return loadBundledDefinition(id);
  const paths = customPaths();
  if (!Object.hasOwn(paths, id)) error(400, 'Unknown definition.');
  return loadDefinition(paths[id]!, implementations);
}
export async function settings() {
  const configured = createProvidersFromEnv(env);
  return {
    definitions: await Promise.all(
      [...bundledDefinitions, ...Object.keys(customPaths())].map(async (id) => {
        const definition = await definitionFor(id);
        return { id, title: id, inputSchema: definition.inputSchema };
      })
    ),
    providers: [
      ...configured.descriptions,
      { id: 'fixture', configured: true, model: 'Demo fixture, original concepts only' }
    ],
    defaultProvider:
      configured.descriptions.find((p) => configured.providers[p.id] === configured.execution.model)
        ?.id ?? 'fixture'
  };
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    error(415, 'Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) error(400, 'Missing request.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 4 * 1024 * 1024) {
        await reader.cancel();
        error(413, 'Request exceeds 4 MiB.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      error(400, 'Request must be an object.');
    return value as Record<string, unknown>;
  } catch {
    error(400, 'Invalid JSON request.');
  }
}
export async function run(request: Request, value: Record<string, unknown>) {
  if (!['generate', 'research'].includes(String(value.operation))) error(400, 'Unknown operation.');
  const definition = await definitionFor(String(value.definition));
  const configured =
    value.provider === 'fixture'
      ? { execution: {} as Execution, providers: {} }
      : createProvidersFromEnv(env);
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const execution: Execution = {
    ...configured.execution,
    signal: controller.signal,
    policy: {
      network: value.research === true ? 'allow' : 'deny',
      discovery: value.research === true,
      followLinks: false,
      allowUngrounded: value.allowUngrounded === true
    }
  };
  if (value.provider === 'fixture') {
    if (value.operation !== 'generate') error(400, 'Choose a model for source research.');
    if (definition.id === 'classic-three-path') {
      if ((value.input as ClassicInput)?.kind !== 'original')
        error(400, 'Demo mode requires an original concept.');
      execution.model = {
        generate: async () => ({
          value: classicFixture(value.input as ClassicInput),
          mode: 'fixture'
        })
      };
    } else if (definition.id === 'merge-family-example')
      execution.model = {
        generate: async () => ({
          value: mergeFixture(String((value.input as { brief?: string })?.brief)),
          mode: 'fixture'
        })
      };
    else error(400, 'Demo mode supports bundled definitions only.');
  } else {
    const providers = configured.providers as Record<string, Execution['model']>;
    if (!Object.hasOwn(providers, String(value.provider)))
      error(400, 'Selected model is unavailable.');
    execution.model = providers[String(value.provider)];
  }
  // No retained run map. Slow readers abort this request when its bounded queue fills.
  let closed = false;
  let total = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(output) {
        const send = (event: unknown) => {
          if (closed) return;
          const bytes = new TextEncoder().encode(JSON.stringify(event) + '\n');
          total += bytes.byteLength;
          if (total > 64 * 1024 * 1024 || (output.desiredSize ?? 0) < bytes.byteLength) {
            closed = true;
            abort();
            output.error(new Error('Response limit or slow reader.'));
            return;
          }
          output.enqueue(bytes);
        };
        execution.onProgress = send;
        void (async () => {
          try {
            const result =
              value.operation === 'research'
                ? await research(value.input as ResearchInput, execution)
                : await generate(definition, value.input, execution);
            send({ type: 'result', result });
          } catch {
            send({ type: 'error', message: 'The run could not complete.' });
          } finally {
            request.signal.removeEventListener('abort', abort);
            if (!closed) {
              closed = true;
              output.close();
            }
          }
        })();
      },
      cancel() {
        closed = true;
        abort();
        request.signal.removeEventListener('abort', abort);
      }
    },
    { highWaterMark: 40 * 1024 * 1024, size: (chunk) => chunk.byteLength }
  );
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
export async function revalidate(value: Record<string, unknown>) {
  const original = value.original as RunResult;
  if (!original?.definition) error(400, 'Original definition metadata is required.');
  const definition = await definitionFor(String(value.definition));
  const saved = original.definition;
  if (
    saved.id !== definition.id ||
    saved.version !== definition.version ||
    saved.fileDigest !== definition.fileDigest ||
    saved.implementationVersion !== definition.implementationVersion ||
    JSON.stringify(saved.configuration) !== JSON.stringify(definition.configuration)
  )
    error(409, 'The definition changed. Start a new generation with the current rules.');
  const report = await validate(
    definition,
    value.candidate,
    original.input,
    AbortSignal.timeout(30_000)
  );
  return {
    ...original,
    status: accepted(report) ? 'success' : 'failed',
    output: accepted(report) ? value.candidate : undefined,
    candidate: accepted(report) ? undefined : value.candidate,
    validation: report,
    error: undefined,
    edited: true
  };
}
