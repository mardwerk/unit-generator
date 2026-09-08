import { createHash } from 'node:crypto';
import { RunError, type SourceAdapter, type DiscoveryCandidate } from '@mardwerk/unit-core';
import { readSources } from './sources.js';

/** Fixed public search endpoint. Search hits are candidates, not accepted identity evidence. */
export function createWikipediaDiscovery(fetcher: typeof fetch = fetch) {
  return async (
    subject: string,
    { signal, limit }: { signal: AbortSignal; limit: number }
  ): Promise<DiscoveryCandidate[]> => {
    const endpoint = new URL('https://en.wikipedia.org/w/api.php');
    endpoint.search = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: subject,
      srlimit: String(Math.min(4, limit)),
      format: 'json',
      utf8: '1'
    }).toString();
    const response = await fetcher(endpoint, {
      signal,
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'user-agent': 'MardwerkUnitGenerator/0.2 (bounded character source discovery)'
      }
    });
    if (!response.ok)
      throw new RunError(
        'discovery-unavailable',
        'Source discovery did not respond successfully.',
        'research'
      );
    const reader = response.body?.getReader();
    if (!reader)
      throw new RunError('discovery-unavailable', 'Source discovery returned no body.', 'research');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        bytes += value.length;
        if (bytes > 256 * 1024)
          throw new RunError(
            'discovery-limit',
            'Discovery response exceeded its byte limit.',
            'research'
          );
        chunks.push(value);
      }
    } finally {
      signal.removeEventListener('abort', abort);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      query?: { search?: { title?: string; snippet?: string }[] };
    };
    if (!Array.isArray(value.query?.search))
      throw new RunError(
        'discovery-unavailable',
        'Source discovery returned an invalid response.',
        'research'
      );
    const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const exact = value.query.search.filter(
      (page) => page.title && normalize(page.title) === normalize(subject)
    );
    return (exact.length ? exact : value.query.search).slice(0, limit).flatMap((page) =>
      typeof page.title === 'string'
        ? [
            {
              title: page.title,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
              description:
                typeof page.snippet === 'string'
                  ? page.snippet.replace(/<[^>]*>/g, '').slice(0, 1000)
                  : ''
            }
          ]
        : []
    );
  };
}
export function createSourceAdapter(
  options: { discover?: SourceAdapter['discover']; read?: typeof readSources } = {}
): SourceAdapter {
  return {
    discover: options.discover ?? createWikipediaDiscovery(),
    async acquire(urls, settings) {
      if (settings.maxSources <= 0) return;
      await (options.read ?? readSources)({
        concept: settings.subject,
        urls,
        signal: settings.signal,
        maxSources: settings.maxSources,
        maxSourceBytes: settings.maxSourceBytes,
        followLinks: settings.followLinks,
        onSource: (record) => {
          if (record.status === 'reading' || record.title === 'Redirect') return;
          settings.onSource({
            id: createHash('sha256').update(record.url).digest('hex').slice(0, 24),
            url: record.url,
            title: record.title ?? record.url,
            content: record.content ?? '',
            origin: 'retrieved',
            status: record.status,
            truncated: record.truncated ?? false,
            omissions: record.omissions ?? [],
            ...(record.error ? { error: record.error } : {})
          });
        }
      });
    }
  };
}
