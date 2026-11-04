import React from "react";
export function OverlayControls({
  label,
  x,
  y,
  scale,
  onX,
  onY,
  onScale,
  defaultY = 74,
}: {
  label: string;
  x: number;
  y: number;
  scale: number;
  onX: (value: number) => void;
  onY: (value: number) => void;
  onScale: (value: number) => void;
  defaultY?: number;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 min-w-0">
      <legend className="px-1 text-xs font-bold text-teal-200">
        {label} — מיקום וגודל
      </legend>
      {[
        {
          title: "מיקום אופקי",
          value: x,
          min: 0,
          max: 100,
          change: onX,
          suffix: "%",
        },
        {
          title: "מיקום אנכי",
          value: y,
          min: 0,
          max: 100,
          change: onY,
          suffix: "%",
        },
        {
          title: "גודל טקסט",
          value: Math.round(scale * 100),
          min: 50,
          max: 200,
          change: (v: number) => onScale(v / 100),
          suffix: "%",
        },
      ].map((control) => (
        <label key={control.title} className="block text-xs text-slate-300">
          <span className="flex justify-between gap-2 mb-1">
            <span>{control.title}</span>
            <output dir="ltr">
              {control.value}
              {control.suffix}
            </output>
          </span>
          <input
            aria-label={`${label} — ${control.title}`}
            className="w-full accent-teal-300"
            type="range"
            min={control.min}
            max={control.max}
            step="1"
            value={control.value}
            onChange={(e) => control.change(Number(e.target.value))}
          />
        </label>
      ))}
      <button
        type="button"
        onClick={() => {
          onX(50);
          onY(defaultY);
          onScale(1);
        }}
        className="px-3 py-1 rounded-lg bg-slate-700 text-xs"
      >
        איפוס מיקום וגודל
      </button>
    </fieldset>
  );
}
