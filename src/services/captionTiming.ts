import type { CaptionItem } from '../types/studio';

const ms = (seconds: number) => Math.round(seconds * 1000);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Move a group by one bounded delta. Never squeeze captions against a media boundary. */
export function updateCaptionTiming(
  captions: CaptionItem[], id: number, field: 'start' | 'end', seconds: number,
  options: { ripple: boolean; duration: number; offset?: number; bidirectionalRipple?: boolean },
): CaptionItem[] {
  if (!Number.isFinite(seconds) || !captions.length) return captions;
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  const index = sorted.findIndex(item => item.id === id);
  if (index < 0) return captions;
  const target = sorted[index], start = ms(target.start), end = ms(target.end);
  const floor = -ms(options.offset || 0);
  const ceiling = Number.isFinite(options.duration) && options.duration > 0
    ? ms(options.duration) + floor : Number.MAX_SAFE_INTEGER;
  const bidirectional = options.ripple && field === 'start' && options.bidirectionalRipple === true;
  const first = bidirectional ? 0 : index;
  const last = options.ripple ? sorted.length - 1 : index;
  const lastEnd = Math.max(...sorted.slice(first, last + 1).map(item => ms(item.end)));
  const nextStart = sorted[last + 1] ? ms(sorted[last + 1].start) : ceiling;
  const original = field === 'start' ? start : end;
  const minDelta = field === 'start'
    ? Math.max(floor, first > 0 ? ms(sorted[first - 1].end) : floor) - ms(sorted[first].start)
    : Math.min(80, Math.max(1, end - start)) - (end - start);
  const maxDelta = Math.min(ceiling, nextStart) - lastEnd;
  if (maxDelta < minDelta) return captions;
  const delta = clamp(ms(seconds) - original, minDelta, maxDelta);
  if (!delta) return captions;
  return sorted.map((item, position) => {
    if (position < first || position > last) return item;
    return { ...item,
      start: field === 'end' && position === index ? item.start : (ms(item.start) + delta) / 1000,
      end: (ms(item.end) + delta) / 1000,
    };
  });
}

export function shiftAllCaptionsList(captions: CaptionItem[], deltaSeconds: number, duration?: number, offset = 0): CaptionItem[] {
  if (!captions.length || !Number.isFinite(deltaSeconds)) return captions;
  const first = [...captions].sort((a, b) => a.start - b.start)[0];
  return updateCaptionTiming(captions, first.id, 'start', first.start + deltaSeconds,
    { ripple: true, bidirectionalRipple: true, duration: duration || Infinity, offset });
}

export const captionIsActive = (item: CaptionItem, time: number, offset = 0) =>
  time >= item.start + offset && time < item.end + offset;
