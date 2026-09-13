import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { RunError, type DiscoveryCandidate, type SourceAdapter } from '@mardwerk/unit-core';
import { createWikipediaDiscovery } from './discovery.js';

type Node = DefaultTreeAdapterMap['node'];
/** Public search supplies candidate URLs only. The research step reads and verifies each page. */
export function createCharacterDiscovery(fetcher: typeof fetch = fetch): SourceAdapter['discover'] {
  return async (subject, { signal, limit }) => {
    const discoverySignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
    const search = async (): Promise<DiscoveryCandidate[]> => {
      const url = new URL('https://html.duckduckgo.com/html/');
      url.searchParams.set('q', `${subject} character abilities powers`);
      const response = await fetcher(url, {
        signal: discoverySignal,
        redirect: 'error',
        headers: {
          accept: 'text/html',
          'user-agent': 'MardwerkUnitGenerator/0.2 (character source discovery)'
        }
      });
      if (!response.ok || !response.body)
        throw new RunError(
          'discovery-unavailable',
          'Public character search is unavailable.',
          'research'
        );
      const reader = response.body.getReader();
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
          if (done) break;
          bytes += value.length;
          if (bytes > 512 * 1024)
            throw new RunError(
              'discovery-limit',
              'Character search exceeded its response limit.',
              'research'
            );
          chunks.push(value);
        }
      } finally {
        signal.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const document = parse(Buffer.concat(chunks).toString('utf8'));
      const candidates: DiscoveryCandidate[] = [];
      const text = (node: Node): string =>
        'value' in node
          ? node.value
          : 'childNodes' in node
            ? node.childNodes.map(text).join('')
            : '';
      const walk = (node: Node) => {
        if (
          'tagName' in node &&
          node.tagName === 'a' &&
          node.attrs
            .find((attr) => attr.name === 'class')
            ?.value.split(/\s+/)
            .includes('result__a')
        ) {
          try {
            const href = node.attrs.find((attr) => attr.name === 'href')?.value;
            const link = new URL(href ?? '', url);
            const destination = new URL(link.searchParams.get('uddg') ?? link.href);
            if (
              ['https:', 'http:'].includes(destination.protocol) &&
              !destination.username &&
              !destination.password &&
              !/\/f\/|\/forum|\/discussion/i.test(destination.pathname)
            )
              candidates.push({
                url: destination.href,
                title: text(node).trim().slice(0, 512),
                description: 'Search candidate. Page content and continuity have not been verified.'
              });
          } catch {
            /* Malformed search links are not sources. */
          }
        }
        if ('childNodes' in node) node.childNodes.forEach(walk);
      };
      walk(document);
      return candidates;
    };
    const results = await Promise.allSettled([
      search(),
      createWikipediaDiscovery(fetcher)(subject, {
        signal: discoverySignal,
        limit: Math.min(2, limit)
      })
    ]);
    signal.throwIfAborted();
    const web = results[0].status === 'fulfilled' ? results[0].value : [];
    const wikipedia = results[1].status === 'fulfilled' ? results[1].value : [];
    const candidates = [
      ...web.slice(0, 1),
      ...wikipedia.slice(0, 1),
      ...web.slice(1),
      ...wikipedia.slice(1)
    ];
    const seen = new Set<string>();
    const hosts = new Map<string, number>();
    return candidates
      .filter((candidate) => {
        const host = new URL(candidate.url).hostname;
        if (seen.has(candidate.url) || (hosts.get(host) ?? 0) >= 1) return false;
        seen.add(candidate.url);
        hosts.set(host, 1);
        return true;
      })
      .slice(0, limit);
  };
}
