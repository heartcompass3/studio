import React, { useEffect, useRef, useState } from 'react';
import { Mic, AlertTriangle, Volume2, CheckCircle, Loader } from 'lucide-react';
import { AudioMeterService } from '../../services/audioService';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  showTestButton?: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive, showTestButton = false }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const micRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);
  const audioMeterRef = useRef<AudioMeterService>(new AudioMeterService());

  // 3-Second Sound Check State
  const [isTesting, setIsTesting] = useState(false);
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isActive && stream && stream.getAudioTracks().length > 0) {
      audioMeterRef.current.start(stream, (volume, isClipping) => {
        // Direct DOM manipulation for maximum performance without React re-renders
        if (barRef.current) {
          barRef.current.style.width = `${Math.min(100, Math.max(5, volume))}%`;
          if (volume > 90 || isClipping) {
            barRef.current.className = 'h-full rounded-full transition-all duration-75 bg-rose-500';
          } else if (volume > 70) {
            barRef.current.className = 'h-full rounded-full transition-all duration-75 bg-amber-500';
          } else {
            barRef.current.className = 'h-full rounded-full transition-all duration-75 bg-emerald-500';
          }
        }

        if (textRef.current) {
          textRef.current.textContent = `${volume}%`;
        }

        if (micRef.current) {
          micRef.current.setAttribute('class', `w-3.5 h-3.5 transition-colors ${volume > 5 ? 'text-emerald-400' : 'text-slate-500'}`);
        }

        if (clipRef.current) {
          clipRef.current.style.display = isClipping ? 'inline-block' : 'none';
        }
      });
    } else {
      audioMeterRef.current.stop();
    }

    return () => {
      audioMeterRef.current.stop();
      if (testAudioRef.current) {
        testAudioRef.current.pause();
        testAudioRef.current = null;
      }
    };
  }, [stream, isActive]);

  const handleTestMic = () => {
    if (!stream || isTesting || isPlayingTest) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    setIsTesting(true);
    setTestSuccess(false);
    setTestCountdown(3);

    const testStream = new MediaStream([audioTrack]);
    const chunks: Blob[] = [];

    let recorder: MediaRecorder;
    try {
      const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      recorder = new MediaRecorder(testStream, mime ? { mimeType: mime } : {});
    } catch {
      setIsTesting(false);
      setTestCountdown(null);
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      setIsTesting(false);
      setTestCountdown(null);
      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      testAudioRef.current = audio;
      setIsPlayingTest(true);

      audio.onended = () => {
        setIsPlayingTest(false);
        setTestSuccess(true);
        URL.revokeObjectURL(url);
        setTimeout(() => setTestSuccess(false), 4000);
      };
      audio.onerror = () => {
        setIsPlayingTest(false);
        URL.revokeObjectURL(url);
      };

      audio.play().catch(() => {
        setIsPlayingTest(false);
      });
    };

    recorder.start();

    // 3s Countdown timer
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setTestCountdown(count);
      } else {
        clearInterval(interval);
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    }, 1000);
  };

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* VU Level Badge */}
      <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg select-none">
        <Mic ref={micRef} className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        
        {/* VU Level Bar */}
        <div className="w-16 sm:w-20 h-2 bg-slate-800 rounded-full overflow-hidden flex items-center p-0.5">
          <div 
            ref={barRef}
            className="h-full rounded-full transition-all duration-75 bg-emerald-500"
            style={{ width: '5%' }}
          />
        </div>

        <span ref={textRef} className="text-[10px] font-mono text-slate-300 w-6 text-left shrink-0">
          0%
        </span>

        <span 
          ref={clipRef}
          style={{ display: 'none' }}
          title="עוצמת שמע גבוהה מדי (Clipping)" 
          className="text-rose-400 animate-ping"
        >
          <AlertTriangle className="w-3 h-3" />
        </span>
      </div>

      {/* 3-Second Sound Check Button */}
      {showTestButton && (
        <button
          onClick={handleTestMic}
          disabled={isTesting || isPlayingTest}
          type="button"
          className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1.5 shadow transition-all cursor-pointer disabled:opacity-50"
          title="הקלט 3 שניות של דיבור ושמע את עצמך מיד לוודא שהמיקרופון צלול"
        >
          {isTesting ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="text-rose-300 font-mono">דבר עכשיו ({testCountdown}s)...</span>
            </>
          ) : isPlayingTest ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-cyan-300">משמיע בדיקה...</span>
            </>
          ) : testSuccess ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">שמע תקין ✓</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>בדיקת שמע (3 שנ')</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
