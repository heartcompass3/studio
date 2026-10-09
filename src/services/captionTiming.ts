import type { CaptionItem } from '../types/studio';

const ms = (seconds: number) => Math.round(seconds * 1000);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Shift a whole tail by one delta, retaining its durations and pauses. */
export function updateCaptionTiming(
  captions: CaptionItem[], id: number, field: 'start' | 'end', seconds: number,
  options: { ripple: boolean; duration: number; offset?: number },
): CaptionItem[] {
  if (!Number.isFinite(seconds)) return captions;
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  const index = sorted.findIndex(item => item.id === id);
  if (index < 0) return captions;
  const target = sorted[index];
  const offset = ms(options.offset || 0);
  const floor = -offset;
  const ceiling = Number.isFinite(options.duration) && options.duration > 0
    ? ms(options.duration) - offset : Number.MAX_SAFE_INTEGER;
  const start = ms(target.start), end = ms(target.end);
  const lastEnd = Math.max(end, ...sorted.slice(index + 1).map(item => ms(item.end)));
  const nextStart = sorted[index + 1] ? ms(sorted[index + 1].start) : ceiling;
  const min = field === 'start'
    ? Math.max(floor, index > 0 ? ms(sorted[index - 1].end) : floor)
    : start + 80;
  const max = field === 'start'
    ? Math.min(ceiling - (options.ripple ? lastEnd - start : end - start),
        options.ripple ? ceiling : nextStart - (end - start))
    : Math.min(ceiling - (options.ripple ? lastEnd - end : 0),
        options.ripple ? ceiling : nextStart);
  // An invalid pre-existing tail cannot fit. Do not destroy text or shrink pauses to force it.
  if (max < min) return captions;
  const original = field === 'start' ? start : end;
  const delta = clamp(ms(seconds), min, max) - original;
  if (!delta) return captions;
  return sorted.map((item, position) => {
    if (position < index || (position > index && !options.ripple)) return item;
    return {
      ...item,
      start: position === index && field === 'end' ? item.start : (ms(item.start) + delta) / 1000,
      end: (ms(item.end) + delta) / 1000,
    };
  });
}

export const captionIsActive = (item: CaptionItem, time: number, offset = 0) =>
  time >= item.start + offset && time < item.end + offset;
