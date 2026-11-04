import React, { useLayoutEffect, useRef, useState } from "react";
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
import type {
  TextRenderSettings,
  OverlayBounds,
} from "../../services/textOverlay";
import { DraggableOverlay } from "./DraggableOverlay";

interface Interaction {
  selected?: boolean;
  onStart?: () => void;
  onMove?: (x: number, y: number) => void;
}
/** Export painters return the same measured box used for the drag hit target. */
function OverlayCanvas({
  id,
  label,
  draw,
  selected,
  onStart,
  onMove,
}: Interaction & {
  id: string;
  label: string;
  draw: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => OverlayBounds | undefined;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState<OverlayBounds | null>(null);
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
      const measured = draw(ctx, canvas.width, canvas.height);
      const next = measured
        ? {
            x: measured.x / ratio,
            y: measured.y / ratio,
            width: measured.width / ratio,
            height: measured.height / ratio,
          }
        : null;
      setBounds((previous) =>
        previous?.x === next?.x &&
        previous?.y === next?.y &&
        previous?.width === next?.width &&
        previous?.height === next?.height
          ? previous
          : next,
      );
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
    <>
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
      />
      {bounds && onMove && (
        <DraggableOverlay
          id={id}
          label={label}
          bounds={bounds}
          selected={selected}
          onStart={() => onStart?.()}
          onMove={onMove}
        />
      )}
    </>
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
  ...interaction
}: Interaction & {
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
      id="caption"
      label={`כתובית: ${caption.text}`}
      {...interaction}
      draw={(ctx, w, h) =>
        drawStudioSubtitle(
          ctx,
          caption.text,
          w,
          h,
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
  selectedId,
  onStart,
  onMove,
}: {
  callouts: TextCalloutItem[];
  time: number;
  selectedId?: string | null;
  onStart?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}) {
  return (
    <>
      {callouts
        .filter((item) => time >= item.startTime && time < item.endTime)
        .map((item) => (
          <OverlayCanvas
            key={item.id}
            id={`callout:${item.id}`}
            label={`מדבקה: ${item.text}`}
            selected={selectedId === `callout:${item.id}`}
            onStart={() => onStart?.(item.id)}
            onMove={onMove ? (x, y) => onMove(item.id, x, y) : undefined}
            draw={(ctx, w, h) => drawTextCallout(ctx, item, w, h)}
          />
        ))}
    </>
  );
}
export function HeadlinePreview({
  text,
  settings,
  ...interaction
}: Interaction & { text: string; settings: TextRenderSettings }) {
  return (
    <OverlayCanvas
      id="headline"
      label={`כותרת: ${text}`}
      {...interaction}
      draw={(ctx, w, h) => drawHeadlineOverlay(ctx, text, w, h, settings)}
    />
  );
}
