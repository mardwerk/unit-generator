import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { requestSchema, resultSchema, type AuthorRequest } from '../core/index.js';
import { loadDocument } from './sources.js';

const documentSpecSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['source', 'rules', 'decisions']),
  text: z.string().optional(),
  file: z.string().min(1).optional(),
  url: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
});

export const requestFileSchema = requestSchema.omit({ documents: true }).extend({
  documents: z.array(documentSpecSchema).min(1),
  constraints: requestSchema.shape.constraints.default([]),
  progression: requestSchema.shape.progression.default(null),
  previous: requestSchema.shape.previous.default(null),
  feedback: requestSchema.shape.feedback.default(null),
  previousResultFile: z.string().min(1).optional(),
});

export interface RequestFileOptions {
  previousResultFile?: string;
  feedback?: string;
  signal?: AbortSignal;
}

/** Read only the explicitly named JSON file. No directory or history discovery. */
export async function readJsonFile(file: string): Promise<unknown> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`Expected a regular JSON file: ${file}`);
  if (info.size > 32_000_000) throw new Error(`JSON file exceeds 32 MB: ${file}`);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${file}.`);
    throw error;
  }
  return value;
}

/** Node input adapter. Applications can instead supply a resolved AuthorRequest directly. */
export async function loadRequestFile(file: string, options: RequestFileOptions = {}): Promise<AuthorRequest> {
  const requestPath = resolve(file);
  const base = dirname(requestPath);
  const input = requestFileSchema.parse(await readJsonFile(requestPath));
  if (input.previous && (input.previousResultFile || options.previousResultFile)) {
    throw new Error('Supply either previous context or a previous Result file, not both.');
  }
  const documents = await Promise.all(input.documents.map(document => loadDocument(document, base, { signal: options.signal })));
  let previous = input.previous;
  const priorFile = options.previousResultFile ?? (input.previousResultFile ? resolve(base, input.previousResultFile) : undefined);
  if (priorFile) {
    const result = resultSchema.parse(await readJsonFile(priorFile));
    previous = { resultId: result.id, draft: result.candidate, findings: result.findings };
  }
  const { previousResultFile: _file, ...request } = input;
  return requestSchema.parse({ ...request, documents, previous, feedback: options.feedback ?? input.feedback });
}
