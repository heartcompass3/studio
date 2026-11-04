import React from "react";
export function OverlayControls({
  label,
  scale,
  onX,
  onY,
  onScale,
  onPlace,
  defaultY = 74,
}: {
  label: string;
  scale: number;
  onX: (value: number) => void;
  onY: (value: number) => void;
  onScale: (value: number) => void;
  onPlace?: () => void;
  defaultY?: number;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 min-w-0">
      <legend className="px-1 text-xs font-bold text-teal-200">
        {label} — מיקום וגודל
      </legend>
      {onPlace ? (
        <button
          type="button"
          onClick={onPlace}
          className="w-full rounded-xl bg-teal-700 px-3 py-2 font-bold text-white"
        >
          מקם בגרירה על הסרטון
        </button>
      ) : (
        <p className="text-xs text-slate-400">
          לאחר הוספת הטקסט אפשר לגרור אותו ישירות על הסרטון.
        </p>
      )}
      <label className="block text-xs text-slate-300">
        <span className="flex justify-between gap-2 mb-1">
          <span>גודל טקסט</span>
          <output dir="ltr">{Math.round(scale * 100)}%</output>
        </span>
        <input
          aria-label={`${label} — גודל טקסט`}
          className="w-full accent-teal-300"
          type="range"
          min="50"
          max="200"
          step="1"
          value={Math.round(scale * 100)}
          onChange={(e) => onScale(Number(e.target.value) / 100)}
        />
      </label>
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
