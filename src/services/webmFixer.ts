import ysFixWebmDuration from 'fix-webm-duration';

/**
 * Robust WebM Duration Fixer using the battle-tested fix-webm-duration engine.
 * Parses EBML tree, injects precise Segment/Info duration, and returns a fully seekable WebM blob.
 */
export const fixWebmDuration = (blob: Blob, durationMs: number): Promise<Blob> => {
  return new Promise((resolve) => {
    try {
      ysFixWebmDuration(blob, Math.max(500, Math.round(durationMs)), (fixedBlob: Blob) => {
        resolve(fixedBlob || blob);
      });
    } catch (err) {
      console.warn('fixWebmDuration fallback to raw blob:', err);
      resolve(blob);
    }
  });
};
