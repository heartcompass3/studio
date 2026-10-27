import type { CaptionItem } from '../types/studio';

/** Validate acoustic timestamps without imposing a reading speed or moving later cues. */
export function sanitizeAndSequenceCaptions(rawItems: unknown[], durationSeconds?: number): CaptionItem[] {
  if (!Array.isArray(rawItems) || !rawItems.length) return [];
  const valid = rawItems.filter((item): item is CaptionItem => !!item && typeof item === 'object')
    .map((item, index) => ({ ...item, id: Number.isFinite(item.id) ? item.id : index,
      start: Number(item.start), end: Number(item.end), text: String(item.text || '').trim() }))
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.text);
  if (!valid.length) return [];
  const limit = Number.isFinite(durationSeconds) && durationSeconds! > 0 ? durationSeconds! : Infinity;
  // One bad outlier must never rescale an otherwise valid track to milliseconds.
  const huge = valid.filter(item => item.end > limit * 8).length;
  const scale = Number.isFinite(limit) && huge / valid.length >= .8 ? .001 : 1;
  const result = valid.map(item => ({ ...item,
    start: Math.round(Math.max(0, item.start * scale) * 1000) / 1000,
    end: Math.round(Math.min(limit, item.end * scale) * 1000) / 1000,
  })).sort((a, b) => a.start - b.start);
  const ids = new Set<number>();
  let nextId = Math.max(-1, ...result.map(item => item.id)) + 1;
  result.forEach((item, index) => {
    if (ids.has(item.id)) item.id = nextId++;
    ids.add(item.id);
    if (item.end <= item.start || item.start >= limit)
      throw new Error('התמלול החזיר זמן שאינו מתאים להקלטה. נסה לתמלל שוב; הכתוביות הקיימות נשמרו.');
    const previous = result[index - 1];
    if (previous && previous.end > item.start) {
      if (previous.end - item.start > .12 || previous.start >= item.start)
        throw new Error('התמלול החזיר כתוביות חופפות. נסה לתמלל שוב; הזמנים לא נדחסו והכתוביות הקיימות נשמרו.');
      previous.end = item.start;
    }
  });
  return result;
}
