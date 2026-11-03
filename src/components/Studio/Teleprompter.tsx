import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';

export interface TeleprompterProps {
  text: string;
  isScrolling: boolean;
  scrollSpeed: number;
  fontSize: number;
  opacity: number;
  isCameraActive: boolean;
  isMirrored?: boolean;
  eyeContactAnchor?: boolean;
  voiceTrackEnabled?: boolean;
  audioStream?: MediaStream | null;
  restartSignal?: number;
  onToggleVoiceTrack?: (enabled: boolean) => void;
  onToggleScroll?: () => void;
  onRestart?: () => void;
  onSpeedChange?: (speed: number) => void;
  onFontSizeChange?: (size: number) => void;
  onOpacityChange?: (opacity: number) => void;
  onScriptComplete?: () => void;
}

export const Teleprompter: React.FC<TeleprompterProps> = ({
  text,
  isScrolling,
  scrollSpeed,
  fontSize,
  opacity,
  isCameraActive,
  isMirrored = false,
  eyeContactAnchor = false,
  restartSignal = 0,
  onToggleScroll,
  onRestart,
  onSpeedChange,
  onFontSizeChange,
  onOpacityChange,
  onScriptComplete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // High-precision timeline tracking
  const startTimeRef = useRef<number | null>(null);
  const startOffsetRef = useRef<number>(0);
  const currentOffsetRef = useRef<number>(0);
  const speedRef = useRef(scrollSpeed);

  // Mobile Touch Gestures
  const touchStartYRef = useRef<number | null>(null);
  const touchStartOffsetRef = useRef<number>(0);

  const [offsetY, setOffsetY] = useState(0);
  const [maxScroll, setMaxScroll] = useState(1000);
  const [hasEnded, setHasEnded] = useState(false);

  // Calculate word count & estimated duration
  const wordCount = useMemo(() => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [text]);

  // Split text into paragraphs for cleaner visual pacing
  const paragraphs = useMemo(() => {
    if (!text) return [];
    return text
      .split(/\n\s*\n|\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }, [text]);

  // Update max scroll bounds
  const updateBounds = useCallback(() => {
    if (contentRef.current && containerRef.current) {
      const contentHeight = contentRef.current.offsetHeight;
      const viewportHeight = containerRef.current.offsetHeight;
      const max = Math.max(0, contentHeight - viewportHeight * 0.4);
      setMaxScroll(max);
      return max;
    }
    return 1000;
  }, []);

  useEffect(() => {
    speedRef.current = scrollSpeed;
    if (isScrolling) {
      // Re-anchor timeline when speed changes mid-scroll
      startTimeRef.current = performance.now();
      startOffsetRef.current = currentOffsetRef.current;
    }
  }, [scrollSpeed, isScrolling]);

  useEffect(() => {
    const timer = setTimeout(updateBounds, 100);
    window.addEventListener('resize', updateBounds);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateBounds);
    };
  }, [text, fontSize, updateBounds]);

  // Core Rock-Solid Constant-Velocity GPU Animation Engine (No mic interference)
  useEffect(() => {
    const scrollStep = (now: number) => {
      if (!isScrolling) return;

      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }

      const elapsedSec = (now - startTimeRef.current) / 1000;
      // Linear velocity: 1.0x speed = 28px/second
      const pps = Math.max(0.1, speedRef.current) * 28;
      const targetOffset = startOffsetRef.current + elapsedSec * pps;

      if (targetOffset <= maxScroll) {
        currentOffsetRef.current = targetOffset;
        setOffsetY(targetOffset);
        animFrameRef.current = requestAnimationFrame(scrollStep);
      } else {
        // Reached end of script
        currentOffsetRef.current = maxScroll;
        setOffsetY(maxScroll);
        setHasEnded(true);
        if (onToggleScroll) onToggleScroll();
        if (onScriptComplete) onScriptComplete();
        startTimeRef.current = null;
      }
    };

    if (isScrolling) {
      setHasEnded(false);
      startTimeRef.current = performance.now();
      startOffsetRef.current = currentOffsetRef.current;
      animFrameRef.current = requestAnimationFrame(scrollStep);
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      startTimeRef.current = null;
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isScrolling, maxScroll, onToggleScroll, onScriptComplete]);

  // Reset offset on restartSignal
  useEffect(() => {
    if (restartSignal > 0) {
      currentOffsetRef.current = 0;
      startOffsetRef.current = 0;
      startTimeRef.current = performance.now();
      setOffsetY(0);
      setHasEnded(false);
    }
  }, [restartSignal]);

  const handleRestart = useCallback(() => {
    currentOffsetRef.current = 0;
    startOffsetRef.current = 0;
    setOffsetY(0);
    setHasEnded(false);
    startTimeRef.current = isScrolling ? performance.now() : null;
    if (onRestart) onRestart();
  }, [isScrolling, onRestart]);

  // Manual scrubbing / touch gestures
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY;
    const nextOffset = Math.max(0, Math.min(maxScroll, currentOffsetRef.current + delta * 0.5));
    currentOffsetRef.current = nextOffset;
    startOffsetRef.current = nextOffset;
    startTimeRef.current = performance.now();
    setOffsetY(nextOffset);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartOffsetRef.current = currentOffsetRef.current;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const deltaY = touchStartYRef.current - e.touches[0].clientY;
    const nextOffset = Math.max(0, Math.min(maxScroll, touchStartOffsetRef.current + deltaY));
    currentOffsetRef.current = nextOffset;
    startOffsetRef.current = nextOffset;
    startTimeRef.current = performance.now();
    setOffsetY(nextOffset);
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  const handleParagraphClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contentRef.current) return;
    const pElements = contentRef.current.children;
    if (pElements[index]) {
      const el = pElements[index] as HTMLElement;
      const target = Math.max(0, Math.min(maxScroll, el.offsetTop - 120));
      currentOffsetRef.current = target;
      startOffsetRef.current = target;
      startTimeRef.current = performance.now();
      setOffsetY(target);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (onToggleScroll) onToggleScroll();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (onSpeedChange) onSpeedChange(Math.min(3.0, Number((speedRef.current + 0.1).toFixed(2))));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (onSpeedChange) onSpeedChange(Math.max(0.3, Number((speedRef.current - 0.1).toFixed(2))));
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleScroll, onSpeedChange, handleRestart]);

  if (!text) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-500 z-10 pointer-events-none select-none">
        <p className="max-w-md text-sm">הטלפרומפטר ריק. צור תסריט בלשונית "מחולל תסריטים" כדי להציגו כאן.</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none overflow-hidden">
      
      {/* Subtle edge guides only if eye-contact anchor is explicitly enabled (no intrusive badges in text center) */}
      {eyeContactAnchor && (
        <div className="absolute top-[20%] left-0 right-0 z-25 pointer-events-none flex items-center justify-between px-2 sm:px-4 opacity-40">
          <div className="h-[2px] w-6 sm:w-10 bg-gradient-to-r from-transparent to-cyan-400" />
          <div className="h-[2px] w-6 sm:w-10 bg-gradient-to-l from-transparent to-cyan-400" />
        </div>
      )}

      {/* GPU Accelerated Viewport Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing touch-pan-y"
        style={{
          backgroundColor: isCameraActive ? `rgba(0, 0, 0, ${1 - opacity})` : 'rgba(15, 23, 42, 0.95)',
          contain: 'strict'
        }}
      >
        {/* Pure GPU Transform Translation Layer */}
        <div
          ref={contentRef}
          style={{
            transform: `translate3d(0, -${offsetY}px, 0)`,
            willChange: 'transform',
            fontSize: `${fontSize}px`,
            paddingTop: eyeContactAnchor ? '18vh' : '30vh',
            paddingBottom: '85vh',
            textShadow: isCameraActive
              ? '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.8)'
              : 'none'
          }}
          className="max-w-2xl mx-auto px-6 text-center whitespace-pre-wrap leading-relaxed font-sans font-black text-white"
        >
          {paragraphs.map((paragraph, idx) => (
            <div
              key={idx}
              onClick={(e) => handleParagraphClick(idx, e)}
              className="mb-7 cursor-pointer hover:text-amber-200 active:opacity-80 rounded-xl py-1 px-3 transition-colors duration-150"
              title="לחץ כדי לקפוץ ישירות לפסקה זו"
            >
              {paragraph}
            </div>
          ))}

          {/* End of Script Badge */}
          {hasEnded && (
            <div className="mt-12 p-4 bg-emerald-500/20 border border-emerald-400/40 rounded-2xl max-w-sm mx-auto text-center animate-in fade-in zoom-in-95">
              <Sparkles className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-emerald-300">סיום התסריט! צילום מעולה 🎉</p>
              <button
                onClick={handleRestart}
                className="mt-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all cursor-pointer"
              >
                חזור להתחלה (R)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
