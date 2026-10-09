import { CaptionPreview } from './CaptionPreview';
import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowRight, Download, Save, Scissors, Subtitles, 
  Trash2, Plus, Play, Pause, RotateCcw, Loader, 
  Sparkles, Sliders, Check, FileText, Palette, Clock,
  FastForward, Rewind, Zap, PlayCircle, Layers, MoveHorizontal, 
  Target, VolumeX, Volume2, Type, Sparkle, Smartphone, Monitor,
  Image as ImageIcon, X, Upload, Eye, Music, Repeat2
} from 'lucide-react';
import { CaptionTimeInput } from './CaptionTimeInput';
import { updateCaptionTiming, captionIsActive } from '../../services/captionTiming';
import { CaptionItem, SubtitleStyle, VideoAspectRatio, VisualOverlayItem } from '../../types/studio';
import { generateCaptionsFromVideoBlob, proofreadHebrewCaptions, sanitizeAndSequenceCaptions } from '../../services/geminiService';
import { 
  exportVideoToMP4, 
  exportCaptionsToSRT, 
  drawStudioSubtitle, 
  detectAudioSilence,
  splitLongCaptions
} from '../../services/mp4ExportService';

interface VideoEditorProps {
  videoBlob: Blob | null;
  videoUrl: string | null;
  initialDuration?: number;
  referenceScript?: string;
  onBackToStudio: () => void;
  onError: (msg: string) => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({
  videoBlob,
  videoUrl,
  initialDuration = 0,
  referenceScript = '',
  onBackToStudio,
  onError
}) => {
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);

  const activeVideoUrl = uploadedUrl || videoUrl;
  const activeVideoBlob = uploadedBlob || videoBlob;
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [exportAspectRatio, setExportAspectRatio] = useState<VideoAspectRatio>('9:16');

  // Trimming State
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(initialDuration || 0);
  const [hasCustomTrim, setHasCustomTrim] = useState(false);
  const [isDetectingSilence, setIsDetectingSilence] = useState(false);

  // Captions & Subtitle Styling
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [isProofreading, setIsProofreading] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>('karaoke-yellow');
  const [karaokeEnabled, setKaraokeEnabled] = useState(true); // Word-by-word active highlight
  const [headlineText, setHeadlineText] = useState(''); // Top headline banner
  const [rippleSync, setRippleSync] = useState(true); // Auto-cascade shift to following captions
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Visual Overlays (B-Roll, Hook Cover, PiP)
  const [visualOverlays, setVisualOverlays] = useState<VisualOverlayItem[]>([]);
  const [isOverlayDrawerOpen, setIsOverlayDrawerOpen] = useState(false);

  // Video Enhancements
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);

  // Two-channel audio mix: original voice/video + background music
  const [sourceVolume, setSourceVolume] = useState(1);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.2);
  const [musicFitMode, setMusicFitMode] = useState<'auto' | 'loop' | 'trim'>('auto');

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  const editedDuration = Math.max(0, (trimEnd || duration) - trimStart);

  const shouldLoopMusic = () => {
    if (musicFitMode === 'loop') return true;
    return musicFitMode === 'auto' && musicDuration > 0 && editedDuration > musicDuration;
  };

  const syncMusicPreview = (force = false) => {
    const music = musicRef.current;
    const video = videoRef.current;
    if (!music || !video || !musicDuration) return;

    const relativeVideoTime = Math.max(0, video.currentTime - trimStart);
    const loops = shouldLoopMusic();
    const desiredTime = loops
      ? relativeVideoTime % musicDuration
      : Math.min(relativeVideoTime, Math.max(0, musicDuration - 0.02));

    music.loop = loops;
    if (force || Math.abs(music.currentTime - desiredTime) > 0.28) {
      music.currentTime = desiredTime;
    }

    if (!loops && relativeVideoTime >= musicDuration) {
      music.pause();
    }
  };

  const handleMusicFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['mp3', 'mp4'].includes(extension || '')) {
      onError('פורמט המוזיקה אינו נתמך. יש לבחור קובץ MP3 או MP4.');
      e.target.value = '';
      return;
    }

    if (musicUrl) URL.revokeObjectURL(musicUrl);
    const nextUrl = URL.createObjectURL(file);
    setMusicFile(file);
    setMusicUrl(nextUrl);
    setMusicDuration(0);
    e.target.value = '';
  };

  const removeMusic = () => {
    musicRef.current?.pause();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicFile(null);
    setMusicUrl(null);
    setMusicDuration(0);
  };

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = sourceVolume;
  }, [sourceVolume]);

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    syncMusicPreview(true);
  }, [musicFitMode, musicDuration, trimStart, trimEnd, duration]);

  useEffect(() => {
    return () => {
      musicRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (musicUrl) URL.revokeObjectURL(musicUrl);
    };
  }, [musicUrl]);

  const handleVideoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    const url = URL.createObjectURL(file);
    setUploadedUrl(url);
    setUploadedBlob(file);
  };

  // High-Precision 60fps Playhead Tracking for Ultra-Smooth Karaoke Sync
  useEffect(() => {
    let animId: number;
    if (isPlaying) {
      const updateLoop = () => {
        if (videoRef.current) {
          setCurrentTime(videoRef.current.currentTime);
        }
        animId = requestAnimationFrame(updateLoop);
      };
      animId = requestAnimationFrame(updateLoop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
      if (!hasCustomTrim) {
        setTrimEnd(initialDuration);
      }
    }
  }, [initialDuration, hasCustomTrim]);

  // Keyboard shortcuts (Space = Play/Pause, Arrow Left/Right = Seek 1s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) {
          const newTime = Math.max(0, videoRef.current.currentTime - 1);
          videoRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) {
          const maxT = duration > 0 ? duration : (videoRef.current.currentTime + 1);
          const newTime = Math.min(maxT, videoRef.current.currentTime + 1);
          videoRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, duration, hasCustomTrim, trimEnd, trimStart]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight
      });
    }
    const validDur = (dur && isFinite(dur) && dur > 1.5) ? dur : (initialDuration || 0);
    if (validDur > 0) {
      const maxDur = Math.max(validDur, initialDuration || 0, duration || 0);
      setDuration(maxDur);
      if (!hasCustomTrim) {
        setTrimEnd(maxDur);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    syncMusicPreview();

    if (time > duration) {
      setDuration(time);
      if (!hasCustomTrim) {
        setTrimEnd(time);
      }
    }

    if (hasCustomTrim && trimEnd > (trimStart + 0.2) && time >= trimEnd && !isExporting) {
      videoRef.current.pause();
      musicRef.current?.pause();
      videoRef.current.currentTime = trimStart;
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      musicRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (hasCustomTrim && trimEnd > 0 && videoRef.current.currentTime >= trimEnd) {
        videoRef.current.currentTime = trimStart;
      } else if (videoRef.current.ended) {
        videoRef.current.currentTime = 0;
      }
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        syncMusicPreview(true);
        musicRef.current?.play().catch((e) => console.warn('Music preview error:', e));
      }).catch((e) => {
        console.warn('Play error:', e);
      });
    }
  };

  // Auto Captions via Gemini AI (with Reference Script anchoring)
  const handleAutoCaptions = async () => {
    if (!activeVideoBlob) {
      onError('לא נמצא קובץ וידאו לתמלול. אנא העלה קובץ וידאו או הקלט באולפן.');
      return;
    }
    setIsGeneratingCaptions(true);
    try {
      const realDur = videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0
        ? videoRef.current.duration
        : (duration || initialDuration || 0);
      const items = await generateCaptionsFromVideoBlob(activeVideoBlob, referenceScript, realDur);
      setCaptions(items);
      if (items.some(item => item.needsReview)) onError('התמלול הושלם, אך הגהת הכתיב לא הושלמה. אפשר ללחוץ על הגהה או לתקן ידנית.');
    } catch (err: any) {
      onError(err.message || 'שגיאה בתמלול הכתוביות בעזרת AI');
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // Hebrew Proofreading & Spellcheck
  const handleProofreadCaptions = async () => {
    if (!captions || captions.length === 0) {
      onError('אין כתוביות להגהה');
      return;
    }
    setIsProofreading(true);
    try {
      const realDur = videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0
        ? videoRef.current.duration
        : (duration || initialDuration || 0);
      const corrected = await proofreadHebrewCaptions(captions, referenceScript);
      const sanitized = sanitizeAndSequenceCaptions(corrected, realDur);
      setCaptions(sanitized);
    } catch (err: any) {
      onError(err.message || 'שגיאה בהגהה הלשונית');
    } finally {
      setIsProofreading(false);
    }
  };

  // Smart Auto-Split Long Captions (Max 2 lines)
  const handleSplitLongCaptions = () => {
    if (!captions || captions.length === 0) return;
    const split = splitLongCaptions(captions);
    setCaptions(split);
  };

  // Visual Overlays Management (Zero-Bloat Modular Layer)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'hook-cover' | 'b-roll-full' | 'pip-corner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newOverlay: VisualOverlayItem = {
        id: `overlay_${Date.now()}`,
        type,
        imageUrl: dataUrl,
        startTime: type === 'hook-cover' ? 0 : Number(currentTime.toFixed(1)),
        endTime: type === 'hook-cover' ? Math.min(2.5, duration || 2.5) : Number(Math.min(duration || (currentTime + 3.0), currentTime + 3.0).toFixed(1)),
        title: type === 'hook-cover' ? 'כרטיסיית הוק פתיחה' : (type === 'pip-corner' ? 'חלון צף (PiP)' : 'תמונת B-Roll מלאה')
      };
      setVisualOverlays(prev => [...prev, newOverlay].sort((a, b) => a.startTime - b.startTime));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeVisualOverlay = (id: string) => {
    setVisualOverlays(prev => prev.filter(o => o.id !== id));
  };

  const updateOverlayTimes = (id: string, start: number, end: number) => {
    setVisualOverlays(prev => prev.map(o => o.id === id ? { ...o, startTime: Math.max(0, start), endTime: Math.max(start + 0.5, end) } : o));
  };

  // Auto Detect Silence & Smart Trim
  const handleAutoDetectSilence = async () => {
    if (!activeVideoBlob) {
      onError('לא נמצא קובץ וידאו לניתוח סאונד');
      return;
    }
    setIsDetectingSilence(true);
    try {
      const { start, end } = await detectAudioSilence(activeVideoBlob);
      setTrimStart(start);
      setTrimEnd(end);
      setHasCustomTrim(true);
      if (videoRef.current) {
        videoRef.current.currentTime = start;
        setCurrentTime(start);
      }
    } catch (err: any) {
      onError('שגיאה בזיהוי שתיקות: ' + (err.message || ''));
    } finally {
      setIsDetectingSilence(false);
    }
  };

  const updateCaptionText = (id: number, text: string) => {
    setCaptions(prev => prev.map(c => c.id === id ? { ...c, text } : c));
  };

  const applyCaptionStartUpdate = (id: number, value: number, overrideRipple?: boolean) => {
    setCaptions(previous => updateCaptionTiming(previous, id, 'start', value, {
      ripple: overrideRipple ?? rippleSync, duration,
    }));
  };
  const applyCaptionEndUpdate = (id: number, value: number) => {
    setCaptions(previous => updateCaptionTiming(previous, id, 'end', value, { ripple: rippleSync, duration }));
  };
  const nudgeCaptionStart = (id: number, delta: number) => {
    setCaptions(previous => {
      const item = previous.find(cap => cap.id === id);
      return item ? updateCaptionTiming(previous, id, 'start', item.start + delta, { ripple: rippleSync, duration }) : previous;
    });
  };
  const nudgeCaptionEnd = (id: number, delta: number) => {
    setCaptions(previous => {
      const item = previous.find(cap => cap.id === id);
      return item ? updateCaptionTiming(previous, id, 'end', item.end + delta, { ripple: rippleSync, duration }) : previous;
    });
  };
  const pinTime = () => {
    const at = videoRef.current?.currentTime ?? currentTime;
    videoRef.current?.pause();
    setIsPlaying(false);
    setCurrentTime(at);
    return at;
  };
  const setCaptionStartToCurrent = (id: number) => applyCaptionStartUpdate(id, pinTime());
  const setCaptionEndToCurrent = (id: number) => applyCaptionEndUpdate(id, pinTime());
  const shiftSubsequentCaptions = (id: number, delta: number) => nudgeTail(id, delta);
  const nudgeTail = (id: number, delta: number) => {
    setCaptions(previous => {
      const item = previous.find(cap => cap.id === id);
      return item ? updateCaptionTiming(previous, id, 'start', item.start + delta, { ripple: true, duration }) : previous;
    });
  };
  const shiftAllCaptions = (delta: number) => {
    const first = [...captions].sort((a, b) => a.start - b.start)[0];
    if (first) nudgeTail(first.id, delta);
  };

  const snapCaptionsContiguous = () => {
    if (captions.length === 0) return;
    setCaptions(prev => {
      const sorted = [...prev].sort((a, b) => a.start - b.start);
      return sorted.map((cap, idx) => {
        if (idx === sorted.length - 1) return cap;
        const nextCap = sorted[idx + 1];
        return {
          ...cap,
          end: Math.max(cap.start + 0.1, Number(nextCap.start.toFixed(2)))
        };
      });
    });
  };

  const stretchCaptionsToDuration = () => {
    if (captions.length === 0 || !duration) return;
    const sorted = [...captions].sort((a, b) => a.start - b.start);
    const firstStart = sorted[0].start;
    const lastEnd = sorted[sorted.length - 1].end;
    const originalSpan = lastEnd - firstStart;
    if (originalSpan <= 0) return;

    const targetSpan = (trimEnd || duration) - firstStart;
    const ratio = targetSpan / originalSpan;

    setCaptions(prev => prev.map(c => ({
      ...c,
      start: Number((firstStart + (c.start - firstStart) * ratio).toFixed(2)),
      end: Number((firstStart + (c.end - firstStart) * ratio).toFixed(2))
    })));
  };

  const playCaptionSegment = (cap: CaptionItem) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = cap.start;
    setCurrentTime(cap.start);
    videoRef.current.play();
    setIsPlaying(true);
  };

  const addCaption = () => {
    const newId = captions.length > 0 ? Math.max(...captions.map(c => c.id)) + 1 : 1;
    const newCap: CaptionItem = {
      id: newId,
      start: Number(currentTime.toFixed(2)),
      end: Number(Math.min(duration || (currentTime + 2.0), currentTime + 2.0).toFixed(2)),
      text: 'טקסט חדש'
    };
    setCaptions(prev => [...prev, newCap].sort((a, b) => a.start - b.start));
  };

  const deleteCaption = (id: number) => {
    setCaptions(prev => prev.filter(c => c.id !== id));
  };

  const handleExportMP4 = async () => {
    if (!videoRef.current) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const mp4Blob = await exportVideoToMP4({
        videoElement: videoRef.current,
        captions,
        visualOverlays,
        trimStart,
        trimEnd: trimEnd || duration,
        brightness,
        contrast,
        subtitleStyle,
        exportAspectRatio,
        karaokeEnabled,
        headlineText,
        sourceVolume,
        musicBlob: musicFile,
        musicVolume,
        musicFitMode,
        onProgress: (pct, msg) => {
          setExportProgress(pct);
          setExportStatusText(msg);
        }
      });

      // Download
      const formatTag = exportAspectRatio === '9:16' ? 'reels_9x16' : 'youtube_16x9';
      const url = URL.createObjectURL(mp4Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heart_compass_${formatTag}_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export Error:', err);
      onError('שגיאה בייצוא הוידאו: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSRT = () => {
    if (captions.length === 0) {
      onError('אין כתוביות לייצוא');
      return;
    }
    const srtContent = exportCaptionsToSRT(captions);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'heart_compass_captions.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Active caption at current video playhead
  const activeCaption = captions.find(c => captionIsActive(c, currentTime));

  if (!activeVideoUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
        <Scissors className="w-12 h-12 mb-4 opacity-30 text-indigo-400" />
        <h3 className="text-xl font-bold text-white mb-2">אין וידאו לעריכה</h3>
        <p className="text-sm max-w-sm mb-6">הקלט קטע באולפן או העלה סרטון קיים כדי לערוך אותו, להוסיף מוזיקה, כתוביות וכותרות.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => videoFileInputRef.current?.click()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm cursor-pointer"
          >
            העלה סרטון לעריכה
          </button>
          <button
            onClick={onBackToStudio}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm cursor-pointer"
          >
            עבור לאולפן ההקלטות
          </button>
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={handleVideoFileSelected}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-95px)] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      
      {/* Top Header Bar */}
      <div className="bg-slate-900 px-4 sm:px-6 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToStudio}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" /> חזור לאולפן
          </button>
          <span className="text-sm font-bold text-white hidden sm:flex items-center gap-2">
            <Subtitles className="w-4 h-4 text-indigo-400" /> עורך וידאו MP4
          </span>
        </div>

        {/* Format Switcher (9:16 Reels vs 16:9 YouTube vs Original) */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setExportAspectRatio('9:16')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              exportAspectRatio === '9:16'
                ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>📱 רילס (9:16)</span>
          </button>

          <button
            onClick={() => setExportAspectRatio('16:9')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              exportAspectRatio === '16:9'
                ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>🖥️ יוטיוב (16:9)</span>
          </button>

          <button
            onClick={() => setExportAspectRatio('original')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              exportAspectRatio === 'original'
                ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            title="ייצוא ברזולוציה המקורית של הצילום ללא שינוי פורמט"
          >
            <Play className="w-3.5 h-3.5" />
            <span>🎬 מקורי</span>
          </button>
        </div>

        {/* Action Export Buttons & Media Layer Drawer Trigger */}
        <div className="flex items-center gap-2">
          {/* Direct Video Upload Trigger */}
          <button
            onClick={() => videoFileInputRef.current?.click()}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
            title="טען או החלף סרטון וידאו / B-Roll מהמחשב"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>העלה סרטון/B-Roll</span>
          </button>
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={handleVideoFileSelected}
          />

          <button
            onClick={() => setIsOverlayDrawerOpen(true)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
            title="הוספת שכבות תמונות, כרטיסיית הוק פתיחה ו-B-Roll"
          >
            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
            <span>שכבות מדיה (B-Roll)</span>
            {visualOverlays.length > 0 && (
              <span className="bg-sky-500 text-slate-950 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                {visualOverlays.length}
              </span>
            )}
          </button>

          {captions.length > 0 && (
            <button
              onClick={handleExportSRT}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" /> .SRT
            </button>
          )}

          <button
            onClick={handleExportMP4}
            disabled={isExporting}
            className="px-4 sm:px-5 py-2 bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isExporting ? 'מרנדר MP4...' : `ייצא MP4 (${exportAspectRatio === '9:16' ? '9:16' : exportAspectRatio === '16:9' ? '16:9' : 'מקורי'})`}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace (Player + Timeline + Captions Panel) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 h-full overflow-hidden">
        
        {/* Video Player & Controls (7 cols) */}
        <div className="lg:col-span-7 bg-black flex flex-col justify-between relative border-l border-slate-800/80 min-h-0 h-full overflow-hidden">
          
          {/* Video Container */}
          <div 
            className="flex-1 min-h-0 relative flex items-center justify-center p-3 sm:p-5 overflow-hidden group bg-slate-950/80 cursor-pointer"
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName !== 'VIDEO') return;
              togglePlay();
            }}
          >
            {/* Screen Frame strictly matching selected aspect ratio */}
            <div 
              className="relative max-h-full max-w-full flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl bg-black border border-slate-800/80 transition-all duration-300"
              style={{
                aspectRatio: exportAspectRatio === '9:16' ? '9 / 16' : exportAspectRatio === '16:9' ? '16 / 9' : 'auto'
              }}
            >
              {activeVideoUrl ? (
                <video
                  ref={videoRef}
                  src={activeVideoUrl}
                  controls={false}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => {
                    setIsPlaying(true);
                    syncMusicPreview(true);
                    musicRef.current?.play().catch(() => undefined);
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    musicRef.current?.pause();
                  }}
                  onEnded={() => {
                    setIsPlaying(false);
                    musicRef.current?.pause();
                  }}
                  style={{ filter: `brightness(${brightness}) contrast(${contrast})` }}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div 
                  onClick={() => videoFileInputRef.current?.click()}
                  className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:bg-slate-900/60 transition-colors"
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-indigo-400">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-bold text-white mb-1">לא נטען סרטון לעריכה</h4>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">לחץ כאן כדי להעלות סרטון מהמחשב (MP4 / WebM) או חזור לאולפן כדי להקליט.</p>
                  <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow">
                    <Upload className="w-3.5 h-3.5" /> העלה סרטון עכשיו
                  </button>
                </div>
              )}

              {musicUrl && (
                <audio
                  ref={musicRef}
                  src={musicUrl}
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const value = e.currentTarget.duration;
                    setMusicDuration(Number.isFinite(value) ? value : 0);
                    e.currentTarget.volume = musicVolume;
                    syncMusicPreview(true);
                  }}
                  onError={() => onError('לא ניתן לקרוא את פס הקול. נסה קובץ MP3 או MP4 אחר.')}
                />
              )}

              {/* Center Play Overlay when paused */}
              {activeVideoUrl && !isPlaying && !isExporting && (
                <div 
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors pointer-events-auto z-10"
                >
                  <div className="w-16 h-16 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl transform transition-transform group-hover:scale-110">
                    <Play className="w-8 h-8 fill-current ml-1" />
                  </div>
                </div>
              )}

              {/* Live Visual Overlay (Hook Cover / B-Roll / PiP) */}
              {(() => {
                const activeOverlay = visualOverlays.find(o => currentTime >= o.startTime && currentTime <= o.endTime);
                if (!activeOverlay) return null;

                if (activeOverlay.type === 'hook-cover' || activeOverlay.type === 'b-roll-full') {
                  return (
                    <div className="absolute inset-0 z-15 pointer-events-none animate-in fade-in duration-300">
                      <img 
                        src={activeOverlay.imageUrl} 
                        alt="Overlay"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                } else if (activeOverlay.type === 'pip-corner') {
                  return (
                    <div className="absolute top-10 sm:top-14 left-4 z-15 pointer-events-none animate-in zoom-in-95 duration-200">
                      <div className="w-24 sm:w-36 rounded-xl overflow-hidden border-2 border-sky-400 shadow-2xl bg-slate-900">
                        <img 
                          src={activeOverlay.imageUrl} 
                          alt="PiP"
                          className="w-full h-auto object-cover"
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Top Headline Hook Bar Overlay */}
              {headlineText && !isExporting && (
                <div className="absolute top-4 sm:top-6 left-0 right-0 px-4 text-center pointer-events-none z-20 animate-in slide-in-from-top-2">
                  <span className="inline-block max-w-[94%] px-4 py-2 rounded-2xl bg-slate-900/90 text-white font-black text-xs sm:text-sm md:text-base border border-indigo-500/60 shadow-2xl backdrop-blur-md">
                    {headlineText}
                  </span>
                </div>
              )}

              {activeCaption && !isExporting && <CaptionPreview caption={activeCaption} time={currentTime} style={subtitleStyle} karaoke={karaokeEnabled} />}

            </div>

            {/* Exporting Progress Overlay */}
            {isExporting && (
              <div className="absolute inset-0 z-50 bg-slate-950/90 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
                <Loader className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <h4 className="text-xl font-bold text-white mb-2">מרנדר וידאו MP4 באיכות סטודיו...</h4>
                <p className="text-xs text-slate-400 mb-6">{exportStatusText}</p>
                <div className="w-full max-w-xs h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-rose-500 rounded-full transition-all duration-150"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-indigo-400 mt-2">{exportProgress}%</span>
              </div>
            )}
          </div>

          {/* Bottom Trimming & Video Tuning Bar */}
          <div className="bg-slate-900/90 border-t border-slate-800 p-4 space-y-3 z-10">
            
            {/* Trim Boundary Controllers & Auto Silence Cut */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-300">
              <div className="flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                <span>חיתוך קצוות:</span>

                <button
                  onClick={handleAutoDetectSilence}
                  disabled={isDetectingSilence}
                  className="px-2.5 py-1 bg-gradient-to-r from-indigo-950 to-rose-950 hover:from-indigo-900 hover:to-rose-900 border border-indigo-700/60 text-indigo-200 rounded-lg text-xs flex items-center gap-1 font-bold shadow transition-all cursor-pointer disabled:opacity-50"
                  title="מזהה שתיקות בתחילת וסוף הסרטון וחותך אותן אוטומטית לקבלת קצב מהודק"
                >
                  {isDetectingSilence ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                  <span>חיתוך שתיקות אוטומטי ✂️</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setTrimStart(Number(currentTime.toFixed(2)));
                    setHasCustomTrim(true);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                >
                  התחלה: {trimStart.toFixed(1)}s [קבע מכאן]
                </button>

                <button
                  onClick={() => {
                    setTrimEnd(Number(currentTime.toFixed(2)));
                    setHasCustomTrim(true);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                >
                  סיום: {(trimEnd || duration).toFixed(1)}s [קבע מכאן]
                </button>

                {hasCustomTrim && (
                  <button
                    onClick={() => {
                      setTrimStart(0);
                      setTrimEnd(duration);
                      setHasCustomTrim(false);
                    }}
                    className="px-2 py-1 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-lg transition-colors cursor-pointer"
                  >
                    אפס חיתוך
                  </button>
                )}
              </div>

              {/* Video Enhancement Sliders */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-slate-400" />
                  <span className="text-[11px] text-slate-400">בהירות:</span>
                  <input
                    type="range"
                    min="0.8"
                    max="1.4"
                    step="0.05"
                    value={brightness}
                    onChange={(e) => setBrightness(parseFloat(e.target.value))}
                    className="w-16 accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Independent voice and music mixer */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Music className="w-4 h-4 text-fuchsia-400" />
                  <span>מוזיקת רקע</span>
                  {musicFile && (
                    <span className="max-w-[180px] truncate text-[10px] font-medium text-fuchsia-300" title={musicFile.name}>
                      {musicFile.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => musicFileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/40 hover:bg-fuchsia-900/50 text-fuchsia-200 text-[11px] font-bold cursor-pointer"
                  >
                    {musicFile ? 'החלף מוזיקה' : 'הוסף MP3 / MP4'}
                  </button>
                  {musicFile && (
                    <button
                      onClick={removeMusic}
                      className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 cursor-pointer"
                      title="הסר מוזיקה"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <input
                    ref={musicFileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/mp3,video/mp4,audio/mp4,.mp3,.mp4"
                    className="hidden"
                    onChange={handleMusicFileSelected}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-[11px] text-slate-300">
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                  <span className="min-w-[62px]">קול מקורי</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={sourceVolume}
                    onChange={(e) => setSourceVolume(Number(e.target.value))}
                    className="flex-1 accent-sky-500 cursor-pointer"
                  />
                  <span className="w-8 text-left text-slate-400">{Math.round(sourceVolume * 100)}%</span>
                </label>
                <label className={`flex items-center gap-2 text-[11px] ${musicFile ? 'text-slate-300' : 'text-slate-600'}`}>
                  <Music className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span className="min-w-[62px]">מוזיקה</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={musicVolume}
                    disabled={!musicFile}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="flex-1 accent-fuchsia-500 cursor-pointer disabled:opacity-40"
                  />
                  <span className="w-8 text-left text-slate-400">{Math.round(musicVolume * 100)}%</span>
                </label>
              </div>

              {musicFile && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
                  <div className="flex items-center gap-1.5">
                    <Repeat2 className="w-3.5 h-3.5 text-fuchsia-400" />
                    {([
                      ['auto', 'חכם'],
                      ['loop', 'לופ'],
                      ['trim', 'קיצור']
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setMusicFitMode(mode);
                          setTimeout(() => syncMusicPreview(true), 0);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors ${
                          musicFitMode === mode
                            ? 'bg-fuchsia-600 border-fuchsia-400 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {musicDuration > 0 ? `אורך טרק: ${musicDuration.toFixed(1)} שנ׳ · סרטון: ${editedDuration.toFixed(1)} שנ׳` : 'קורא את אורך הטרק...'}
                    {musicFitMode === 'auto' && musicDuration > 0 && (
                      <> · {musicDuration < editedDuration ? 'יופעל לופ אוטומטי' : 'ייחתך בסוף הסרטון'}</>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Custom Range Timeline Bar */}
            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.05"
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCurrentTime(val);
                  if (videoRef.current) {
                    videoRef.current.currentTime = val;
                  }
                }}
                className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Playhead Info & Shortcuts Helper */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <div>
                זמן נוכחי: <span className="text-white font-bold">{currentTime.toFixed(1)}s</span> מתוך <span className="text-white font-bold">{duration.toFixed(1)}s</span>
              </div>
              <div>
                💡 קיצור מקלדת: <span className="text-slate-300 font-bold">Space</span> לניגון/עצירה, <span className="text-slate-300 font-bold">חיצים ימינה/שמאלה</span> להזזת שנייה
              </div>
            </div>

          </div>
        </div>

        {/* Subtitle Studio & Editing Panel (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 flex flex-col justify-between border-r border-slate-800/80 min-h-0 h-full overflow-hidden">
          
          {/* Subtitle Panel Header & Overlay Options */}
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Palette className="w-4 h-4 text-indigo-400" />
                <span>עיצוב כתוביות וכותרות</span>
                {referenceScript && (
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md font-medium">
                    עוגן תסריט פעיל ✓
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {captions.length > 0 && (
                  <button
                    onClick={handleProofreadCaptions}
                    disabled={isProofreading}
                    title="סריקת כתוביות והגהה לשונית לתיקון שגיאות כתיב והומופונים בעברית"
                    className="px-2.5 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isProofreading ? <Loader className="w-3 h-3 animate-spin text-indigo-300" /> : <Sparkles className="w-3 h-3 text-indigo-300" />}
                    <span>{isProofreading ? 'מגיה כתיב...' : 'הגהת כתיב AI'}</span>
                  </button>
                )}

                <button
                  onClick={handleAutoCaptions}
                  disabled={isGeneratingCaptions}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isGeneratingCaptions ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isGeneratingCaptions ? 'מתמלל ב-AI...' : 'תמלל אוטומטית'}</span>
                </button>
              </div>
            </div>

            {/* Top Headline Hook Bar Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <Type className="w-3 h-3 text-indigo-400" />
                <span>כותרת עליונה קבועה (Headline Hook Bar):</span>
              </label>
              <input
                type="text"
                dir="rtl"
                value={headlineText}
                onChange={(e) => setHeadlineText(e.target.value)}
                placeholder="למשל: למה כשהילד צועק הוא בעצם נבהל?"
                className="w-full bg-slate-800/80 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
              />
            </div>

            {/* Style Selector Buttons - 4 Brand Karaoke Styles */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSubtitleStyle('karaoke-yellow')}
                className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  subtitleStyle === 'karaoke-yellow'
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFE600]" />
                <span>🟨 צהוב ויראלי (Hormozi)</span>
              </button>

              <button
                onClick={() => setSubtitleStyle('karaoke-brand-cyan')}
                className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  subtitleStyle === 'karaoke-brand-cyan'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                <span>🔷 תכלת מצפן הלב (מותג)</span>
              </button>

              <button
                onClick={() => setSubtitleStyle('karaoke-clean-floating')}
                className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  subtitleStyle === 'karaoke-clean-floating'
                    ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-sm'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span>🫧 קריוקי צף (ללא רקע שחור)</span>
              </button>

              <button
                onClick={() => setSubtitleStyle('karaoke-brand-coral')}
                className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  subtitleStyle === 'karaoke-brand-coral'
                    ? 'bg-rose-500/20 border-rose-400 text-rose-300 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#FB7185]" />
                <span>💖 קורל חם (רגש ולב)</span>
              </button>
            </div>

            {/* Karaoke Highlight Toggle & Ripple Sync Switch */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between bg-indigo-950/40 p-2 rounded-xl border border-indigo-500/30">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-bold text-white">קריוקי זוהר</span>
                </div>
                <button
                  onClick={() => setKaraokeEnabled(prev => !prev)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    karaokeEnabled ? 'bg-amber-500 text-slate-950 shadow' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {karaokeEnabled ? 'פעיל ✓' : 'כבוי'}
                </button>
              </div>

              <div className="flex items-center justify-between bg-indigo-950/40 p-2 rounded-xl border border-indigo-500/30">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-bold text-white">סנכרון שרשרת</span>
                </div>
                <button
                  aria-label="סנכרון שרשרת כתוביות" aria-pressed={rippleSync}
                  onClick={() => setRippleSync(prev => !prev)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    rippleSync ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {rippleSync ? 'פעיל ✓' : 'כבוי'}
                </button>
              </div>
            </div>

            {/* Subtitle Global Operations */}
            {captions.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <div className="flex items-center gap-1">
                    <span>הזזה:</span>
                    <button
                      onClick={() => shiftAllCaptions(-0.5)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                      title="הקדמת כל הכתוביות בחצי שנייה"
                    >
                      -0.5s
                    </button>
                    <button
                      onClick={() => shiftAllCaptions(-0.1)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                      title="הקדמת כל הכתוביות ב-0.1 שניות"
                    >
                      -0.1s
                    </button>
                    <button
                      onClick={() => shiftAllCaptions(0.1)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                      title="איחור כל הכתוביות ב-0.1 שניות"
                    >
                      +0.1s
                    </button>
                    <button
                      onClick={() => shiftAllCaptions(0.5)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                      title="איחור כל הכתוביות בחצי שנייה"
                    >
                      +0.5s
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSplitLongCaptions}
                      className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/30 rounded text-indigo-300 hover:text-white cursor-pointer flex items-center gap-1"
                      title="פיצול כתוביות ארוכות למקטעים קצרים שלא עולים על 2 שורות"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>פצל כתוביות ארוכות</span>
                    </button>
                    <button
                      onClick={snapCaptionsContiguous}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                      title="הצמדת סופי כתוביות לתחילת הבאה"
                    >
                      הצמד רצף
                    </button>
                    <button
                      onClick={stretchCaptionsToDuration}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                      title="מתיחת ויישור כל הכתוביות באופן פרופורציונלי לאורך כל משך הסרטון"
                    >
                      פרוס לסוף הסרטון
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Subtitles Scrollable List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {captions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 py-12">
                <Subtitles className="w-10 h-10 mb-3 opacity-30 text-indigo-400" />
                <p className="text-sm font-bold text-slate-300 mb-1">עדיין אין כתוביות</p>
                <p className="text-xs max-w-xs text-slate-400 mb-4">לחץ על "תמלל אוטומטית" ליצירת כתוביות AI מדויקות, או הוסף כתובית ידנית.</p>
                <button
                  onClick={addCaption}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-400" /> הוסף כתובית ראשונה
                </button>
              </div>
            ) : (
              captions.map((cap, idx) => {
                const isCurrentActive = captionIsActive(cap, currentTime);
                return (
                  <div
                    key={cap.id}
                    className={`p-3.5 rounded-xl border transition-all duration-150 ${
                      isCurrentActive
                        ? 'bg-indigo-950/50 border-indigo-500/70 shadow-lg'
                        : 'bg-slate-800/50 border-slate-750 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-700 text-[10px] font-bold text-slate-300 flex items-center justify-center">
                          {idx + 1}
                        </span>

                        {/* Jump to Caption Segment */}
                        <button
                          onClick={() => playCaptionSegment(cap)}
                          className="px-2.5 py-1 bg-slate-700/80 hover:bg-indigo-600 text-xs font-bold text-slate-200 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{cap.start.toFixed(3)}s - {cap.end.toFixed(3)}s</span>
                        </button>
                      </div>

                      {/* Fine Tune Buttons & Delete */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCaptionStartToCurrent(cap.id)}
                          title={rippleSync ? "קבע התחלה לזמן הנגן הנוכחי והזז אוטומטית את כל הבאות" : "קבע התחלה לזמן הנגן הנוכחי"}
                          className="px-2 py-1 bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-bold rounded flex items-center gap-1 shadow cursor-pointer"
                        >
                          <Clock className="w-3 h-3" />
                          <span>התחל כעת</span>
                        </button>
                        <button
                          onClick={() => setCaptionEndToCurrent(cap.id)}
                          title={rippleSync ? "קבע סיום בזמן הנגן והזז את הבאות באותו הפרש" : "קבע סיום בזמן הנגן"}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 rounded cursor-pointer"
                        >
                          סיים כעת
                        </button>
                        <button
                          onClick={() => deleteCaption(cap.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="מחק כתובית"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Caption Text Input */}
                    <input
                      type="text"
                      dir="rtl"
                      aria-label="טקסט כתובית"
                      value={cap.text}
                      onChange={(e) => updateCaptionText(cap.id, e.target.value)}
                      className="w-full bg-slate-900/90 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none transition-colors"
                    />

                    <div className="flex gap-2 mt-2 text-xs text-slate-300">
                      <label>התחלה <CaptionTimeInput label="תחילת כתובית" value={cap.start} max={duration}
                        onCommit={at => applyCaptionStartUpdate(cap.id, at)} className="w-20 p-1 bg-slate-900 border border-slate-700 rounded" /></label>
                      <label>סיום <CaptionTimeInput label="סיום כתובית" value={cap.end} min={cap.start + 0.08} max={duration}
                        onCommit={at => applyCaptionEndUpdate(cap.id, at)} className="w-20 p-1 bg-slate-900 border border-slate-700 rounded" /></label>
                    </div>
                    {/* Fine Adjustment Timestamps & Quick Ripple Controls */}
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <span className="font-bold">התחלה:</span>
                        <button onClick={() => nudgeCaptionStart(cap.id, -0.5)} className="px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 font-bold cursor-pointer" title="הקדמת התחלה בחצי שנייה">-0.5s</button>
                        <button onClick={() => nudgeCaptionStart(cap.id, -0.1)} className="px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 font-bold cursor-pointer">-0.1s</button>
                        <button onClick={() => nudgeCaptionStart(cap.id, 0.1)} className="px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 font-bold cursor-pointer">+0.1s</button>
                        <button onClick={() => nudgeCaptionStart(cap.id, 0.5)} className="px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 font-bold cursor-pointer" title="איחור התחלה בחצי שנייה">+0.5s</button>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="font-bold">סיום:</span>
                        <button onClick={() => nudgeCaptionEnd(cap.id, -0.2)} className="px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 cursor-pointer">-0.2s</button>
                        <button onClick={() => nudgeCaptionEnd(cap.id, 0.2)} className="px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 cursor-pointer">+0.2s</button>
                      </div>

                      {/* Manual Ripple button for this specific caption */}
                      {idx < captions.length - 1 && (
                        <div className="hidden sm:flex items-center gap-1 border-r border-slate-700 pr-2 mr-1">
                          <span className="text-indigo-400 font-bold">הזז הבאות:</span>
                          <button
                            onClick={() => shiftSubsequentCaptions(captions[idx + 1].id, -0.3)}
                            className="px-1.5 py-0.5 bg-slate-800 hover:bg-indigo-600 rounded text-slate-300 text-[10px] cursor-pointer"
                            title="הקדמת כל השורות הבאות ב-0.3 שניות"
                          >
                            -0.3s
                          </button>
                          <button
                            onClick={() => shiftSubsequentCaptions(captions[idx + 1].id, 0.3)}
                            className="px-1.5 py-0.5 bg-slate-800 hover:bg-indigo-600 rounded text-slate-300 text-[10px] cursor-pointer"
                            title="איחור כל השורות הבאות ב-0.3 שניות"
                          >
                            +0.3s
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {/* Add Caption Bottom Action */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/95">
            <button
              onClick={addCaption}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-slate-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>הוסף כתובית במיקום הנוכחי ({currentTime.toFixed(1)}s)</span>
            </button>
          </div>

        </div>

      </div>

      {/* Zero-Bloat Modular Visual Overlays Drawer */}
      {isOverlayDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">שכבות מדיה ויזואליות (B-Roll & Hook)</h3>
              </div>
              <button
                onClick={() => setIsOverlayDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Quick Preset Actions */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400">הוסף שכבה חדשה:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Hook Cover Card */}
                  <label className="flex flex-col items-center justify-center p-3.5 bg-gradient-to-br from-amber-500/10 to-indigo-500/10 hover:from-amber-500/20 hover:to-indigo-500/20 border border-amber-500/30 rounded-xl cursor-pointer transition-all text-center group">
                    <Sparkles className="w-6 h-6 text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-white">הוק פתיחה</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">0.0s עד 2.5s</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'hook-cover')}
                    />
                  </label>

                  {/* Full B-Roll Image */}
                  <label className="flex flex-col items-center justify-center p-3.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl cursor-pointer transition-all text-center group">
                    <ImageIcon className="w-6 h-6 text-sky-400 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-white">B-Roll מלא</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">כיסוי מלא ברקע</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'b-roll-full')}
                    />
                  </label>

                  {/* Corner PiP Card */}
                  <label className="flex flex-col items-center justify-center p-3.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl cursor-pointer transition-all text-center group">
                    <Layers className="w-6 h-6 text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-white">חלון צף (PiP)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">תמונה פינתית צפה</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'pip-corner')}
                    />
                  </label>

                </div>
              </div>

              {/* Active Overlays List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">שכבות פעילות בסרטון ({visualOverlays.length}):</span>
                  {visualOverlays.length > 0 && (
                    <button
                      onClick={() => setVisualOverlays([])}
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                    >
                      נקה הכל
                    </button>
                  )}
                </div>

                {visualOverlays.length === 0 ? (
                  <div className="p-6 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                    אין שכבות מדיה פעילות כרגע. לחץ על אחד הכפתורים למעלה כדי להוסיף תמונה.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {visualOverlays.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-800/70 border border-slate-700/80 rounded-xl flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={item.imageUrl}
                            alt="thumb"
                            className="w-12 h-12 rounded-lg object-cover border border-slate-600 bg-black shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">{item.title}</span>
                              <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-medium">
                                {item.type === 'hook-cover' ? 'הוק פתיחה' : (item.type === 'pip-corner' ? 'PiP' : 'B-Roll')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                              <span>התחלה:</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={item.startTime}
                                onChange={(e) => updateOverlayTimes(item.id, parseFloat(e.target.value) || 0, item.endTime)}
                                className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white text-center font-bold"
                              />
                              <span>סיום:</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0.5"
                                value={item.endTime}
                                onChange={(e) => updateOverlayTimes(item.id, item.startTime, parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white text-center font-bold"
                              />
                              <span>שניות</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => removeVisualOverlay(item.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
                          title="מחק שכבה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
              <button
                onClick={() => setIsOverlayDrawerOpen(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                סגור ושמור שינויים
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
