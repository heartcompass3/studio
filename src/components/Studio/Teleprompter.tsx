import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Play, Pause, RotateCcw, Type, Gauge, FlipHorizontal, Eye, Clock, Sparkles } from 'lucide-react';

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
  restartSignal?: number;
  onToggleVoiceTrack?: (enabled: boolean) => void;
  onToggleScroll?: () => void;
  onRestart?: () => void;
  onSpeedChange?: (speed: number) => void;
  onFontSizeChange?: (size: number) => void;
  onOpacityChange?: (opacity: number) => void;
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
  voiceTrackEnabled = false,
  restartSignal = 0,
  onToggleVoiceTrack,
  onToggleScroll,
  onRestart,
  onSpeedChange,
  onFontSizeChange,
  onOpacityChange
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
  const [showFocusGuide, setShowFocusGuide] = useState(true);
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

  // WPM (Words Per Minute) calculation
  const currentWpm = useMemo(() => {
    return Math.round(scrollSpeed * 65);
  }, [scrollSpeed]);

  const totalEstimatedSec = useMemo(() => {
    if (wordCount === 0 || currentWpm === 0) return 0;
    return Math.round((wordCount / currentWpm) * 60);
  }, [wordCount, currentWpm]);

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

  // Core Constant-Velocity GPU Animation Engine
  useEffect(() => {
    const scrollStep = (now: number) => {
      if (!isScrolling) return;

      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }

      const elapsedSec = (now - startTimeRef.current) / 1000;
      // Pixels Per Second linear calculation: 1.0x ≈ 28px/sec
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
  }, [isScrolling, maxScroll, onToggleScroll]);

  // Reset offset on new text or restart
  useEffect(() => {
    currentOffsetRef.current = 0;
    startOffsetRef.current = 0;
    startTimeRef.current = null;
    setOffsetY(0);
    setHasEnded(false);
    updateBounds();
  }, [text, restartSignal, updateBounds]);

  const [voiceSyncActive, setVoiceSyncActive] = useState(voiceTrackEnabled);
  const [isListeningSpeech, setIsListeningSpeech] = useState(false);

  useEffect(() => {
    setVoiceSyncActive(voiceTrackEnabled);
  }, [voiceTrackEnabled]);

  // AI Voice-Tracking: Uses Web SpeechRecognition (he-IL) to match spoken words to lines
  useEffect(() => {
    if (!isScrolling || !voiceSyncActive) {
      setIsListeningSpeech(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setIsListeningSpeech(false);
      return;
    }

    let recognition: any;
    let isStopped = false;

    try {
      recognition = new SpeechRec();
      recognition.lang = 'he-IL';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (!isStopped) setIsListeningSpeech(true);
      };

      recognition.onresult = (event: any) => {
        if (isStopped || !event.results || event.results.length === 0) return;
        const lastResult = event.results[event.results.length - 1];
        const spokenText = lastResult[0]?.transcript?.trim().toLowerCase();
        if (!spokenText) return;

        const words = spokenText.split(/\s+/).filter((w: string) => w.length >= 2);
        if (words.length === 0) return;

        // Search for matching paragraph in script
        let bestParagraphIdx = -1;
        let maxMatches = 0;

        paragraphs.forEach((p, idx) => {
          const lowerP = p.toLowerCase();
          let matches = 0;
          for (const w of words) {
            if (lowerP.includes(w)) matches++;
          }
          if (matches > maxMatches) {
            maxMatches = matches;
            bestParagraphIdx = idx;
          }
        });

        if (bestParagraphIdx >= 0 && maxMatches >= 1) {
          const targetRatio = bestParagraphIdx / Math.max(1, paragraphs.length - 1);
          const targetOffset = targetRatio * maxScroll;
          currentOffsetRef.current = targetOffset;
          startOffsetRef.current = targetOffset;
          startTimeRef.current = performance.now();
          setOffsetY(targetOffset);
        }
      };

      recognition.onerror = () => {
        setIsListeningSpeech(false);
      };

      recognition.onend = () => {
        if (!isStopped && isScrolling && voiceSyncActive) {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
    } catch {
      setIsListeningSpeech(false);
    }

    return () => {
      isStopped = true;
      if (recognition) {
        try { recognition.stop(); } catch {}
      }
      setIsListeningSpeech(false);
    };
  }, [isScrolling, voiceSyncActive, paragraphs, maxScroll]);

  const handleRestart = useCallback(() => {
    currentOffsetRef.current = 0;
    startOffsetRef.current = 0;
    startTimeRef.current = null;
    setOffsetY(0);
    setHasEnded(false);
    if (onRestart) onRestart();
  }, [onRestart]);

  // Manual wheel scroll handler
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY;
    const newOffset = Math.max(0, Math.min(maxScroll, currentOffsetRef.current + delta));
    currentOffsetRef.current = newOffset;
    startOffsetRef.current = newOffset;
    startTimeRef.current = performance.now();
    setOffsetY(newOffset);
  };

  // Mobile Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartYRef.current = e.touches[0].clientY;
      touchStartOffsetRef.current = currentOffsetRef.current;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current !== null && e.touches.length === 1) {
      const deltaY = touchStartYRef.current - e.touches[0].clientY;
      const newOffset = Math.max(0, Math.min(maxScroll, touchStartOffsetRef.current + deltaY));
      currentOffsetRef.current = newOffset;
      startOffsetRef.current = newOffset;
      startTimeRef.current = performance.now();
      setOffsetY(newOffset);
    }
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  // Jump to specific paragraph on click
  const handleParagraphClick = (idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target && containerRef.current) {
      const targetTop = target.offsetTop;
      const viewportHeight = containerRef.current.offsetHeight;
      const newOffset = Math.max(0, Math.min(maxScroll, targetTop - viewportHeight * 0.35));
      currentOffsetRef.current = newOffset;
      startOffsetRef.current = newOffset;
      startTimeRef.current = performance.now();
      setOffsetY(newOffset);
    }
  };

  // Keyboard Shortcuts (Space, Arrows, R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (onToggleScroll) onToggleScroll();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (onSpeedChange) onSpeedChange(Math.min(6, Number((speedRef.current + 0.25).toFixed(2))));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (onSpeedChange) onSpeedChange(Math.max(0.25, Number((speedRef.current - 0.25).toFixed(2))));
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleScroll, onSpeedChange, handleRestart]);

  // Progress calculations
  const progressPercent = maxScroll > 0 ? Math.min(100, Math.round((offsetY / maxScroll) * 100)) : 0;
  const elapsedSecEstimated = totalEstimatedSec > 0 ? Math.round((progressPercent / 100) * totalEstimatedSec) : 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!text) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-500 z-10 pointer-events-none select-none">
        <p className="max-w-md text-sm">הטלפרומפטר ריק. צור תסריט בלשונית "מחולל תסריטים" כדי להציגו כאן.</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none overflow-hidden">
      
      {/* Eye-Level Reading Focus Guide + Voice Track Badge */}
      {showFocusGuide && (
        <div className={`absolute ${eyeContactAnchor ? 'top-[16%]' : 'top-[35%]'} left-0 right-0 z-30 pointer-events-none flex items-center justify-between px-3 sm:px-6 transition-all duration-300 ${eyeContactAnchor ? 'opacity-95' : 'opacity-85'}`}>
          <div className="flex items-center gap-2">
            <div className={`h-[2px] w-8 sm:w-14 bg-gradient-to-r from-transparent ${eyeContactAnchor ? 'to-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'to-amber-400/80'}`} />
            <div className={`px-2 py-0.5 rounded-full border text-[10px] font-bold backdrop-blur-md shadow-sm flex items-center gap-1.5 ${eyeContactAnchor ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'bg-amber-500/20 border-amber-400/40 text-amber-300'}`}>
              <Eye className={`w-3 h-3 ${eyeContactAnchor ? 'text-cyan-300' : 'text-amber-400'}`} />
              <span>{eyeContactAnchor ? '🎯 עוגן עדשה' : 'גובה קריאה'}</span>
            </div>
          </div>

          {/* Interactive Voice Track Indicator / Toggle */}
          <button
            onClick={() => {
              const nextState = !voiceSyncActive;
              setVoiceSyncActive(nextState);
              if (onToggleVoiceTrack) onToggleVoiceTrack(nextState);
            }}
            className={`pointer-events-auto px-2.5 py-0.5 rounded-full border text-[10px] font-black backdrop-blur-md shadow-sm flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
              voiceSyncActive
                ? isListeningSpeech
                  ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 shadow-emerald-500/30 animate-pulse'
                  : 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-cyan-500/20'
                : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="לחץ להפעלת/השבתת מעקב קול AI (גולל בהתאם לקצב הדיבור שלך)"
          >
            <Sparkles className="w-3 h-3 text-cyan-300" />
            <span>{voiceSyncActive ? (isListeningSpeech ? '🗣️ מקשיב לדיבור...' : '🗣️ מעקב קול פעיל') : '🗣️ מעקב קול: כבוי'}</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400/80 bg-black/50 px-2 py-0.5 rounded-full">
              {formatTime(elapsedSecEstimated)}/{formatTime(totalEstimatedSec)}
            </span>
            <div className={`h-[2px] w-8 sm:w-14 bg-gradient-to-l from-transparent ${eyeContactAnchor ? 'to-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'to-amber-400/80'}`} />
          </div>
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
            paddingTop: eyeContactAnchor ? '16vh' : '35vh',
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
                className="mt-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all"
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
