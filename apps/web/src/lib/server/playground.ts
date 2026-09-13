import { error } from '@sveltejs/kit';
import {
  generate,
  research,
  validate,
  reviewCandidateSources,
  accepted,
  compileSchema,
  researchResultSchema,
  RunError,
  type Definition,
  type Execution,
  type ResearchInput,
  type RunResult
} from '@mardwerk/unit-core';
import { loadDefinition } from '@mardwerk/unit-core/files';
import {
  loadBundledDefinition,
  defaultDefinitionId,
  bundledDefinitions,
  implementations,
  createBundledFixture
} from '@mardwerk/unit-definitions';
import { qualifyUnit } from '@mardwerk/unit-lab';
import { createProvidersFromEnv } from '@mardwerk/unit-providers';
import { env } from '$env/dynamic/private';
import { GENERATION_BODY_LIMIT, VALIDATION_BODY_LIMIT } from '../../../request-limits.mjs';

export { VALIDATION_BODY_LIMIT };

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
  let configured: ReturnType<typeof createProvidersFromEnv> | undefined;
  let setupError = '';
  try {
    configured = createProvidersFromEnv(env);
  } catch (cause) {
    setupError =
      cause instanceof RunError ? cause.message : 'The model configuration could not be loaded.';
  }
  return {
    defaultDefinitionId,
    definitions: await Promise.all(
      [...bundledDefinitions, ...Object.keys(customPaths())].map(async (id) => {
        const definition = await definitionFor(id);
        return { id, title: id, inputSchema: definition.inputSchema };
      })
    ),
    providers: configured?.descriptions ?? [],
    modes: configured?.modes ?? [
      {
        id: 'default',
        label: 'Default',
        model: 'gpt-5.6-luna',
        reasoningEffort: 'high',
        configured: false
      },
      {
        id: 'quality',
        label: 'Quality',
        model: 'gpt-6-astra',
        reasoningEffort: 'low',
        configured: false
      }
    ],
    setupError
  };
}
export async function body(
  request: Request,
  maxBytes = GENERATION_BODY_LIMIT
): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    error(415, 'Send application/json.');
  const oversized = () => error(413, `Request exceeds ${maxBytes / (1024 * 1024)} MiB.`);
  if (Number(request.headers.get('content-length')) > maxBytes) oversized();
  const reader = request.body?.getReader();
  if (!reader) error(400, 'Missing request.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      // Cancelling this stream destroys the HTTP socket before it can deliver the 413.
      if (bytes > maxBytes) oversized();
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
function connectionFor(value: Record<string, unknown>): Execution {
  if (value.provider === 'fixture') return {};
  const configured = createProvidersFromEnv(env);
  if (value.provider) {
    const model = Object.hasOwn(configured.providers, String(value.provider))
      ? configured.providers[String(value.provider)]
      : undefined;
    if (!model)
      throw new RunError(
        'model-unavailable',
        'Selected connection is unavailable. Check the server configuration or choose another generation mode.'
      );
    return { ...configured.execution, model };
  }
  if (value.mode !== 'default' && value.mode !== 'quality')
    throw new RunError('configuration', 'Choose Default or Quality generation mode.');
  return configured.executionForMode(value.mode);
}

export async function run(request: Request, value: Record<string, unknown>) {
  if (!['generate', 'research'].includes(String(value.operation))) error(400, 'Unknown operation.');
  const definition = await definitionFor(String(value.definition));
  let selectedExecution: Execution;
  try {
    selectedExecution = connectionFor(value);
  } catch (cause) {
    error(
      400,
      cause instanceof RunError
        ? cause.message
        : 'Model configuration could not be loaded. Check the server settings.'
    );
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const execution: Execution = {
    ...selectedExecution,
    evaluate: qualifyUnit,
    reviewFidelity: value.provider !== 'fixture',
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
    let fixture: unknown;
    try {
      fixture = createBundledFixture(definition.id, (value.input ?? {}) as Record<string, unknown>);
    } catch (cause) {
      error(400, cause instanceof Error ? cause.message : 'Demo input is invalid.');
    }
    execution.model = { generate: async () => ({ value: fixture, mode: 'fixture' }) };
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
          } catch (cause) {
            send({
              type: 'error',
              message:
                cause instanceof RunError
                  ? cause.message
                  : 'The run could not complete. Check the model connection and try again.'
            });
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
const validEditOriginal = compileSchema({
  type: 'object',
  required: ['schemaVersion', 'status', 'definition', 'input', 'research', 'metadata'],
  properties: {
    schemaVersion: { const: '0.2' },
    status: { enum: ['success', 'failed', 'cancelled'] },
    definition: {
      type: 'object',
      required: ['id', 'version'],
      properties: {
        id: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        fileDigest: { type: 'string' },
        implementationVersion: { type: 'string' },
        configuration: { type: 'object' }
      }
    },
    research: { type: 'array', items: researchResultSchema },
    metadata: {
      type: 'object',
      required: ['modelCalls', 'repairs', 'elapsedMs', 'calls'],
      properties: {
        modelCalls: { type: 'number' },
        repairs: { type: 'number' },
        elapsedMs: { type: 'number' },
        calls: { type: 'array', items: { type: 'object' } }
      }
    }
  }
});

export async function revalidate(request: Request, value: Record<string, unknown>) {
  if (!Object.hasOwn(value, 'candidate')) error(400, 'An edited candidate is required.');
  if (!validEditOriginal(value.original)) {
    const issue = validEditOriginal.errors?.[0];
    error(400, `Invalid original result: ${issue?.instancePath || '/'} ${issue?.message}`);
  }
  const original = value.original as RunResult;
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
    AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
  );
  const qualification = qualifyUnit({
    definitionId: definition.id,
    candidate: value.candidate,
    research: original.research
  });
  const blockers = qualification.findings.filter((finding) => finding.severity === 'blocker');
  if (qualification.readiness === 'blocked') {
    report.system.status = 'failed';
    report.system.checks.push('unit-qualification');
    report.system.issues.push(
      ...blockers.map((finding) => ({
        code: finding.code,
        path: finding.location ?? '/',
        message: finding.message
      }))
    );
  }
  const character =
    (original.input as { kind?: string } | undefined)?.kind === 'character' ||
    original.research.some((item) => item.grounding !== 'original-concept');
  let sourceReview: Awaited<ReturnType<typeof reviewCandidateSources>> | undefined;
  let sourceReviewError: { message: string } | undefined;
  if (character && value.reviewSources === true && accepted(report)) {
    try {
      if (value.provider === 'fixture')
        throw new RunError(
          'model-unavailable',
          'Choose a configured model to review source fidelity. The rule-checked draft remains exportable.'
        );
      sourceReview = await reviewCandidateSources(
        value.candidate,
        original.input,
        original.research,
        { ...connectionFor(value), signal: request.signal },
        definition.rules
      );
      if (sourceReview.status !== 'success')
        sourceReviewError = {
          message:
            sourceReview.error?.message ??
            (sourceReview.issues.map((issue) => issue.message).join(' ') ||
              'Source review needs attention. Inspect the Research view, adjust the draft or provide better evidence, and check again.')
        };
    } catch (cause) {
      sourceReviewError = {
        message:
          cause instanceof RunError
            ? cause.message
            : 'Source review could not complete. Your rule-checked draft remains available to export.'
      };
    }
  }
  return {
    ...original,
    qualification,
    fidelity: sourceReview?.fidelity,
    fidelityAttempts: sourceReview?.fidelityAttempts,
    sourceReview,
    sourceReviewRequired: character && sourceReview?.status !== 'success',
    sourceReviewError,
    status: accepted(report) ? 'success' : 'failed',
    output: accepted(report) ? value.candidate : undefined,
    candidate: accepted(report) ? undefined : value.candidate,
    validation: report,
    error: undefined,
    edited: true
  };
}
