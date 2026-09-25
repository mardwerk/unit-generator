import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ModelClient } from '../core/index.js';
import { ModelExecutionError } from '../core/index.js';
import { executeLabOperation } from './operations.js';
import type { LabRequest } from './contracts.js';
import { prepareCharacter } from '../node/character-source.js';
import { LabProvider } from './providers.js';
import type { ImageGenerationClient } from '../node/image-generation.js';
import { iconSubjects } from '../presentation/icon-subjects.js';
import { imagePrompt } from '../presentation/image-prompts.js';
import { readArtifactView } from '../presentation/view.js';
import { LabLibrary } from './library.js';
import { createEvidenceRun } from '../node/evidence.js';
import { preparedSchema, checkedArtifactSchema, unitProfileSchema } from '../core/index.js';

const maxRequestBytes = 32_000_000;
const operations = new Set([
  'character',
  'provider',
  'prepare',
  'draft',
  'check',
  'review',
  'inspect',
  'render',
  'library/save',
  'library/load',
  'library/delete',
  'library/configure',
  'library/icons',
  'library/portrait',
  'library/portrait/get',
  'library/icon/generate',
  'profiles/save',
  'profiles/delete',
]);
const characterInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  choice: z.number().int().positive().optional(),
  deliverable: z.enum(['concept', 'mechanics']).optional(),
  profile: unitProfileSchema.optional(),
});

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface LabServerOptions {
  model?: ModelClient;
  imageModel?: ImageGenerationClient;
  provider?: LabProvider;
  characterLookup?: typeof prepareCharacter;
  example: LabRequest;
  port?: number;
  publicDirectory?: URL;
  clientDirectory?: URL;
  library?: LabLibrary;
}

/** Foreground local adapter with an explicit local artifact library. */
export async function startLab(options: LabServerOptions) {
  const provider = options.provider ?? new LabProvider();
  const library = options.library ?? (await LabLibrary.open());
  const token = randomBytes(32).toString('hex');
  const publicDirectory = options.publicDirectory ?? new URL('./public/', import.meta.url);
  const clientDirectory = options.clientDirectory ?? new URL('./client/', import.meta.url);
  const pending = new Set<AbortController>();
  let activeModelStages = 0;
  const generatingIcons = new Set<string>();
  let origin = '';

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => sendError(response, error));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4317, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('UnitLab could not determine its local address.');
  }
  origin = `http://127.0.0.1:${address.port}`;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' https: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (`http://${request.headers.host}` !== origin) {
      throw new HttpError(403, 'INVALID_HOST', 'Use the local address printed by UnitLab.');
    }
    if (request.headers.origin && request.headers.origin !== origin) {
      throw new HttpError(403, 'INVALID_ORIGIN', 'UnitLab only accepts its own browser session.');
    }
    const pathname = new URL(request.url ?? '/', origin).pathname;
    if (!pathname.startsWith('/api/')) {
      if (request.method !== 'GET') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'This resource requires GET.');
      }
      return serveAsset(pathname, response, publicDirectory, clientDirectory, token);
    }
    if (!matchesToken(request.headers.authorization, token)) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Reload the local UnitLab page to reconnect.');
    }
    if (request.method === 'GET' && pathname === '/api/example') {
      return json(response, 200, options.example);
    }
    if (request.method === 'GET' && pathname === '/api/provider') {
      return json(response, 200, provider.state);
    }
    if (request.method === 'GET' && pathname === '/api/library') {
      return json(response, 200, await library.state());
    }
    if (request.method === 'GET' && pathname === '/api/profiles') {
      return json(response, 200, await library.profiles());
    }
    const operation = pathname.slice('/api/'.length);
    if (!operations.has(operation)) {
      throw new HttpError(404, 'NOT_FOUND', 'Unknown UnitLab operation.');
    }
    if (request.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'This operation requires POST.');
    }
    if (request.headers.origin !== origin) {
      throw new HttpError(403, 'INVALID_ORIGIN', 'UnitLab operations require its local origin.');
    }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
      throw new HttpError(415, 'JSON_REQUIRED', 'Send an application/json request.');
    }
    const usesModel =
      operation === 'draft' || operation === 'review' || operation === 'library/icon/generate';
    if ((operation === 'provider' || operation === 'library/configure') && activeModelStages > 0) {
      throw new HttpError(
        409,
        'BUSY',
        'Model stages are running. Wait or stop them before changing settings.',
      );
    }
    const controller = new AbortController();
    const disconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once('close', disconnect);
    pending.add(controller);
    if (usesModel) activeModelStages++;
    let iconDestination: string | undefined;
    try {
      const payload = await readJson(request);
      let artifact: unknown;
      if (operation === 'library/icon/generate') {
        const input = z
          .strictObject({
            artifact: z.unknown(),
            iconKey: z.string().min(1),
            model: z.string().min(1),
            confirmed: z.literal(true),
            destination: z.string().min(1).max(4096),
          })
          .parse(payload);
        const view = readArtifactView(input.artifact);
        const subject = iconSubjects(view.candidate).find((entry) => entry.key === input.iconKey);
        if (!subject)
          throw new HttpError(400, 'INVALID_ICON', 'Choose an icon belonging to this Unit.');
        if (!options.imageModel && !provider.state.images.ready)
          throw new HttpError(
            400,
            'PROVIDER_REQUIRED',
            'Image generation requires a valid OpenRouter API key in Settings.',
          );
        const client = options.imageModel ?? provider.imageClient;
        if (client.model !== input.model)
          throw new HttpError(
            409,
            'IMAGE_MODEL_CHANGED',
            'The image model changed. Open the confirmation again.',
          );
        // Validate the artifact and local destination before a potentially billable request.
        const destinations = await library.icons(input.artifact);
        if (
          destinations.icons.find((icon) => icon.key === input.iconKey)?.path !== input.destination
        )
          throw new HttpError(
            409,
            'ICON_DESTINATION_CHANGED',
            'The icon destination changed. Reload the icon and confirm its new destination.',
          );
        if (generatingIcons.has(input.destination))
          throw new HttpError(409, 'BUSY', 'This icon is already generating.');
        iconDestination = input.destination;
        generatingIcons.add(iconDestination);
        const image = await client.generate(
          imagePrompt(view.candidate, subject.label, subject.description, subject.kind, 1024),
          controller.signal,
        );
        controller.signal.throwIfAborted();
        try {
          const icons = await library.saveIcon(input.artifact, input.iconKey, image.png, {
            model: client.model,
            ...(image.usage ? { usage: image.usage } : {}),
          });
          artifact = { icons, model: client.model, ...(image.usage ? { usage: image.usage } : {}) };
        } catch {
          throw new ModelExecutionError(
            'The image was generated but could not be saved. Check the library folder before generating another image.',
            image.usage,
            {
              failure: {
                code: 'MODEL_FAILED',
                message:
                  'The image was generated but could not be saved. Check the library folder before generating another image.',
              },
            },
          );
        }
      } else if (operation === 'library/portrait/get') {
        const { artifact: unit } = z.strictObject({ artifact: z.unknown() }).parse(payload);
        artifact = await library.portrait(unit);
      } else if (operation === 'library/portrait') {
        const { artifact: unit, referenceId } = z
          .strictObject({ artifact: z.unknown(), referenceId: z.string().min(1).max(4096) })
          .parse(payload);
        artifact = await library.setPortrait(unit, referenceId);
      } else if (operation === 'library/icons') {
        const { artifact: unit } = z.strictObject({ artifact: z.unknown() }).parse(payload);
        artifact = await library.icons(unit);
      } else if (operation === 'library/save') {
        const { artifact: saved } = z.strictObject({ artifact: z.unknown() }).parse(payload);
        artifact = await library.save(saved);
      } else if (operation === 'library/load') {
        const { id } = z.strictObject({ id: z.string() }).parse(payload);
        artifact = await library.load(id);
      } else if (operation === 'library/delete') {
        const { ids } = z.strictObject({ ids: z.array(z.string()) }).parse(payload);
        artifact = await library.delete(ids);
      } else if (operation === 'library/configure') {
        if (activeModelStages > 0)
          throw new HttpError(409, 'BUSY', 'Wait for model stages before changing the library.');
        const { directory } = z.strictObject({ directory: z.string() }).parse(payload);
        artifact = await library.configure(directory);
      } else if (operation === 'provider') {
        if (activeModelStages > 0)
          throw new HttpError(409, 'BUSY', 'Wait for the current model stage to finish.');
        artifact = provider.configure(payload);
      } else if (operation === 'profiles/save') {
        const { profile } = z.strictObject({ profile: z.unknown() }).parse(payload);
        artifact = await library.saveProfile(profile);
      } else if (operation === 'profiles/delete') {
        const { id } = z.strictObject({ id: z.string() }).parse(payload);
        artifact = await library.deleteProfile(id);
      } else if (operation === 'character') {
        const { name, choice, deliverable, profile } = characterInput.parse(payload);
        artifact = await (options.characterLookup ?? prepareCharacter)(name, {
          choice,
          ...(profile ? { profile } : deliverable ? { deliverable } : {}),
          signal: controller.signal,
        });
      } else {
        if (usesModel && !options.model && !provider.state.ready) {
          throw new HttpError(400, 'PROVIDER_REQUIRED', provider.state.message);
        }
        const stagePayload =
          operation === 'draft' || operation === 'review'
            ? z.record(z.string(), z.unknown()).parse(payload)
            : null;
        const stageInput =
          operation === 'draft'
            ? preparedSchema.parse(stagePayload!.prepared)
            : operation === 'review'
              ? checkedArtifactSchema.parse(stagePayload!.checked)
              : null;
        const prepared = stageInput?.kind === 'prepared' ? stageInput : stageInput?.draft.prepared;
        const evidence =
          prepared?.request.deliverable === 'concept'
            ? await createEvidenceRun({
                directory: join((await library.state()).directory, 'evidence'),
                input: stageInput,
                settings: { operation },
              })
            : undefined;
        try {
          const client = options.model ?? provider.client;
          artifact = await executeLabOperation(
            operation,
            payload,
            evidence ? evidence.wrap(client) : client,
            controller.signal,
          );
          await evidence?.finish(artifact);
        } catch (error) {
          await evidence?.fail(error);
          throw error;
        }
      }
      controller.signal.throwIfAborted();
      json(response, 200, artifact);
    } finally {
      if (iconDestination) generatingIcons.delete(iconDestination);
      response.removeListener('close', disconnect);
      pending.delete(controller);
      if (usesModel) activeModelStages--;
    }
  }

  return {
    origin,
    token,
    url: `${origin}/`,
    async close() {
      for (const controller of pending) controller.abort();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}

function matchesToken(header: string | undefined, token: string): boolean {
  const supplied = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (tooLarge) return;
      if (size > maxRequestBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'INPUT_TOO_LARGE', 'UnitLab requests must be under 32 MB.'));
      } else {
        chunks.push(chunk);
      }
    });
    request.once('error', reject);
    request.once('end', () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'The request does not contain valid JSON.'));
      }
    });
  });
}

async function serveAsset(
  pathname: string,
  response: ServerResponse,
  publicDirectory: URL,
  clientDirectory: URL,
  token: string,
) {
  let file: URL;
  let type: string;
  if (pathname === '/' || pathname === '/index.html') {
    file = new URL('index.html', publicDirectory);
    type = 'text/html';
  } else if (pathname === '/styles.css') {
    file = new URL('styles.css', publicDirectory);
    type = 'text/css';
  } else if (pathname === '/app.js') {
    file = new URL('app.js', publicDirectory);
    type = 'text/javascript';
  } else if (pathname === '/mardwerk.png') {
    file = new URL('mardwerk.png', publicDirectory);
    type = 'image/png';
  } else if (/^\/client\/[a-z0-9-]+\.js$/.test(pathname)) {
    file = new URL(pathname.slice('/client/'.length), clientDirectory);
    type = 'text/javascript';
  } else if (pathname === '/presentation/usage.js') {
    file = new URL('../presentation/usage.js', import.meta.url);
    type = 'text/javascript';
  } else {
    throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
  }
  let content: Buffer;
  try {
    content = await readFile(file);
  } catch {
    throw new HttpError(
      404,
      'NOT_FOUND',
      'Resource not found. Run pnpm build before starting UnitLab.',
    );
  }
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  // Only the same-origin app can read this no-store HTML; API calls still require the token.
  response.end(
    type === 'text/html' ? content.toString('utf8').replace('__UNITLAB_SESSION__', token) : content,
  );
}

function json(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function sendError(response: ServerResponse, error: unknown) {
  if (error instanceof HttpError) {
    return json(response, error.status, { error: { code: error.code, message: error.message } });
  }
  const failure =
    error instanceof ModelExecutionError
      ? (error.failure ?? {
          code: 'MODEL_FAILED',
          message:
            'The model request failed. Check the provider configuration and retry this stage.',
        })
      : undefined;
  const message =
    failure?.message ??
    (error instanceof z.ZodError
      ? error.issues
          .slice(0, 8)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('\n')
      : error instanceof Error
        ? error.message
        : 'UnitLab operation failed.');
  return json(response, failure ? 502 : 400, {
    error: {
      code: failure?.code ?? 'OPERATION_FAILED',
      message,
      ...(failure ? { details: failure } : {}),
      ...(error instanceof ModelExecutionError && error.usage ? { usage: error.usage } : {}),
    },
  });
}
