import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import type { ResolvedDocument } from '../core/index.js';

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

class SourceHttpError extends Error {
  constructor(readonly status: number) {
    super(`Source retrieval returned HTTP ${status}. Supply saved article text with sourceUrl attribution if access is blocked.`);
  }
}

function httpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Source URLs must use HTTP or HTTPS without embedded credentials.');
  }
  return url;
}

function extractText(content: string, html: boolean): string {
  if (!html) return content.trim();
  const $ = load(content);
  const title = $('title').text().trim();
  if (/access denied|just a moment|attention required|checking your browser|403 forbidden|security check|verify you are human/i.test(title)
      || $('#challenge-running, #challenge-form, .cf-challenge, #cf-challenge-running').length) {
    throw new Error('Source is an access challenge, not evidence. Supply saved article text with sourceUrl attribution.');
  }
  $('script, style, noscript, nav, header, footer, aside:not(.portable-infobox), form, iframe, svg, .toc, .mw-editsection, .reference, .reflist, .navbox, .wikia-ad, .advertisement, [role="navigation"]').remove();
  const article = $('.mw-parser-output').first();
  const main = article.length ? article : $('main, article, [role="main"]').first();
  const body = main.length ? main : $('body');
  body.find('br').replaceWith('\n');
  body.find('p, div, section, h1, h2, h3, h4, h5, h6, li, tr, blockquote').each((_, element) => {
    $(element).append('\n');
  });
  const text = body.text().replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (/^(access denied|403 forbidden|verify you are human|just a moment)[.!\s]*$/i.test(text)) {
    throw new Error('Source is blocked. Supply saved article text with sourceUrl attribution.');
  }
  return text;
}

async function readFileBounded(path: string, maxBytes: number): Promise<string> {
  const file = await open(path, 'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error('Source file must be a regular file.');
    const buffer = Buffer.alloc(maxBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, null);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    if (bytes > maxBytes) throw new Error('Source exceeds the configured byte limit.');
    return buffer.subarray(0, bytes).toString('utf8');
  } finally {
    await file.close();
  }
}

async function retrieve(url: URL, options: Required<Pick<LoadDocumentOptions, 'timeoutMs' | 'maxBytes'>> & LoadDocumentOptions, json = false) {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await (options.fetch ?? fetch)(current, { redirect: 'manual', signal, headers: { Accept: json ? 'application/json' : 'text/html, text/plain;q=0.9' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === 5) throw new Error('Source redirected too many times or omitted its destination.');
      current = httpUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SourceHttpError(response.status);
    }
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (mime && !(json ? ['application/json'] : ['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown']).includes(mime)) {
      await response.body?.cancel();
      throw new Error('Source response must contain text or HTML.');
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > options.maxBytes) throw new Error('Source exceeds the configured byte limit.');
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    return { content: Buffer.concat(chunks).toString('utf8'), html: mime.includes('html'), location: current.href };
  }
  throw new Error('Source redirect limit reached.');
}

/** Resolve one explicit input. Attribution does not imply independent verification. */
export async function loadDocument(spec: DocumentSpec, baseDir: string, options: LoadDocumentOptions = {}): Promise<ResolvedDocument> {
  if (!spec || typeof spec.id !== 'string' || !spec.id.trim() || !['source', 'rules', 'decisions'].includes(spec.kind)) {
    throw new Error('Each document needs an id and a source, rules, or decisions kind.');
  }
  const inputs = [spec.text, spec.file, spec.url].filter(value => value !== undefined);
  if (inputs.length !== 1 || typeof inputs[0] !== 'string' || !inputs[0].trim()) {
    throw new Error(`Document ${spec.id} must specify exactly one nonempty text, file, or url.`);
  }
  const maxBytes = options.maxBytes ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Source byte limit and timeout must be positive integers.');
  }
  options.signal?.throwIfAborted();
  const attribution = spec.sourceUrl === undefined ? undefined : httpUrl(spec.sourceUrl).href;
  let content: string;
  let html = false;
  let origin: ResolvedDocument['origin'];
  if (spec.text !== undefined) {
    content = spec.text;
    if (Buffer.byteLength(content) > maxBytes) throw new Error('Source exceeds the configured byte limit.');
    origin = { location: attribution ?? spec.id, access: 'supplied', note: attribution ? 'User-supplied text attributed to this URL; the URL was not retrieved or independently verified.' : null };
  } else if (spec.file !== undefined) {
    const path = resolve(baseDir, spec.file);
    try {
      content = await readFileBounded(path, maxBytes);
    } catch (error) {
      const detail = error instanceof Error && !('code' in error) ? error.message : 'The referenced file could not be read.';
      throw new Error(`Document ${spec.id}: ${detail}`);
    }
    html = /\.x?html?$/i.test(path);
    origin = { location: attribution ?? path, access: 'local-file', note: attribution ? `User-supplied local file ${path}, attributed to this URL; the URL was not retrieved or independently verified.` : null };
  } else {
    try {
      const url = httpUrl(spec.url!);
      const settings = { ...options, maxBytes, timeoutMs };
      let retrieved;
      let fallbackNote: string | undefined;
      try {
        retrieved = await retrieve(url, settings);
      } catch (error) {
        if (!(error instanceof SourceHttpError) || error.status !== 403 || !url.hostname.endsWith('.fandom.com') || !url.pathname.startsWith('/wiki/')) throw error;
        const api = new URL('/api.php', url);
        api.search = new URLSearchParams({ action: 'parse', page: decodeURIComponent(url.pathname.slice('/wiki/'.length)), prop: 'text', format: 'json' }).toString();
        const response = await retrieve(api, settings, true);
        let payload: unknown;
        try { payload = JSON.parse(response.content); }
        catch { throw new Error('Source public wiki API returned invalid JSON. Supply saved article text with sourceUrl attribution.'); }
        const parsed = payload as { parse?: { text?: { '*'?: unknown } }; error?: unknown } | null;
        if (!parsed || parsed.error || typeof parsed.parse?.text?.['*'] !== 'string') {
          throw new Error('Source public wiki API did not return article HTML. Supply saved article text with sourceUrl attribution.');
        }
        retrieved = { content: parsed.parse.text['*'], html: true, location: url.href };
        fallbackNote = `The article page returned HTTP 403. Article HTML was retrieved through the public MediaWiki API at ${response.location}.`;
      }
      content = retrieved.content;
      html = retrieved.html;
      origin = { location: retrieved.location, access: 'retrieved', note: [`Retrieved at ${new Date().toISOString()}.`, fallbackNote, attribution ? `Caller attribution: ${attribution}.` : undefined].filter(Boolean).join(' ') };
    } catch (error) {
      if (options.signal?.aborted) throw new Error(`Document ${spec.id}: source retrieval was cancelled.`);
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error(`Document ${spec.id}: source retrieval timed out.`);
      if (error instanceof Error && error.message.startsWith('Source')) throw error;
      throw new Error(`Document ${spec.id}: source retrieval failed. Supply saved article text with sourceUrl attribution.`);
    }
  }
  options.signal?.throwIfAborted();
  html ||= /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(content);
  const text = extractText(content, html);
  if (!text) throw new Error(`Document ${spec.id} contains no usable text.`);
  return { id: spec.id, kind: spec.kind, text, origin };
}
