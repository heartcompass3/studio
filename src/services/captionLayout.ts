import type { CaptionItem } from '../types/studio';

export interface CaptionPage { lines: string[][]; first: number; count: number }

/** Two measured lines per page, with stable word indices for highlighting/timing. */
export function captionPages(text: string, measure: (text: string) => number, width: number): CaptionPage[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const pages: CaptionPage[] = [];
  let lines: string[][] = [], line: string[] = [], first = 0, count = 0;
  const flush = () => {
    if (line.length) lines.push(line);
    if (count) pages.push({ lines, first, count });
    first += count; count = 0; lines = []; line = [];
  };
  for (const word of words) {
    if (count >= 6) flush();
    if (line.length && measure([...line, word].join(' ')) > Math.max(1, width)) {
      lines.push(line); line = [];
      if (lines.length === 2) flush();
    }
    line.push(word); count++;
  }
  flush();
  return pages;
}

export function pageAtWord(pages: CaptionPage[], word: number): CaptionPage | undefined {
  return pages.find(page => word >= page.first && word < page.first + page.count) || pages[pages.length - 1];
}

/** N-way splitting preserves text and the exact enclosing interval, including pauses between cues. */
export function splitLongCaptions(captions: CaptionItem[]): CaptionItem[] {
  let nextId = Math.max(-1, ...captions.map(caption => caption.id)) + 1;
  return captions.flatMap(caption => {
    const words = caption.text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 6 || !(caption.end > caption.start)) return [caption];
    const result: CaptionItem[] = [];
    for (let first = 0; first < words.length; first += 6) {
      const last = Math.min(words.length, first + 6);
      result.push({
        ...caption, id: first === 0 ? caption.id : nextId++,
        start: first === 0 ? caption.start : caption.start + (caption.end - caption.start) * first / words.length,
        end: last === words.length ? caption.end : caption.start + (caption.end - caption.start) * last / words.length,
        text: words.slice(first, last).join(' '),
      });
    }
    return result;
  });
}
