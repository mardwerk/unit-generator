import type { VisualReference } from '../core/index.js';

function metadata(reference: VisualReference): string {
  let text = `${reference.caption} ${reference.id} ${reference.url}`;
  try {
    text = decodeURIComponent(text);
  } catch {
    /* Keep readable source metadata. */
  }
  return text.replace(/[_-]/g, ' ');
}

/** Source labels identify coverage, not pixel analysis. */
export function isFullBodyReference(reference: VisualReference): boolean {
  return /\b(full\s*body|whole\s*body|entire\s*body|turnaround|character sheet)\b/i.test(
    metadata(reference),
  );
}

export function safeReference(reference: VisualReference): boolean {
  return [reference.url, reference.sourceUrl].every((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}

/** Prefer portrait-labelled art over action and full-body references, without character tables. */
export function rankedPortraits(references: VisualReference[]): VisualReference[] {
  const score = (reference: VisualReference) => {
    const text = metadata(reference);
    return (
      (reference.kind === 'appearance' ? 15 : 0) +
      (/\b(portrait|headshot|close\s*up|bust)\b/i.test(text) ? 80 : 0) +
      (/\b(infobox|profile)\b/i.test(text) ? 35 : 0) +
      (/\banime\b/i.test(text) ? 10 : 0) -
      (reference.kind === 'pose' ? 25 : 0) -
      (reference.kind === 'form' ? 15 : 0) -
      (reference.width && reference.height && reference.width / reference.height < 0.65 ? 40 : 0)
    );
  };
  return references
    .filter(safeReference)
    .sort(
      (a, b) =>
        Number(isFullBodyReference(a)) - Number(isFullBodyReference(b)) || score(b) - score(a),
    );
}
