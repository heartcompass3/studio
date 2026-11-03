import React, { useLayoutEffect, useRef, useState } from "react";
import "./camera-stage.css";
export function fitStage(width: number, height: number, ratio: number) {
  const w = Math.max(0, Math.min(width, height * ratio));
  return { width: w, height: w / ratio };
}
export function CameraStage({
  id,
  ratio,
  children,
  onClick,
  className = "",
}: {
  id: string;
  ratio: number;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      const css = getComputedStyle(element);
      const width =
        element.clientWidth -
        (parseFloat(css.paddingLeft) || 0) -
        (parseFloat(css.paddingRight) || 0);
      const height =
        element.clientHeight -
        (parseFloat(css.paddingTop) || 0) -
        (parseFloat(css.paddingBottom) || 0);
      setSize(fitStage(width, height, ratio));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ratio]);
  return (
    <div ref={container} className="camera-workspace">
      <div
        id={id}
        className={`camera-stage ${className}`}
        style={{ width: size.width, height: size.height }}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  );
}
