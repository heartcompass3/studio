import React, { useEffect, useState } from 'react';

/** Commit a whole timestamp, allowing decimal typing and one undo step per edit. */
export function CaptionTimeInput({ value, label, min = 0, max, onCommit, className }: {
  value: number; label: string; min?: number; max?: number;
  onCommit: (seconds: number) => void; className?: string;
}) {
  const formatted = String(Number(value.toFixed(3)));
  const [draft, setDraft] = useState(formatted);
  useEffect(() => setDraft(formatted), [formatted]);
  return <input aria-label={label} type="number" dir="ltr" min={min} max={max} step="0.01"
    value={draft} className={className} title="זמן בשניות; אשר עם Enter או ביציאה מהשדה"
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const parsed = Number(draft);
      if (draft.trim() && Number.isFinite(parsed)) onCommit(parsed);
      setDraft(formatted);
    }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
