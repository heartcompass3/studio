import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CaptionItem, SubtitleStyle } from '../../types/studio';
import { captionPages, pageAtWord } from '../../services/captionLayout';

export function CaptionPreview({ caption, time, style, karaoke }: {
  caption: CaptionItem; time: number; style: SubtitleStyle; karaoke: boolean;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [metrics, setMetrics] = useState({ width: 240, font: '900 18px Arial', size: 18 });
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const css = getComputedStyle(element);
      const next = {
        width: Math.max(1, element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - 4),
        font: `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`,
        size: parseFloat(css.fontSize),
      };
      setMetrics(old => old.width === next.width && old.font === next.font ? old : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    measure();
    return () => { alive = false; observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const context = useMemo(() => document.createElement('canvas').getContext('2d')!, []);
  context.font = metrics.font;
  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  const active = Math.max(0, Math.min(words.length - 1, Math.floor(
    (time - caption.start) / Math.max(.001, caption.end - caption.start) * words.length,
  )));
  const page = pageAtWord(captionPages(caption.text, text => context.measureText(text).width, metrics.width), active);
  const accent = style === 'karaoke-brand-cyan' ? '#38BDF8' : style === 'karaoke-brand-coral' ? '#FB7185' : '#FFE600';
  let index = page?.first || 0;
  return <div className="absolute bottom-8 sm:bottom-12 left-0 right-0 px-4 text-center pointer-events-none z-20 flex justify-center">
    <span ref={box} data-caption-page className="inline-block px-4 py-2 rounded-2xl font-black text-sm sm:text-base md:text-lg leading-snug"
      style={{ width: '92%', background: style === 'karaoke-clean-floating' ? 'transparent' : 'rgba(0,0,0,.85)', color: 'white', textShadow: '0 2px 8px black' }}>
      {page?.lines.map((line, lineIndex) => <span key={lineIndex} data-caption-line dir="rtl" className="block whitespace-nowrap">
        {line.map((word, localIndex) => {
          const wordIndex = index++;
          const scale = Math.min(1, metrics.width / Math.max(1, context.measureText(word).width));
          return <span key={wordIndex} style={{ color: karaoke && wordIndex === active ? accent : 'white', fontSize: scale < 1 ? metrics.size * scale : undefined }}>
            {localIndex > 0 ? ' ' : ''}{word}
          </span>;
        })}
      </span>)}
    </span>
  </div>;
}
