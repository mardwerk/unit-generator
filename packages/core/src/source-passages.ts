export interface SourcePassage {
  id: string;
  start: number;
  end: number;
  text: string;
}
/** Contiguous, non-overlapping UTF-16 ranges covering the exact captured text. */
export function sourcePassages(content: string): SourcePassage[] {
  const passages: SourcePassage[] = [];
  for (let start = 0; start < content.length;) {
    let end = Math.min(content.length, start + 1200);
    if (end < content.length) {
      const boundary = Math.max(
        content.lastIndexOf('\n', end),
        content.lastIndexOf('. ', end - 1) + 1
      );
      if (boundary >= start + 600) end = boundary;
      else {
        const space = content.lastIndexOf(' ', end);
        if (space >= start + 600) end = space;
      }
      const code = content.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    passages.push({ id: `p${passages.length}`, start, end, text: content.slice(start, end) });
    start = end;
  }
  return passages;
}
