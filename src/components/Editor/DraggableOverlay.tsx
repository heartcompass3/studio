import React, { useEffect, useRef, useState } from "react";
import {
  dragTextPosition,
  type OverlayBounds,
} from "../../services/textOverlay";

export function DraggableOverlay({
  id,
  label,
  bounds,
  selected,
  onStart,
  onMove,
}: {
  id: string;
  label: string;
  bounds: OverlayBounds;
  selected?: boolean;
  onStart: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointer: number;
    startX: number;
    startY: number;
    bounds: OverlayBounds;
    width: number;
    height: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (selected) ref.current?.focus({ preventScroll: true });
  }, [selected]);
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== e.pointerId) return;
    e.stopPropagation();
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const hitWidth = Math.max(44, bounds.width),
    hitHeight = Math.max(44, bounds.height);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`גרור ${label}`}
      title="גרור למיקום הרצוי. אפשר גם להשתמש בחיצי המקלדת."
      data-overlay-id={id}
      className={`overlay-drag-handle ${selected || dragging ? "is-selected" : ""}`}
      style={{
        left: bounds.x + (bounds.width - hitWidth) / 2,
        top: bounds.y + (bounds.height - hitHeight) / 2,
        width: hitWidth,
        height: hitHeight,
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (e.isPrimary === false || e.button !== 0) return;
        const stage = e.currentTarget.parentElement?.getBoundingClientRect();
        if (!stage?.width || !stage.height) return;
        e.preventDefault();
        e.stopPropagation();
        drag.current = {
          pointer: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          bounds,
          width: stage.width,
          height: stage.height,
        };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
        onStart();
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start || start.pointer !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const position = dragTextPosition(
          start.bounds,
          start.width,
          start.height,
          e.clientX - start.startX,
          e.clientY - start.startY,
        );
        onMove(position.x, position.y);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onStart();
          return;
        }
        const direction = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[e.key];
        const stage = ref.current?.parentElement?.getBoundingClientRect();
        if (!direction || !stage?.width || !stage.height) return;
        e.preventDefault();
        e.stopPropagation();
        onStart();
        const step = e.shiftKey ? 0.05 : 0.01;
        const position = dragTextPosition(
          bounds,
          stage.width,
          stage.height,
          direction[0] * stage.width * step,
          direction[1] * stage.height * step,
        );
        onMove(position.x, position.y);
      }}
    />
  );
}
