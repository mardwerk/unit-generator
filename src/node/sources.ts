import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import type { ResolvedDocument } from '../core/index.js';
import { httpUrl, retrieveArticle, type RetrievalOptions } from './source-retrieval.js';

export interface DocumentSpec {
  id: string;
  kind: 'source' | 'rules' | 'decisions';
  text?: string;
  file?: string;
  url?: string;
  sourceUrl?: string;
}

export interface LoadDocumentOptions {
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

interface DocumentContent {
  content: string;
  html: boolean;
  origin: ResolvedDocument['origin'];
}

/** Resolve one explicit input. Attribution does not imply independent verification. */
export async function loadDocument(
  spec: DocumentSpec,
  baseDir: string,
  options: LoadDocumentOptions = {},
): Promise<ResolvedDocument> {
  validateDocumentSpec(spec);
  const settings = resolveOptions(options);
  options.signal?.throwIfAborted();
  const attribution = spec.sourceUrl === undefined ? undefined : httpUrl(spec.sourceUrl).href;
  let document: DocumentContent;
  if (spec.text !== undefined) {
    document = suppliedDocument(spec, attribution, settings.maxBytes);
  } else if (spec.file !== undefined) {
    document = await localDocument(spec, baseDir, attribution, settings.maxBytes);
  } else {
    document = await remoteDocument(spec, attribution, settings);
  }
  options.signal?.throwIfAborted();
  const html = document.html || /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(document.content);
  const text = extractText(document.content, html);
  if (!text) {
    throw new Error(`Document ${spec.id} contains no usable text.`);
  }
  return {
    id: spec.id,
    kind: spec.kind,
    text,
    origin: document.origin,
  };
}

function validateDocumentSpec(spec: DocumentSpec): void {
  if (
    !spec ||
    typeof spec.id !== 'string' ||
    !spec.id.trim() ||
    !['source', 'rules', 'decisions'].includes(spec.kind)
  ) {
    throw new Error('Each document needs an id and a source, rules, or decisions kind.');
  }
  const inputs = [spec.text, spec.file, spec.url].filter((value) => value !== undefined);
  if (inputs.length !== 1 || typeof inputs[0] !== 'string' || !inputs[0].trim()) {
    throw new Error(`Document ${spec.id} must specify exactly one nonempty text, file, or url.`);
  }
}

function resolveOptions(options: LoadDocumentOptions): RetrievalOptions {
  const maxBytes = options.maxBytes ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new Error('Source byte limit and timeout must be positive integers.');
  }
  return {
    ...options,
    maxBytes,
    timeoutMs,
  };
}

function suppliedDocument(
  spec: DocumentSpec,
  attribution: string | undefined,
  maxBytes: number,
): DocumentContent {
  const content = spec.text!;
  if (Buffer.byteLength(content) > maxBytes) {
    throw new Error('Source exceeds the configured byte limit.');
  }
  const origin: ResolvedDocument['origin'] = {
    location: attribution ?? spec.id,
    access: 'supplied',
    note: attribution
      ? 'User-supplied text attributed to this URL; the URL was not retrieved or independently verified.'
      : null,
  };
  return {
    content,
    html: false,
    origin,
  };
}

async function localDocument(
  spec: DocumentSpec,
  baseDir: string,
  attribution: string | undefined,
  maxBytes: number,
): Promise<DocumentContent> {
  let content: string;
  const path = resolve(baseDir, spec.file!);
  try {
    content = await readFileBounded(path, maxBytes);
  } catch (error) {
    const detail =
      error instanceof Error && !('code' in error)
        ? error.message
        : 'The referenced file could not be read.';
    throw new Error(`Document ${spec.id}: ${detail}`);
  }
  const html = /\.x?html?$/i.test(path);
  const origin: ResolvedDocument['origin'] = {
    location: attribution ?? path,
    access: 'local-file',
    note: attribution
      ? `User-supplied local file ${path}, attributed to this URL; the URL was not retrieved or independently verified.`
      : null,
  };
  return {
    content,
    html,
    origin,
  };
}

async function remoteDocument(
  spec: DocumentSpec,
  attribution: string | undefined,
  options: RetrievalOptions,
): Promise<DocumentContent> {
  try {
    const retrieved = await retrieveArticle(httpUrl(spec.url!), options);
    const notes = [
      `Retrieved at ${new Date().toISOString()}.`,
      retrieved.fallbackNote,
      attribution ? `Caller attribution: ${attribution}.` : undefined,
    ];
    return {
      content: retrieved.content,
      html: retrieved.html,
      origin: {
        location: retrieved.location,
        access: 'retrieved',
        note: notes.filter(Boolean).join(' '),
      },
    };
  } catch (error) {
    if (options.signal?.aborted) {
      throw new Error(`Document ${spec.id}: source retrieval was cancelled.`);
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`Document ${spec.id}: source retrieval timed out.`);
    }
    if (error instanceof Error && error.message.startsWith('Source')) {
      throw error;
    }
    throw new Error(
      `Document ${spec.id}: source retrieval failed. Supply saved article text with sourceUrl attribution.`,
    );
  }
}

function extractText(content: string, html: boolean): string {
  if (!html) {
    return content.trim();
  }
  const $ = load(content);
  const title = $('title').text().trim();
  if (
    /access denied|just a moment|attention required|checking your browser|403 forbidden|security check|verify you are human/i.test(
      title,
    ) ||
    $('#challenge-running, #challenge-form, .cf-challenge, #cf-challenge-running').length
  ) {
    throw new Error(
      'Source is an access challenge, not evidence. Supply saved article text with ' +
        'sourceUrl attribution.',
    );
  }
  $(
    'script, style, noscript, nav, header, footer, aside:not(.portable-infobox), ' +
      'form, iframe, svg, .toc, .mw-editsection, .reference, .reflist, .navbox, ' +
      '.wikia-ad, .advertisement, [role="navigation"]',
  ).remove();
  const article = $('.mw-parser-output').first();
  const main = article.length ? article : $('main, article, [role="main"]').first();
  const body = main.length ? main : $('body');
  body.find('br').replaceWith('\n');
  body.find('p, div, section, h1, h2, h3, h4, h5, h6, li, tr, blockquote').each((_, element) => {
    $(element).append('\n');
  });
  const text = body
    .text()
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (/^(access denied|403 forbidden|verify you are human|just a moment)[.!\s]*$/i.test(text)) {
    throw new Error('Source is blocked. Supply saved article text with sourceUrl attribution.');
  }
  return text;
}

async function readFileBounded(path: string, maxBytes: number): Promise<string> {
  const file = await open(path, 'r');
  try {
    if (!(await file.stat()).isFile()) {
      throw new Error('Source file must be a regular file.');
    }
    const buffer = Buffer.alloc(maxBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, null);
      if (!read.bytesRead) {
        break;
      }
      bytes += read.bytesRead;
    }
    if (bytes > maxBytes) {
      throw new Error('Source exceeds the configured byte limit.');
    }
    return buffer.subarray(0, bytes).toString('utf8');
  } finally {
    await file.close();
  }
}
