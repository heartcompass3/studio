/** Centered cover crops or contain fits, without ever stretching source pixels. */
export function fitMediaFrame(
  sw: number,
  sh: number,
  width: number,
  height: number,
  mode: "cover" | "contain",
) {
  if (mode === "cover") {
    const scale = Math.max(width / sw, height / sh);
    const sourceWidth = width / scale,
      sourceHeight = height / scale;
    return {
      sx: (sw - sourceWidth) / 2,
      sy: (sh - sourceHeight) / 2,
      sw: sourceWidth,
      sh: sourceHeight,
      dx: 0,
      dy: 0,
      width,
      height,
    };
  }
  const scale = Math.min(width / sw, height / sh);
  const w = sw * scale,
    h = sh * scale;
  return {
    sx: 0,
    sy: 0,
    sw,
    sh,
    dx: (width - w) / 2,
    dy: (height - h) / 2,
    width: w,
    height: h,
  };
}
