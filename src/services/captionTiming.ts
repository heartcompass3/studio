import type { CaptionItem } from '../types/studio';

/**
 * Updates caption timing with rock-solid bidirectional ripple synchronization.
 *
 * When ripple is true (default):
 * - Adjusting 'start' anchors the target caption to `seconds` and shifts ALL captions
 *   (both preceding and succeeding, "קדימה ואחורה") by the exact same delta.
 * - This maintains relative pauses and positions across the entire subtitle track.
 * - Boundary handling ensures preceding captions don't fall below 0s and succeeding captions
 *   don't exceed duration, without ever dropping or ignoring the user's action.
 * - Adjusting 'end' adjusts the current caption's duration and cascades subsequent captions forward.
 *
 * When ripple is false:
 * - Only the target caption is updated, smoothly nudging immediate neighbors if needed to prevent overlap.
 */
export function updateCaptionTiming(
  captions: CaptionItem[],
  id: number,
  field: 'start' | 'end',
  seconds: number,
  options: {
    ripple: boolean;
    duration: number;
    offset?: number;
    bidirectionalRipple?: boolean;
  },
): CaptionItem[] {
  if (!Number.isFinite(seconds) || captions.length === 0) return captions;

  const sorted = [...captions].sort((a, b) => a.start - b.start);
  const index = sorted.findIndex(item => item.id === id);
  if (index < 0) return captions;

  const target = sorted[index];
  const offset = options.offset || 0;
  const floor = -offset;
  const ceiling = Number.isFinite(options.duration) && options.duration > 0
    ? options.duration - offset
    : Number.POSITIVE_INFINITY;

  const origStart = target.start;
  const origEnd = target.end;
  const origDur = Math.max(0.1, origEnd - origStart);

  if (field === 'start') {
    const targetStart = Math.max(floor, seconds);
    const delta = targetStart - origStart;
    if (Math.abs(delta) < 0.001) return captions;

    const ripple = options.ripple;
    const bidirectional = options.bidirectionalRipple !== false;

    if (ripple && bidirectional) {
      // Shift ALL captions forward and backward by delta
      let shifted = sorted.map((item, pos) => {
        if (pos === index) {
          return {
            ...item,
            start: targetStart,
            end: targetStart + origDur,
          };
        }
        return {
          ...item,
          start: item.start + delta,
          end: item.end + delta,
        };
      });

      // If delta < 0 pushed any preceding items below floor (0s):
      if (index > 0 && shifted[0].start < floor) {
        const availableSpace = Math.max(0.2, targetStart - floor);
        let currentPos = floor;
        const precedingCount = index;
        const totalOrigDur = sorted.slice(0, precedingCount).reduce((acc, c) => acc + (c.end - c.start), 0);

        for (let p = 0; p < precedingCount; p++) {
          const item = sorted[p];
          const itemDur = Math.max(0.1, item.end - item.start);
          let assignedDur = itemDur;
          if (totalOrigDur > availableSpace - precedingCount * 0.02) {
            assignedDur = Math.max(0.15, (itemDur / totalOrigDur) * (availableSpace - precedingCount * 0.02));
          }
          shifted[p] = {
            ...item,
            start: currentPos,
            end: currentPos + assignedDur,
          };
          currentPos = currentPos + assignedDur + 0.02;
        }
      }

      // If ceiling is finite, clamp any items that exceed it
      if (Number.isFinite(ceiling)) {
        for (let p = 0; p < shifted.length; p++) {
          if (shifted[p].end > ceiling) {
            shifted[p].end = ceiling;
            if (shifted[p].start >= ceiling - 0.1) {
              shifted[p].start = Math.max(floor, ceiling - 0.2);
            }
          }
        }
      }

      return shifted.map(c => ({
        ...c,
        start: Number(c.start.toFixed(3)),
        end: Number(c.end.toFixed(3)),
      }));
    } else if (ripple && !bidirectional) {
      // Forward ripple only
      let shifted = sorted.map((item, pos) => {
        if (pos < index) return item;
        if (pos === index) {
          return { ...item, start: targetStart, end: targetStart + origDur };
        }
        return {
          ...item,
          start: item.start + delta,
          end: item.end + delta,
        };
      });

      if (index > 0 && shifted[index].start < shifted[index - 1].end) {
        shifted[index - 1].end = Math.max(shifted[index - 1].start + 0.1, shifted[index].start - 0.03);
      }

      return shifted.map(c => ({
        ...c,
        start: Number(c.start.toFixed(3)),
        end: Number(c.end.toFixed(3)),
      }));
    } else {
      // Ripple OFF: update only target
      const result = [...sorted];
      result[index] = {
        ...target,
        start: targetStart,
        end: targetStart + origDur,
      };

      if (index > 0 && result[index].start < result[index - 1].end) {
        result[index - 1] = {
          ...result[index - 1],
          end: Math.max(result[index - 1].start + 0.1, result[index].start - 0.03),
        };
      }
      if (index < result.length - 1 && result[index].end > result[index + 1].start) {
        result[index + 1] = {
          ...result[index + 1],
          start: Math.max(result[index].end + 0.03, result[index + 1].start),
          end: Math.max(result[index + 1].end, result[index].end + 0.2),
        };
      }

      return result.map(c => ({
        ...c,
        start: Number(c.start.toFixed(3)),
        end: Number(c.end.toFixed(3)),
      }));
    }
  }

  // field === 'end'
  const targetEnd = Math.max(origStart + 0.1, seconds);
  const delta = targetEnd - origEnd;
  if (Math.abs(delta) < 0.001) return captions;

  if (options.ripple) {
    let shifted = sorted.map((item, pos) => {
      if (pos < index) return item;
      if (pos === index) {
        return { ...item, end: targetEnd };
      }
      return {
        ...item,
        start: item.start + delta,
        end: item.end + delta,
      };
    });

    if (Number.isFinite(ceiling)) {
      for (let p = index; p < shifted.length; p++) {
        if (shifted[p].end > ceiling) {
          shifted[p].end = ceiling;
          if (shifted[p].start >= ceiling - 0.1) {
            shifted[p].start = Math.max(floor, ceiling - 0.2);
          }
        }
      }
    }

    return shifted.map(c => ({
      ...c,
      start: Number(c.start.toFixed(3)),
      end: Number(c.end.toFixed(3)),
    }));
  } else {
    const result = [...sorted];
    result[index] = { ...target, end: targetEnd };
    if (index < result.length - 1 && targetEnd > result[index + 1].start) {
      result[index + 1] = {
        ...result[index + 1],
        start: targetEnd + 0.03,
        end: Math.max(result[index + 1].end, targetEnd + 0.2),
      };
    }
    return result.map(c => ({
      ...c,
      start: Number(c.start.toFixed(3)),
      end: Number(c.end.toFixed(3)),
    }));
  }
}

/** Shift all captions forward or backward by deltaSeconds safely. */
export function shiftAllCaptionsList(
  captions: CaptionItem[],
  deltaSeconds: number,
  duration?: number,
  offset = 0
): CaptionItem[] {
  if (!Number.isFinite(deltaSeconds) || Math.abs(deltaSeconds) < 0.0001 || captions.length === 0) {
    return captions;
  }
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  const floor = -offset;
  const ceiling = Number.isFinite(duration) && duration! > 0 ? duration! - offset : Number.POSITIVE_INFINITY;

  const firstStart = sorted[0].start;
  let effectiveDelta = deltaSeconds;
  if (firstStart + effectiveDelta < floor) {
    effectiveDelta = floor - firstStart;
  }
  if (Math.abs(effectiveDelta) < 0.0001) return captions;

  return sorted.map(item => {
    let start = item.start + effectiveDelta;
    let end = item.end + effectiveDelta;
    if (start < floor) start = floor;
    if (end <= start) end = start + 0.15;
    if (Number.isFinite(ceiling) && end > ceiling) {
      end = ceiling;
      if (start >= end) start = Math.max(floor, end - 0.15);
    }
    return {
      ...item,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    };
  });
}

export const captionIsActive = (item: CaptionItem, time: number, offset = 0) =>
  time >= item.start + offset && time < item.end + offset;
