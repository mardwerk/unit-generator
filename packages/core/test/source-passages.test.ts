import { describe, expect, it } from 'vitest';
import { sourcePassages } from '../src/source-passages.js';

describe('captured source passages', () => {
  it('keeps punctuation at the limit inside the next bounded passage', () => {
    const content = 'x'.repeat(1200) + '. ' + 'y'.repeat(1300);
    const passages = sourcePassages(content);
    expect(passages.every((passage) => passage.text.length <= 1200)).toBe(true);
    expect(passages.map((passage) => passage.text).join('')).toBe(content);
  });
  it('covers the exact original text with stable contiguous ranges', () => {
    const content = 'He stretches.\n日本語の冷気と氷。😀 More captured evidence. '.repeat(150);
    const passages = sourcePassages(content);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.map((passage) => passage.text).join('')).toBe(content);
    expect(sourcePassages(content)).toEqual(passages);
    for (const [index, passage] of passages.entries()) {
      expect(passage.id).toBe(`p${index}`);
      expect(passage.start).toBe(index ? passages[index - 1]!.end : 0);
      expect(passage.text).toBe(content.slice(passage.start, passage.end));
      expect(passage.text.length).toBeLessThanOrEqual(1200);
    }
  });
  it('does not split a surrogate pair when a long unbroken passage reaches its limit', () => {
    const content = 'x'.repeat(1199) + '😀' + 'x'.repeat(20);
    const passages = sourcePassages(content);
    expect(passages[0]!.text).toBe('x'.repeat(1199));
    expect(passages[1]!.text.startsWith('😀')).toBe(true);
    expect(passages.map((passage) => passage.text).join('')).toBe(content);
  });
});
