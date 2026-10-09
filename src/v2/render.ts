import { captionPages, pageAtWord } from '../services/captionLayout';
import {
  Asset,
  Caption,
  CaptionStyle,
  Composition,
  Layer,
  MediaPool,
} from "./types";

type CanvasMedia = HTMLImageElement | HTMLVideoElement;

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const activeAt = (layer: Layer, time: number) =>
  time >= layer.start && time < layer.end;

function layerAlpha(layer: Layer, time: number): number {
  const fade = Math.max(0, layer.fade || 0);
  if (!fade) return clamp(layer.opacity);
  const inAlpha = clamp((time - layer.start) / fade);
  const outAlpha = clamp((layer.end - time) / fade);
  return clamp(layer.opacity) * Math.min(inAlpha, outAlpha);
}

function drawMedia(
  ctx: CanvasRenderingContext2D,
  media: CanvasMedia,
  layer: Layer,
  width: number,
  height: number,
  alpha: number,
): void {
  const destX = layer.x * width,
    destY = layer.y * height;
  const destW = Math.max(1, layer.width * width),
    destH = Math.max(1, layer.height * height);
  const sourceW =
    media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const sourceH =
    media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!sourceW || !sourceH) return;
  const sourceAspect = sourceW / sourceH,
    destAspect = destW / destH;

  const userScale = Math.max(0.1, Math.min(4, layer.scale || 1));

  if (layer.background && layer.background !== "transparent" && layer.fit !== "blur") {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = layer.background;
    ctx.fillRect(destX, destY, destW, destH);
    ctx.restore();
  }

  // If blur mode: draw blurred background first to eliminate black bars
  if (layer.fit === "blur") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(destX, destY, destW, destH);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.filter = "blur(24px) brightness(0.5)";
    let bgSw = sourceW, bgSh = sourceH, bgSx = 0, bgSy = 0;
    if (sourceAspect > destAspect) {
      bgSw = sourceH * destAspect;
      bgSx = (sourceW - bgSw) * clamp(layer.focalX);
    } else {
      bgSh = sourceW / destAspect;
      bgSy = (sourceH - bgSh) * clamp(layer.focalY);
    }
    ctx.drawImage(media, bgSx, bgSy, bgSw, bgSh, destX - 15, destY - 15, destW + 30, destH + 30);
    ctx.filter = "none";
    ctx.restore();
  }

  if (layer.fit === "stretch") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(destX, destY, destW, destH);
    ctx.clip();
    ctx.globalAlpha = alpha;
    const finalW = destW * userScale;
    const finalH = destH * userScale;
    const offsetX = destX + (destW - finalW) / 2;
    const offsetY = destY + (destH - finalH) / 2;
    ctx.drawImage(media, 0, 0, sourceW, sourceH, offsetX, offsetY, finalW, finalH);
    ctx.restore();
    return;
  }

  if (layer.fit === "contain" || layer.fit === "blur") {
    const baseScale = Math.min(destW / sourceW, destH / sourceH);
    const containW = sourceW * baseScale * userScale;
    const containH = sourceH * baseScale * userScale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(destX, destY, destW, destH);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      media,
      0,
      0,
      sourceW,
      sourceH,
      destX + (destW - containW) / 2,
      destY + (destH - containH) / 2,
      containW,
      containH,
    );
    ctx.restore();
    return;
  }

  // Cover mode
  let sx = 0,
    sy = 0,
    sw = sourceW,
    sh = sourceH;
  if (sourceAspect > destAspect) {
    sw = Math.min(sourceW, (sourceH * destAspect) / userScale);
    sx = clamp((sourceW - sw) * clamp(layer.focalX), 0, Math.max(0, sourceW - sw));
  } else {
    sh = Math.min(sourceH, (sourceW / destAspect) / userScale);
    sy = clamp((sourceH - sh) * clamp(layer.focalY), 0, Math.max(0, sourceH - sh));
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(destX, destY, destW, destH);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.drawImage(media, sx, sy, sw, sh, destX, destY, destW, destH);
  ctx.restore();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  width: number,
  height: number,
  alpha: number,
): void {
  if (!layer.text?.trim()) return;
  const x = layer.x * width,
    y = layer.y * height,
    w = Math.max(1, layer.width * width),
    h = Math.max(1, layer.height * height);
  let fontSize = Math.max(12, layer.fontSize * height);
  let padding = fontSize * 0.45,
    lineHeight = fontSize * 1.22;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.direction = "rtl";
  ctx.font = `800 ${fontSize}px Assistant, Heebo, Rubik, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = layer.align === "right" ? "right" : "center";
  let lines = wrap(ctx, layer.text, Math.max(1, w - padding * 2));
  while (
    fontSize > 12 &&
    (lines.length * lineHeight + padding * 2 > h ||
      lines.some((line) => ctx.measureText(line).width > w - padding * 2))
  ) {
    fontSize -= 1;
    padding = fontSize * 0.45;
    lineHeight = fontSize * 1.22;
    ctx.font = `800 ${fontSize}px Assistant, Heebo, Rubik, Arial, sans-serif`;
    lines = wrap(ctx, layer.text, Math.max(1, w - padding * 2));
  }
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const blockH = Math.min(h, lines.length * lineHeight + padding * 2);
  if (layer.background && layer.background !== "transparent") {
    ctx.fillStyle = layer.background;
    ctx.fillRect(x, y + (h - blockH) / 2, w, blockH);
  }
  ctx.fillStyle = layer.color || "#fff";
  const textX = layer.align === "right" ? x + w - padding : x + w / 2;
  const firstY = y + (h - (lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) =>
    ctx.fillText(line, textX, firstY + index * lineHeight),
  );
  ctx.restore();
}

const defaultCaptionStyle: CaptionStyle = {
  preset: "classic",
  position: 0.77,
  size: 1,
  color: "#ffffff",
  accent: "#facc15",
  background: "rgba(2,6,23,.76)",
};

function captionLayer(caption: Caption, style: CaptionStyle): Layer {
  const highlight = style.preset === "highlight";
  const clean = style.preset === "clean";
  return {
    id: `caption-${caption.id}`,
    name: "Caption",
    kind: "text",
    text: caption.text,
    start: caption.start,
    end: caption.end,
    sourceIn: 0,
    x: 0.07,
    y: clamp(style.position, 0.08, 0.86),
    width: 0.86,
    height: 0.16,
    fit: "contain",
    focalX: 0.5,
    focalY: 0.5,
    opacity: 1,
    fontSize: 0.031 * clamp(style.size, 0.65, 1.8),
    color: highlight ? "#07121a" : style.color,
    background: clean ? "transparent" : highlight ? style.accent : style.background,
    align: "center",
    fade: 0.08,
  };
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  caption: Caption,
  style: CaptionStyle,
  progress: number,
  width: number,
  height: number,
): void {
  const layer = captionLayer(caption, style);
  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const x = layer.x * width;
  const y = layer.y * height;
  const w = layer.width * width;
  const h = layer.height * height;
  const fontSize = Math.max(16, layer.fontSize * height);
  const padding = fontSize * 0.55;
  const lineHeight = fontSize * 1.25;
  const maxTextWidth = w - padding * 2;
  const activeWord = Math.min(
    words.length - 1,
    Math.max(0, Math.floor(clamp(progress) * words.length)),
  );

  ctx.save();
  ctx.direction = "rtl";
  ctx.font = `900 ${fontSize}px Assistant, Heebo, Rubik, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  const page = pageAtWord(captionPages(caption.text, value => ctx.measureText(value).width, maxTextWidth), activeWord);
  if (!page) { ctx.restore(); return; }
  const lines = page.lines;
  const blockH = lines.length * lineHeight + padding * 1.35;
  const blockY = clamp(y + (h - blockH) / 2, 0, Math.max(0, height - blockH));
  ctx.fillStyle = layer.background;
  ctx.fillRect(x, blockY, w, blockH);
  ctx.shadowColor = "rgba(0,0,0,.85)";
  ctx.shadowBlur = style.preset === "highlight" ? 0 : 10;
  const firstY = blockY + padding * .675 + lineHeight / 2;
  let first = page.first;
  lines.forEach((line, lineIndex) => {
    const text = line.join(" ");
    const textWidth = Math.min(maxTextWidth, ctx.measureText(text).width);
    const rightEdge = x + w / 2 + textWidth / 2;
    const baseline = firstY + lineIndex * lineHeight;
    ctx.fillStyle = layer.color;
    ctx.fillText(text, rightEdge, baseline, maxTextWidth);
    if (style.preset === "karaoke" && activeWord >= first && activeWord < first + line.length) {
      const localIndex = activeWord - first;
      const prefix = line.slice(0, localIndex).join(" ");
      const offset = prefix ? ctx.measureText(`${prefix} `).width : 0;
      ctx.fillStyle = style.accent;
      ctx.fillText(line[localIndex], rightEdge - offset, baseline, maxTextWidth);
    }
    first += line.length;
  });
  ctx.restore();
}

export function renderComposition(
  ctx: CanvasRenderingContext2D,
  composition: Composition,
  pool: MediaPool,
  time: number,
): void {
  const { width, height } = composition;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  if (composition.baseAssetId) {
    const asset = pool.assets.get(composition.baseAssetId);
    const media =
      asset?.kind === "video"
        ? pool.videos.get(asset.id)
        : pool.images.get(asset?.id || "");
    if (asset && media)
      drawMedia(
        ctx,
        media,
        {
          id: "base",
          name: "Base",
          kind: asset.kind,
          assetId: asset.id,
          start: 0,
          end: composition.duration,
          sourceIn: 0,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          fit: "cover",
          focalX: 0.5,
          focalY: 0.5,
          opacity: 1,
          fontSize: 0.03,
          color: "#fff",
          background: "transparent",
          align: "center",
          fade: 0,
        },
        width,
        height,
        1,
      );
  }
  for (const layer of composition.layers) {
    if (!activeAt(layer, time)) continue;
    const alpha = layerAlpha(layer, time);
    if (!alpha) continue;
    if (layer.kind === "text") drawText(ctx, layer, width, height, alpha);
    else if (layer.assetId) {
      const asset = pool.assets.get(layer.assetId);
      const media =
        asset?.kind === "video"
          ? pool.videos.get(asset.id)
          : pool.images.get(asset?.id || "");
      if (media) drawMedia(ctx, media, layer, width, height, alpha);
    }
  }
  const captionStyle = { ...defaultCaptionStyle, ...composition.captionStyle };
  const captionTime = time - (composition.captionOffset || 0);
  for (const caption of composition.captions) {
    if (captionTime < caption.start || captionTime >= caption.end) continue;
    drawCaption(
      ctx, caption, captionStyle,
      (captionTime - caption.start) / Math.max(0.001, caption.end - caption.start),
      width, height,
    );
  }
}
