import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ModelExecutionError,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from '../core/model.js';
import { modelUsageSchema, type ModelUsage } from '../core/schemas.js';

/** Provider answer fields only. Never pass transport envelopes, headers or SDK errors. */
export interface ModelOutputEvidence {
  content: string | null;
  refusal?: string | null;
  finishReason?: string | null;
  truncated?: boolean;
  redacted?: boolean;
  usage?: ModelUsage;
}
export type ModelOutputObserver = (output: ModelOutputEvidence) => Promise<void>;
export interface EvidenceModelClient extends ModelClient {
  readonly evidenceSettings?: Record<string, unknown>;
  generateWithEvidence?(
    request: ModelRequest,
    observe: ModelOutputObserver,
  ): Promise<ModelResponse>;
}

export class EvidenceWriteError extends Error {
  constructor() {
    super('Evidence could not be saved. Check the evidence directory and available disk space.');
    this.name = 'EvidenceWriteError';
  }
}

export interface EvidenceRun {
  readonly directory: string;
  wrap(model: ModelClient): ModelClient;
  finish(artifact: unknown): Promise<void>;
  fail(error: unknown): Promise<void>;
}

/** Explicit inputs may contain private design material. Files are local and owner-readable. */
export async function createEvidenceRun(options: {
  directory: string;
  input: unknown;
  settings?: Record<string, unknown>;
}): Promise<EvidenceRun> {
  const startedAt = new Date().toISOString();
  const directory = resolve(options.directory, `${startedAt.replaceAll(':', '-')}-${randomUUID()}`);
  const save = async (name: string, value: unknown) => {
    try {
      await writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
    } catch {
      throw new EvidenceWriteError();
    }
  };
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await save('input.json', options.input);
    await save('manifest.json', {
      format: 'unit-generator-evidence-v1',
      startedAt,
      nodeVersion: process.version,
      settings: safeSettings(options.settings),
      runtimeFiles: await runtimeManifest(),
      limits: [
        'Development evidence, not a controlled study or gameplay observation.',
        'Provider routing, sampling and usage remain unknown unless reported.',
        'Input and model requests retain caller-supplied private design material.',
      ],
    });
    await save('observations.json', {
      status: 'unassessed',
      demonstration: {
        status: 'not-recorded',
        distinctiveBehavior: null,
        helpfulSituation: null,
        unhelpfulSituation: null,
        expectedPlayerDecision: null,
        execution: 'not-executed',
      },
      preservation: {
        status: 'not-assessed',
        originalBehavior: null,
        revisedBehavior: null,
        classification: null,
      },
      acceptance: {
        status: 'not-assessed',
        reviewer: null,
        reasons: [],
        humanCorrectionMinutes: null,
      },
      checks: [],
      instructions:
        'Record scenarios as predicted until executed. Separate deterministic checks, model judgments and human observations. Acceptance is a caller decision.',
    });
  } catch {
    throw new EvidenceWriteError();
  }
  let nextAttempt = 0;
  return {
    directory,
    wrap(model) {
      const observed = model as EvidenceModelClient;
      return {
        get id() {
          return model.id;
        },
        async generate(request) {
          const attempt = String(++nextAttempt).padStart(3, '0');
          const start = performance.now();
          const requestedAt = new Date().toISOString();
          await save(`${attempt}-request.json`, {
            requestedAt,
            model: safeIdentifier(model.id),
            settings: safeSettings(observed.evidenceSettings),
            system: request.system,
            prompt: request.prompt,
            schema: request.schema,
          });
          let captured = false;
          const observe: ModelOutputObserver = async (output) => {
            await save(`${attempt}-raw-output.json`, output);
            captured = true;
          };
          try {
            const response = observed.generateWithEvidence
              ? await observed.generateWithEvidence(request, observe)
              : await model.generate(request);
            // This runs before the core receives and validates the output.
            await save(`${attempt}-output.json`, {
              output: response.output,
              usage: safeUsage(response.usage),
            });
            await save(`${attempt}-outcome.json`, {
              status: 'returned',
              completedAt: new Date().toISOString(),
              elapsedMs: performance.now() - start,
              model: safeIdentifier(model.id),
              settings: safeSettings(observed.evidenceSettings),
              rawOutput: captured ? 'recorded' : 'unavailable',
              usage: safeUsage(response.usage),
              validation: 'not-performed-by-recorder',
            });
            return response;
          } catch (error) {
            if (error instanceof EvidenceWriteError) throw error;
            await save(`${attempt}-outcome.json`, {
              status: 'failed',
              completedAt: new Date().toISOString(),
              elapsedMs: performance.now() - start,
              model: safeIdentifier(model.id),
              settings: safeSettings(observed.evidenceSettings),
              rawOutput: captured ? 'recorded' : 'unavailable',
              ...safeFailure(error),
            });
            throw error;
          }
        },
      };
    },
    async finish(artifact) {
      await save('artifact.json', artifact);
      await save('outcome.json', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        attempts: nextAttempt,
        acceptance: 'not-assessed',
      });
    },
    async fail(error) {
      await save('outcome.json', {
        status: 'failed',
        completedAt: new Date().toISOString(),
        attempts: nextAttempt,
        ...safeFailure(error),
      });
    },
  };
}

function safeFailure(error: unknown) {
  const known = error instanceof ModelExecutionError ? error : undefined;
  return {
    failure: {
      code:
        error instanceof EvidenceWriteError
          ? 'EVIDENCE_WRITE_FAILED'
          : error instanceof Error && error.name === 'AbortError'
            ? 'CANCELLED'
            : (known?.failure?.code ?? 'MODEL_FAILED'),
      stage: known?.failure?.stage ?? null,
      httpStatus: known?.failure?.httpStatus ?? null,
      timeoutMs: known?.failure?.timeoutMs ?? null,
    },
    usage: safeUsage(known?.usage),
  };
}
function safeUsage(value: unknown) {
  const parsed = modelUsageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function safeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 256 && /^[a-zA-Z0-9._:/=+-]+$/.test(value)
    ? value
    : null;
}
function safeSettings(settings: Record<string, unknown> | undefined) {
  return {
    model: safeIdentifier(settings?.model),
    reasoningEffort: safeIdentifier(settings?.reasoningEffort),
    ...Object.fromEntries(
      ['temperature', 'topP', 'maxTokens', 'timeoutMs', 'maxOutputBytes'].map((key) => [
        key,
        typeof settings?.[key] === 'number' && Number.isFinite(settings[key])
          ? settings[key]
          : null,
      ]),
    ),
  };
}

/** Hash executed module files, including local modifications; a Git SHA alone cannot do this. */
async function runtimeManifest() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const files: Record<string, string> = {};
  async function visit(relative: string) {
    for (const item of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = join(relative, item.name);
      if (item.isDirectory()) await visit(path);
      else if (/\.(?:js|ts)$/.test(item.name) && !item.name.endsWith('.d.ts')) {
        files[path] = createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex');
      }
    }
  }
  await visit('core');
  await visit('node');
  return files;
}
