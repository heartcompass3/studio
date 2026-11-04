import React, { useLayoutEffect, useRef } from "react";
import type {
  CaptionItem,
  SubtitleStyle,
  TextCalloutItem,
} from "../../types/studio";
import {
  drawStudioSubtitle,
  drawTextCallout,
  drawHeadlineOverlay,
} from "../../services/mp4ExportService";
import type { TextRenderSettings } from "../../services/textOverlay";

/** Preview uses the export painter so placement, font size and wrapping match the file. */
function OverlayCanvas({
  label,
  draw,
}: {
  label: string;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current,
      stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    let disposed = false;
    const paint = () => {
      if (disposed) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(stage.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(stage.clientHeight * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw(ctx, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(paint);
    observer.observe(stage);
    void document.fonts.ready.then(paint);
    paint();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [draw]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
    />
  );
}
export function CaptionPreview({
  caption,
  time,
  style,
  karaoke,
  positionY = 74,
  positionX = 50,
  fontScale = 1,
}: {
  caption: CaptionItem;
  time: number;
  style: SubtitleStyle;
  karaoke: boolean;
  positionY?: number;
  positionX?: number;
  fontScale?: number;
}) {
  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  const word = Math.max(
    0,
    Math.min(
      words.length - 1,
      Math.floor(
        ((time - caption.start) /
          Math.max(0.001, caption.end - caption.start)) *
          words.length,
      ),
    ),
  );
  return (
    <OverlayCanvas
      label={caption.text}
      draw={(ctx, width, height) =>
        drawStudioSubtitle(
          ctx,
          caption.text,
          width,
          height,
          style,
          word,
          karaoke,
          positionY,
          positionX,
          fontScale,
        )
      }
    />
  );
}
export function CalloutPreview({
  callouts,
  time,
}: {
  callouts: TextCalloutItem[];
  time: number;
}) {
  const active = callouts.filter(
    (item) => time >= item.startTime && time < item.endTime,
  );
  return (
    <OverlayCanvas
      label={active.map((item) => item.text).join(" · ")}
      draw={(ctx, w, h) =>
        active.forEach((item) => drawTextCallout(ctx, item, w, h))
      }
    />
  );
}
export function HeadlinePreview({
  text,
  settings,
}: {
  text: string;
  settings: TextRenderSettings;
}) {
  return (
    <OverlayCanvas
      label={text}
      draw={(ctx, w, h) => drawHeadlineOverlay(ctx, text, w, h, settings)}
    />
  );
}
