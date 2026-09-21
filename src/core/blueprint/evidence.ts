import type { AuthorRequest } from '../schemas.js';

export interface EvidenceSpan {
  id: string;
  documentId: string;
  text: string;
}

/** Preserve the explicit period context carried by an observed technique link. */
export function historicalTechniqueContext(request: AuthorRequest, documentId: string) {
  const document = request.documents.find((entry) => entry.id === documentId);
  if (!document?.id.startsWith('character-technique:')) return null;
  const section = document.text.match(/^Section: (.+)$/m)?.[0];
  if (!section || !/\bformer\b/i.test(section)) return null;
  const technique = document.text.match(/^Link text: (.+)$/m)?.[1] ?? 'Selected technique';
  return { documentId, quote: section, technique };
}

/** Deterministic source passages. Selection is model-assisted; quotation is not. */
export function evidenceSpans(request: AuthorRequest): EvidenceSpan[] {
  const spans: EvidenceSpan[] = [];
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  request.documents.forEach((document, docIndex) => {
    if (document.kind !== 'source') return;
    const passages: string[] = [];
    for (const { segment } of segmenter.segment(document.text)) {
      const previous = passages.at(-1);
      if (previous !== undefined && previous.trim().length < 15) {
        passages[passages.length - 1] = previous + segment;
      } else {
        passages.push(segment);
      }
    }
    if (passages.length > 1 && passages.at(-1)!.trim().length < 15) {
      const tail = passages.pop()!;
      passages[passages.length - 1] += tail;
    }
    let index = 0;
    for (const passage of passages) {
      let remaining = passage.trim();
      while (remaining.length) {
        let end = remaining.length;
        if (end > 450) {
          const wordBoundary = remaining.lastIndexOf(' ', 450);
          end = wordBoundary >= 15 ? wordBoundary : 450;
          // Leave enough of the preceding text with a short final clause or word.
          if (remaining.slice(end).trim().length < 15) end = Math.max(15, end - 15);
        }
        const text = remaining.slice(0, end).trim();
        // Even a wholly short document remains visible to the author. It cannot
        // meet a longer quotation requirement merely by being omitted here.
        if (text)
          spans.push({ id: `source${docIndex + 1}:${index++}`, documentId: document.id, text });
        remaining = remaining.slice(end).trim();
      }
    }
  });
  return spans;
}

/** Bounded lexical retrieval, not a guarantee of canon relevance or source coverage.
 * Full documents remain in the Request for inspection. */
export function authorEvidence(request: AuthorRequest): EvidenceSpan[] {
  const all = evidenceSpans(request);
  const planned = request.mechanicsDefinition?.profile.authoringMode === 'planned-v1';
  const limit = planned ? 18_000 : 6_000;
  const maxSpans = planned ? 96 : Infinity;
  if (all.length <= maxSpans && all.reduce((total, span) => total + span.text.length, 0) <= limit)
    return all;
  const first = new Set<string>();
  const seenText = new Set<string>();
  const ranked = all.map((span, index) => {
    const identity = !first.has(span.documentId);
    first.add(span.documentId);
    const textKey = JSON.stringify([span.documentId, span.text]);
    const repeated = seenText.has(textKey);
    seenText.add(textKey);
    const combat =
      span.text.match(
        /\b(?:abilit\w*|power\w*|attack\w*|combat|strength|speed|technique\w*|transform\w*|form\w*|damage|control|weapon\w*|punch\w*|beam\w*|stretc\w*|absor\w*|mimic\w*|summon\w*|limit\w*|weak\w*|cannot|unable|immune|immunity)\b/gi,
      )?.length ?? 0;
    const planningRelevance = planned
      ? (/\b(?:signature|primary|characteristic)\b/i.test(span.text) ? 3 : 0) +
        Math.min(
          span.text.match(
            /\b(?:fires?|firing|shoots?|shooting|launch\w*|emits?|emitting|strikes?|striking|throws?|throwing|projectiles?|slashes?|slashing)\b/gi,
          )?.length ?? 0,
          3,
        ) +
        (/\b(?:cannot|unable|requires?|only|former|limitations?|weakness\w*)\b/i.test(span.text)
          ? 4
          : 0)
      : 0;
    return {
      span,
      index,
      score:
        planned && repeated ? -1 : (identity ? 100 : 0) + Math.min(combat, 12) + planningRelevance,
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  let used = 0;
  let selectedCount = 0;
  const reserved = new Set<string>();
  if (planned) {
    // Retrieved technique articles already pair ownership and period context with
    // behavior and exceptions. Keep compact articles whole before lexical ranking
    // can favor repeated inventory headings over their less formulaic prose.
    for (const document of request.documents) {
      if (!document.id.startsWith('character-technique:')) continue;
      const packet = all.filter((span) => span.documentId === document.id);
      const size = packet.reduce((total, span) => total + span.text.length, 0);
      if (
        packet.length > 32 ||
        size > 6_000 ||
        selectedCount + packet.length > maxSpans ||
        used + size > limit
      )
        continue;
      for (const span of packet) reserved.add(span.id);
      used += size;
      selectedCount += packet.length;
    }
  }
  const selected = ranked.filter(({ span }) => {
    if (reserved.has(span.id)) return true;
    if (selectedCount >= maxSpans || used + span.text.length > limit) return false;
    used += span.text.length;
    selectedCount++;
    return true;
  });
  return selected.sort((a, b) => a.index - b.index).map(({ span }) => span);
}
