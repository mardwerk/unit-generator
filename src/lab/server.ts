import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ModelClient } from '../core/index.js';
import { executeLabOperation } from './operations.js';
import type { LabRequest } from './contracts.js';

const maxRequestBytes = 32_000_000;
const operations = new Set(['prepare', 'draft', 'check', 'review', 'inspect', 'render']);

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
  model: ModelClient;
  example: LabRequest;
  port?: number;
  publicDirectory?: URL;
  clientDirectory?: URL;
}

/** Foreground local adapter. Artifacts and revision history belong to its caller. */
export async function startLab(options: LabServerOptions) {
  const token = randomBytes(32).toString('hex');
  const publicDirectory = options.publicDirectory ?? new URL('./public/', import.meta.url);
  const clientDirectory = options.clientDirectory ?? new URL('./client/', import.meta.url);
  const pending = new Set<AbortController>();
  let modelBusy = false;
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
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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
      return serveAsset(pathname, response, publicDirectory, clientDirectory);
    }
    if (!matchesToken(request.headers.authorization, token)) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Open the session link printed by UnitLab.');
    }
    if (request.method === 'GET' && pathname === '/api/example') {
      return json(response, 200, options.example);
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
    const usesModel = operation === 'draft' || operation === 'review';
    if (usesModel && modelBusy) {
      throw new HttpError(409, 'BUSY', 'Another model stage is running. Wait or stop it first.');
    }
    const controller = new AbortController();
    const disconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once('close', disconnect);
    pending.add(controller);
    if (usesModel) modelBusy = true;
    try {
      const payload = await readJson(request);
      const artifact = await executeLabOperation(
        operation,
        payload,
        options.model,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      json(response, 200, artifact);
    } finally {
      response.removeListener('close', disconnect);
      pending.delete(controller);
      if (usesModel) modelBusy = false;
    }
  }

  return {
    origin,
    token,
    url: `${origin}/#token=${token}`,
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
) {
  let file: URL;
  let type: string;
  if (pathname === '/' || pathname === '/index.html') {
    file = new URL('index.html', publicDirectory);
    type = 'text/html';
  } else if (pathname === '/styles.css') {
    file = new URL('styles.css', publicDirectory);
    type = 'text/css';
  } else if (/^\/client\/[a-z0-9-]+\.js$/.test(pathname)) {
    file = new URL(pathname.slice('/client/'.length), clientDirectory);
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
  response.end(content);
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
  const message =
    error instanceof z.ZodError
      ? error.issues
          .slice(0, 8)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('\n')
      : error instanceof Error
        ? error.message
        : 'UnitLab operation failed.';
  return json(response, 400, { error: { code: 'OPERATION_FAILED', message } });
}
