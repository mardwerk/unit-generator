export interface RetrievalOptions {
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

class SourceHttpError extends Error {
  constructor(readonly status: number) {
    super(
      `Source retrieval returned HTTP ${status}. Supply saved article text with sourceUrl attribution if access is blocked.`,
    );
  }
}

export function httpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Source URLs must use HTTP or HTTPS without embedded credentials.');
  }
  return url;
}

/** Retrieve exactly the requested article, with a scoped public API fallback. */
export async function retrieveArticle(url: URL, options: RetrievalOptions) {
  let retrieved;
  let fallbackNote: string | undefined;
  try {
    retrieved = await retrieve(url, options);
  } catch (error) {
    if (
      !(error instanceof SourceHttpError) ||
      error.status !== 403 ||
      !url.hostname.endsWith('.fandom.com') ||
      !url.pathname.startsWith('/wiki/')
    ) {
      throw error;
    }
    const api = new URL('/api.php', url);
    api.search = new URLSearchParams({
      action: 'parse',
      page: decodeURIComponent(url.pathname.slice('/wiki/'.length)),
      prop: 'text',
      format: 'json',
    }).toString();
    const response = await retrieve(api, options, 'json');
    const articleHtml = parseWikiArticle(response.content);
    retrieved = {
      content: articleHtml,
      html: true,
      location: url.href,
    };
    fallbackNote = `The article page returned HTTP 403. Article HTML was retrieved through the public MediaWiki API at ${response.location}.`;
  }
  return {
    ...retrieved,
    fallbackNote,
  };
}

async function retrieve(url: URL, options: RetrievalOptions, format: 'text' | 'json' = 'text') {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await (options.fetch ?? fetch)(current, {
      redirect: 'manual',
      signal,
      headers: { Accept: format === 'json' ? 'application/json' : 'text/html, text/plain;q=0.9' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === 5) {
        throw new Error('Source redirected too many times or omitted its destination.');
      }
      current = httpUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SourceHttpError(response.status);
    }
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const allowedMimeTypes =
      format === 'json'
        ? ['application/json']
        : ['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown'];
    if (mime && !allowedMimeTypes.includes(mime)) {
      await response.body?.cancel();
      throw new Error('Source response must contain text or HTML.');
    }
    const content = await readResponseText(response, options.maxBytes);
    return {
      content,
      html: mime.includes('html'),
      location: current.href,
    };
  }
  throw new Error('Source redirect limit reached.');
}

function parseWikiArticle(content: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error(
      'Source public wiki API returned invalid JSON. Supply saved article text with ' +
        'sourceUrl attribution.',
    );
  }
  const parsed = payload as {
    parse?: {
      text?: {
        '*'?: unknown;
      };
    };
    error?: unknown;
  } | null;
  if (!parsed || parsed.error || typeof parsed.parse?.text?.['*'] !== 'string') {
    throw new Error(
      'Source public wiki API did not return article HTML. Supply saved article text ' +
        'with sourceUrl attribution.',
    );
  }
  return parsed.parse.text['*'];
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = response.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          throw new Error('Source exceeds the configured byte limit.');
        }
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}
