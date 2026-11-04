export interface TextRenderSettings {
  captionPositionX?: number;
  captionFontScale?: number;
  headlinePositionX?: number;
  headlinePositionY?: number;
  headlineFontScale?: number;
}
export const overlayNumber = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) => Math.max(min, Math.min(max, Number.isFinite(value) ? value! : fallback));
export function textFontSize(
  width: number,
  height: number,
  scale = 1,
  kind: "caption" | "callout" | "headline" = "caption",
) {
  const vertical = height > width;
  const ratio =
    kind === "caption" ? (vertical ? 0.038 : 0.048) : vertical ? 0.034 : 0.044;
  return Math.max(1, height * ratio * overlayNumber(scale, 1, 0.5, 2));
}
/** Clamp the actual text box, rather than just its anchor, inside the video. */
export function safeTextCenter(
  width: number,
  height: number,
  blockWidth: number,
  blockHeight: number,
  x = 50,
  y = 74,
) {
  const pad = Math.min(width, height) * 0.015;
  const halfW = Math.min(width / 2, blockWidth / 2 + pad);
  const halfH = Math.min(height / 2, blockHeight / 2 + pad);
  return {
    x: Math.max(
      halfW,
      Math.min(width - halfW, (width * overlayNumber(x, 50, 0, 100)) / 100),
    ),
    y: Math.max(
      halfH,
      Math.min(height - halfH, (height * overlayNumber(y, 74, 0, 100)) / 100),
    ),
  };
}
