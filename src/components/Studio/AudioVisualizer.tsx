import React, { useEffect, useRef } from 'react';
import { Mic, AlertTriangle } from 'lucide-react';
import { AudioMeterService } from '../../services/audioService';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const micRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);
  const audioMeterRef = useRef<AudioMeterService>(new AudioMeterService());

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
    };
  }, [stream, isActive]);

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/70 shadow-lg select-none">
      <Mic ref={micRef} className="w-3.5 h-3.5 text-slate-500" />
      
      {/* VU Level Bar */}
      <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden flex items-center p-0.5">
        <div 
          ref={barRef}
          className="h-full rounded-full transition-all duration-75 bg-emerald-500"
          style={{ width: '5%' }}
        />
      </div>

      <span ref={textRef} className="text-[10px] font-mono text-slate-300 w-6 text-left">
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
  );
};
