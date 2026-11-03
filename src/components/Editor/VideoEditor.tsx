import { CaptionPreview } from './CaptionPreview';
import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowRight, Download, Save, Scissors, Subtitles, 
  Trash2, Plus, Play, Pause, RotateCcw, Loader, 
  Sparkles, Sliders, Check, FileText, Palette, Clock,
  FastForward, Rewind, Zap, PlayCircle, Layers, MoveHorizontal, 
  Target, VolumeX, Volume2, Type, Sparkle, Smartphone, Monitor,
  Image as ImageIcon, X, Upload, Eye, Music, Repeat2, Scan, Shield
} from 'lucide-react';
import { CaptionTimeInput } from './CaptionTimeInput';
import { updateCaptionTiming, shiftAllCaptionsList, captionIsActive } from '../../services/captionTiming';
import { CaptionItem, SubtitleStyle, VideoAspectRatio, VisualOverlayItem } from '../../types/studio';
import { generateCaptionsFromVideoBlob, proofreadHebrewCaptions } from '../../services/geminiService';
import { 
  exportVideoToMP4, 
  exportCaptionsToSRT, 
  drawStudioSubtitle, 
  detectAudioSilence,
  splitLongCaptions
} from '../../services/mp4ExportService';

interface VideoEditorProps {
  active?: boolean;
  videoBlob: Blob | null;
  videoUrl: string | null;
  initialDuration?: number;
  referenceScript?: string;
  onBackToStudio: () => void;
  onVideoUploaded?: (blob: Blob, url: string) => void;
  onError: (msg: string) => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({
  active = true,
  videoBlob,
  videoUrl,
  initialDuration = 0,
  referenceScript = '',
  onBackToStudio,
  onVideoUploaded,
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
  const [videoFitMode, setVideoFitMode] = useState<'cover' | 'contain'>('cover');
  const [showSafeZones, setShowSafeZones] = useState(true);

  // Immersive TikTok/Reels Floating HUD Controls
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [activeEditorDrawer, setActiveEditorDrawer] = useState<"none" | "captions" | "style" | "music" | "trim">("none");

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
  const [rippleSync, setRippleSync] = useState(true); // Auto-cascade shift to captions (forward & backward)
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-indigo-500');
      setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500);
    }
  };

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
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setCaptions([]);
    setCurrentTime(0);
    setHasCustomTrim(false);
    if (onVideoUploaded) {
      onVideoUploaded(file, url);
    }
  };

  useEffect(() => {
    if (!active) { videoRef.current?.pause(); musicRef.current?.pause(); setIsPlaying(false); }
  }, [active]);

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
      if (!active) return;
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
  }, [active, isPlaying, duration, hasCustomTrim, trimEnd, trimStart]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight
      });
    }
    const validDur = (Number.isFinite(dur) && dur > 0) ? dur : (initialDuration || 0);
    if (validDur > 0) {
      const maxDur = validDur;
      setDuration(maxDur);
      if (!hasCustomTrim) {
        setTrimEnd(maxDur);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || isExporting) return;
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
    let targetBlob = activeVideoBlob;
    if (!targetBlob && activeVideoUrl) {
      try {
        const res = await fetch(activeVideoUrl);
        targetBlob = await res.blob();
      } catch (e) {
        console.warn('Could not fetch blob from activeVideoUrl:', e);
      }
    }
    if (!targetBlob) {
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
      setCaptions(corrected);
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
    const liveDur = (videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) ? videoRef.current.duration : duration;
    setCaptions(previous => updateCaptionTiming(previous, id, 'start', value, {
      ripple: overrideRipple ?? rippleSync, duration: liveDur, bidirectionalRipple: false,
    }));
  };
  const applyCaptionEndUpdate = (id: number, value: number) => {
    const liveDur = (videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) ? videoRef.current.duration : duration;
    setCaptions(previous => updateCaptionTiming(previous, id, 'end', value, { ripple: rippleSync, duration: liveDur }));
  };
  const nudgeCaptionStart = (id: number, delta: number) => {
    setCaptions(previous => {
      const item = previous.find(cap => cap.id === id);
      return item ? updateCaptionTiming(previous, id, 'start', item.start + delta, { ripple: rippleSync, duration, bidirectionalRipple: false }) : previous;
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
  const pinCaption = (id: number, field: 'start' | 'end') => {
    const at = pinTime();
    const liveDuration = Number.isFinite(videoRef.current?.duration) ? videoRef.current!.duration : duration;
    const result = updateCaptionTiming(captions, id, field, at, { ripple: rippleSync, duration: liveDuration });
    setCaptions(result);
    const applied = result.find(cap => cap.id === id)?.[field] ?? at;
    setSyncFeedback(Math.abs(applied - at) > .001
      ? `הזמן הוגבל ל-${applied.toFixed(3)} שניות כדי לא לדחוס כתוביות בגבולות הסרטון. אפשר לכבות סנכרון שרשרת.`
      : `ה${field === 'start' ? 'תחלה' : 'סיום'} נקבעה ל-${applied.toFixed(3)} שניות. הכתוביות הקודמות נשמרו.`);
    setTimeout(() => setSyncFeedback(null), 4000);
  };
  const setCaptionStartToCurrent = (id: number) => pinCaption(id, 'start');
  const setCaptionEndToCurrent = (id: number) => pinCaption(id, 'end');
  const shiftSubsequentCaptions = (id: number, delta: number) => nudgeTail(id, delta);
  const nudgeTail = (id: number, delta: number) => {
    setCaptions(previous => {
      const item = previous.find(cap => cap.id === id);
      return item ? updateCaptionTiming(previous, id, 'start', item.start + delta, { ripple: true, duration, bidirectionalRipple: false }) : previous;
    });
  };
  const shiftAllCaptions = (delta: number) => {
    setCaptions(prev => {
      const shifted = shiftAllCaptionsList(prev, delta, duration);
      const actual = shifted.length && prev.length ? shifted[0].start - [...prev].sort((a,b) => a.start-b.start)[0].start : 0;
      setSyncFeedback(`כל הכתוביות הוזזו ב-${actual.toFixed(3)} שניות, ללא שינוי במשכים.`);
      setTimeout(() => setSyncFeedback(null), 3000);
      return shifted;
    });
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
        videoBlob: activeVideoBlob,
        captions,
        visualOverlays,
        trimStart,
        trimEnd: trimEnd || duration,
        brightness,
        contrast,
        subtitleStyle,
        exportAspectRatio,
        videoFitMode,
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

      // Download with verified MIME extension (true MP4 vs WebM)
      const isWebm = mp4Blob.type.includes('webm');
      const ext = isWebm ? 'webm' : 'mp4';
      const formatTag = exportAspectRatio === '9:16' ? 'reels_9x16' : 'youtube_16x9';
      const url = URL.createObjectURL(mp4Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heart_compass_${formatTag}_${Date.now()}.${ext}`;
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
    const srtContent = exportCaptionsToSRT(captions, trimStart, trimEnd || duration);
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
  // Display caption: active playback caption, or preview first caption when paused at 0
  const displayCaption = activeCaption || (!isPlaying && currentTime <= (captions[0]?.start ?? 0) && captions.length > 0 ? captions[0] : null);

  const isPortrait = exportAspectRatio === '9:16' || 
    (exportAspectRatio === 'original' && (!videoDimensions || videoDimensions.height >= videoDimensions.width));

  const frameAspectRatio = exportAspectRatio === '9:16' 
    ? '9 / 16' 
    : exportAspectRatio === '16:9' 
      ? '16 / 9' 
      : (videoDimensions ? `${videoDimensions.width} / ${videoDimensions.height}` : '9 / 16');

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
            accept="video/*,video/mp4,video/webm,video/quicktime,video/mov,.mp4,.webm,.mov,.m4v" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            className="hidden"
            onChange={handleVideoFileSelected}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-70px)] sm:h-[calc(100vh-80px)] bg-slate-950 overflow-hidden flex items-center justify-center p-0 sm:py-2 select-none font-sans">

      {/* Centered Phone Canvas Stage - strictly 9:16 portrait on desktop or 16:9 */}
      <div 
        id="editor-stage"
        style={
          exportAspectRatio === '9:16'
            ? { aspectRatio: '9 / 16', height: '100%', width: 'auto', maxHeight: '100%', maxWidth: '100%' }
            : exportAspectRatio === '16:9'
              ? { aspectRatio: '16 / 9', width: '100%', height: 'auto', maxHeight: '100%', maxWidth: '1200px' }
              : { aspectRatio: frameAspectRatio, height: isPortrait ? '100%' : 'auto', width: isPortrait ? 'auto' : '100%', maxHeight: '100%', maxWidth: '100%' }
        }
        className="relative flex items-center justify-center bg-black overflow-hidden transition-all duration-300 sm:rounded-3xl sm:border sm:border-slate-800/80 sm:shadow-[0_0_60px_rgba(0,0,0,0.85)]"
        onClick={(e) => {
          if (activeEditorDrawer !== 'none') {
            setActiveEditorDrawer('none');
            return;
          }
          const target = e.target as HTMLElement;
          if (target.tagName === 'VIDEO' || target.id === 'editor-stage') {
            setIsUiHidden(prev => !prev);
          }
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
              if (isExporting) return;
              setIsPlaying(true);
              syncMusicPreview(true);
              musicRef.current?.play().catch(() => undefined);
            }}
            onPause={() => {
              if (isExporting) return;
              setIsPlaying(false);
              musicRef.current?.pause();
            }}
            onEnded={() => {
              setIsPlaying(false);
              musicRef.current?.pause();
            }}
            style={{ filter: `brightness(${brightness}) contrast(${contrast})` }}
            className={`w-full h-full transition-all duration-200 ${
              exportAspectRatio === '9:16' && videoFitMode === 'cover' ? 'object-cover' : 'object-contain'
            }`}
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
            className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors pointer-events-auto z-10 cursor-pointer"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-indigo-600 to-rose-600 hover:opacity-95 text-white flex items-center justify-center shadow-2xl transform transition-transform hover:scale-110 active:scale-95">
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
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
            <span className="inline-block max-w-[94%] px-3.5 py-1.5 rounded-2xl bg-slate-900/90 text-white font-black text-xs sm:text-sm md:text-base border border-indigo-500/60 shadow-2xl backdrop-blur-md">
              {headlineText}
            </span>
          </div>
        )}

        {/* Social Safe Zones Overlay (TikTok / Reels / Shorts HUD) */}
        {exportAspectRatio === '9:16' && showSafeZones && !isExporting && (
          <div className="absolute inset-0 pointer-events-none z-25 overflow-hidden select-none animate-in fade-in duration-200">
            {/* Top Bar Danger Zone */}
            <div className="absolute top-0 inset-x-0 h-[10%] bg-rose-500/20 border-b-2 border-dashed border-rose-400/70 flex items-center justify-center backdrop-blur-[1px]">
              <span className="px-2 py-0.5 rounded bg-black/70 text-rose-300 text-[9px] sm:text-[10px] font-bold">
                🚫 שטח עליון חסום (חיפוש / תפריטים)
              </span>
            </div>

            {/* Right Engagement Column Danger Zone */}
            <div className="absolute right-0 top-[30%] bottom-[22%] w-[18%] min-w-[46px] bg-rose-500/15 border-l-2 border-dashed border-rose-400/70 flex flex-col items-center justify-around py-2.5 backdrop-blur-[1px]">
              <div className="w-5 h-5 rounded-full border border-rose-300/60 bg-black/60 flex items-center justify-center text-[8px]">👤</div>
              <div className="w-5 h-5 rounded-full border border-rose-300/60 bg-black/60 flex items-center justify-center text-[8px]">❤️</div>
              <div className="w-5 h-5 rounded-full border border-rose-300/60 bg-black/60 flex items-center justify-center text-[8px]">💬</div>
              <div className="w-5 h-5 rounded-full border border-rose-300/60 bg-black/60 flex items-center justify-center text-[8px]">↗️</div>
              <div className="w-5 h-5 rounded-full border border-rose-300/60 bg-black/60 flex items-center justify-center text-[8px]">🎵</div>
              <span className="text-[7px] font-bold text-rose-300/90 text-center leading-tight">
                כפתורי<br />רשת
              </span>
            </div>

            {/* Bottom Danger Zone */}
            <div className="absolute bottom-0 inset-x-0 h-[22%] bg-rose-500/20 border-t-2 border-dashed border-rose-400/70 flex flex-col items-center justify-center gap-0.5 backdrop-blur-[1px]">
              <span className="px-2 py-0.5 rounded bg-black/70 text-rose-300 text-[9px] sm:text-[10px] font-bold">
                🚫 שטח תחתון חסום (שם יוצר, כיתוב, סאונד)
              </span>
              <span className="text-[8.5px] text-slate-300/80">
                הצב את הכתוביות מעל לקו זה
              </span>
            </div>

            {/* Center Safe Box Guide */}
            <div className="absolute top-[11%] bottom-[23%] left-[4%] right-[19%] border-2 border-dashed border-emerald-400/70 rounded-xl pointer-events-none flex items-start justify-start p-2">
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-400/60 text-emerald-300 text-[8.5px] font-black tracking-wide">
                ✅ אזור בטוח לכתוביות ופנים
              </span>
            </div>
          </div>
        )}

        {displayCaption && !isExporting && <CaptionPreview caption={displayCaption} time={currentTime} style={subtitleStyle} karaoke={karaokeEnabled} />}

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

        {/* 2. FLOATING TOP HORIZONTAL GLASS BAR - ANCHORED INSIDE STAGE */}
        <div className={`absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-auto transition-all duration-300 ${
          isUiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Left: Back to Studio Button */}
          <button
            onClick={onBackToStudio}
            className="px-2.5 sm:px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1.5 shadow-xl hover:bg-black/80 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>אולפן</span>
          </button>

          {/* Center: Format Switcher Glass Pill */}
          <div className="flex items-center bg-black/60 backdrop-blur-xl p-1 rounded-full border border-white/20 shadow-xl">
            <button
              onClick={() => setExportAspectRatio('9:16')}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                exportAspectRatio === '9:16'
                  ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>9:16</span>
            </button>
            <button
              onClick={() => setExportAspectRatio('16:9')}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                exportAspectRatio === '16:9'
                  ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">16:9</span>
            </button>
            {exportAspectRatio === '9:16' && (
              <button
                onClick={() => setVideoFitMode(prev => prev === 'cover' ? 'contain' : 'cover')}
                className="ml-1 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-bold flex items-center gap-0.5 cursor-pointer transition-all"
                title={videoFitMode === 'cover' ? 'מצב: מילוי מסך מלא (Cover)' : 'מצב: התאמת שוליים'}
              >
                <Scan className="w-3 h-3 text-indigo-300" />
                <span>{videoFitMode === 'cover' ? 'מילוי' : 'שוליים'}</span>
              </button>
            )}
          </div>

          {/* Right: Export Button + Clean View Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setIsUiHidden(prev => !prev)}
              title="תצוגה נקייה ללא סרגלים (הקש במסך לחזרה)"
              className="px-2 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1 shadow-xl cursor-pointer active:scale-95 transition-all"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-300" />
              <span className="hidden sm:inline">נקי</span>
            </button>

            <button
              onClick={handleExportMP4}
              disabled={isExporting}
              className="px-3 sm:px-4 py-1.5 bg-gradient-to-r from-emerald-500 via-indigo-600 to-rose-600 hover:opacity-95 text-white rounded-full text-xs font-black flex items-center gap-1.5 shadow-xl shadow-emerald-500/30 border border-emerald-400/40 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
              title="ייצא סרטון MP4"
            >
              {isExporting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>{isExporting ? 'מרנדר...' : 'ייצא MP4'}</span>
            </button>
          </div>
        </div>

        {/* 3. TIKTOK / CAPCUT RIGHT VERTICAL GLASS TOOLS RAIL - ANCHORED INSIDE STAGE */}
        <div className={`absolute top-14 right-2 sm:right-2.5 z-30 flex flex-col gap-1.5 sm:gap-2 items-center pointer-events-auto transition-all duration-300 ${
          isUiHidden ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100 translate-x-0'
        }`}>
          {/* Auto Captions AI */}
          <button
            onClick={handleAutoCaptions}
            disabled={isGeneratingCaptions || !activeVideoUrl}
            title="תמלול כתוביות AI אוטומטי של הסרטון"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:opacity-95 active:scale-90 transition-all cursor-pointer disabled:opacity-50 border border-amber-300/40"
          >
            {isGeneratingCaptions ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-200" />}
            <span>תמלול</span>
          </button>

          {/* Captions Drawer Toggle */}
          <button
            onClick={() => setActiveEditorDrawer(prev => prev === 'captions' ? 'none' : 'captions')}
            title="עריכת כתוביות וסנכרון"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeEditorDrawer === 'captions' ? 'bg-indigo-600/50 border-indigo-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Subtitles className="w-3.5 h-3.5 text-indigo-300" />
            <span>כתוביות</span>
          </button>

          {/* Subtitle Style & Headline Drawer Toggle */}
          <button
            onClick={() => setActiveEditorDrawer(prev => prev === 'style' ? 'none' : 'style')}
            title="עיצוב סגנון כתוביות וכותרת עליונה"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeEditorDrawer === 'style' ? 'bg-indigo-600/50 border-indigo-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-amber-300" />
            <span>סגנון</span>
          </button>

          {/* Music & Sound Mix Drawer Toggle */}
          <button
            onClick={() => setActiveEditorDrawer(prev => prev === 'music' ? 'none' : 'music')}
            title="מיקס מוזיקת רקע וקול"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeEditorDrawer === 'music' || musicFile ? 'bg-fuchsia-600/40 border-fuchsia-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5 text-fuchsia-300" />
            <span>מוזיקה</span>
          </button>

          {/* Trimming & Cut Drawer Toggle */}
          <button
            onClick={() => setActiveEditorDrawer(prev => prev === 'trim' ? 'none' : 'trim')}
            title="חיתוך קצוות ושתיקות"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeEditorDrawer === 'trim' || hasCustomTrim ? 'bg-indigo-600/50 border-indigo-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Scissors className="w-3.5 h-3.5 text-sky-300" />
            <span>חיתוך</span>
          </button>

          {/* Media Overlays (B-Roll) */}
          <button
            onClick={() => setIsOverlayDrawerOpen(true)}
            title="שכבות תמונות, הוק פתיחה ו-B-Roll"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              visualOverlays.length > 0 ? 'bg-sky-600/40 border-sky-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-sky-300" />
            <span>שכבות</span>
          </button>

          {/* Social Safe Zones Toggle */}
          {exportAspectRatio === '9:16' && (
            <button
              onClick={() => setShowSafeZones(prev => !prev)}
              title="אזורי בטיחות לסושיאל (TikTok / Reels / Shorts)"
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
                showSafeZones ? 'bg-rose-500/30 border-rose-400 text-rose-300' : 'bg-black/60 border-white/20 text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-rose-400" />
              <span>בטיחות</span>
            </button>
          )}

          {/* SRT Download */}
          {captions.length > 0 && (
            <button
              onClick={handleExportSRT}
              title="הורד קובץ כתוביות SRT"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-300" />
              <span>SRT</span>
            </button>
          )}
        </div>

        {/* 4. SLIDE-UP TRANSLUCENT BOTTOM SHEETS - ANCHORED INSIDE STAGE */}
        {activeEditorDrawer !== 'none' && (
          <div className="absolute bottom-0 inset-x-0 z-40 max-h-[64vh] bg-slate-900/95 backdrop-blur-2xl rounded-t-3xl border-t border-slate-700/80 p-3.5 sm:p-5 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300 text-white text-xs">
            
            {/* Drawer Top Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs sm:text-sm flex items-center gap-1.5">
                  {activeEditorDrawer === 'captions' && <><Subtitles className="w-4 h-4 text-indigo-400" /> כתוביות ({captions.length})</>}
                  {activeEditorDrawer === 'style' && <><Palette className="w-4 h-4 text-amber-400" /> עיצוב כתוביות וכותרת</>}
                  {activeEditorDrawer === 'music' && <><Music className="w-4 h-4 text-fuchsia-400" /> מוזיקת רקע וקול</>}
                  {activeEditorDrawer === 'trim' && <><Scissors className="w-4 h-4 text-sky-400" /> חיתוך ושתיקות</>}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {activeEditorDrawer === 'captions' && (
                  <>
                    <button
                      onClick={addCaption}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> הוסף
                    </button>
                    {captions.length > 0 && (
                      <button
                        onClick={handleProofreadCaptions}
                        disabled={isProofreading}
                        className="px-2 py-1 bg-indigo-950 border border-indigo-500/40 text-indigo-200 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isProofreading ? <Loader className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-indigo-300" />}
                        <span>הגהה AI</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  onClick={() => setActiveEditorDrawer('none')}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
                  title="סגור חלונית"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Content Body */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">

              {/* Captions Drawer Content */}
              {activeEditorDrawer === 'captions' && (
                <div className="space-y-2.5">
                  {/* Timing Shift Helpers */}
                  {captions.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 rounded-xl bg-black/40 border border-white/10 text-[10px]">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 font-bold ml-0.5">הזזה:</span>
                        <button onClick={() => shiftAllCaptions(-0.1)} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer">-0.1s</button>
                        <button onClick={() => shiftAllCaptions(0.1)} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer">+0.1s</button>
                        <button onClick={() => shiftAllCaptions(0.5)} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer">+0.5s</button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={handleSplitLongCaptions} className="px-1.5 py-0.5 bg-indigo-950 border border-indigo-500/30 rounded text-indigo-300 hover:text-white cursor-pointer">פצל</button>
                        <button onClick={snapCaptionsContiguous} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer">הצמד</button>
                      </div>
                    </div>
                  )}

                  {/* Captions List */}
                  {captions.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <p className="font-bold mb-2">אין כתוביות כרגע לסרטון זה.</p>
                      <button
                        onClick={handleAutoCaptions}
                        disabled={isGeneratingCaptions}
                        className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-indigo-600 text-white rounded-xl font-bold text-xs shadow cursor-pointer"
                      >
                        ✨ תמלל אוטומטית עכשיו בעזרת AI
                      </button>
                    </div>
                  ) : (
                    captions.map((cap, idx) => {
                      const isCurrentActive = captionIsActive(cap, currentTime);
                      return (
                        <div
                          key={cap.id}
                          className={`p-2.5 rounded-xl border transition-all ${
                            isCurrentActive ? 'bg-indigo-950/60 border-indigo-500/80 shadow-md' : 'bg-slate-800/40 border-slate-700/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-slate-700 text-[9px] font-bold text-slate-300 flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <button
                                onClick={() => playCaptionSegment(cap)}
                                className="px-1.5 py-0.5 bg-slate-700/70 hover:bg-indigo-600 text-[9.5px] font-bold rounded flex items-center gap-1 cursor-pointer"
                              >
                                <Play className="w-2 h-2 fill-current" />
                                <span>{cap.start.toFixed(2)}s - {cap.end.toFixed(2)}s</span>
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setCaptionStartToCurrent(cap.id)}
                                className="px-1.5 py-0.5 bg-indigo-600/80 hover:bg-indigo-500 text-white text-[9.5px] font-bold rounded cursor-pointer"
                              >
                                התחל כאן
                              </button>
                              <button
                                onClick={() => deleteCaption(cap.id)}
                                className="p-0.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                                title="מחק כתובית"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <input
                            type="text"
                            dir="rtl"
                            value={cap.text}
                            onChange={(e) => updateCaptionText(cap.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-xs font-bold text-white focus:outline-none"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Subtitle Style & Headline Drawer Content */}
              {activeEditorDrawer === 'style' && (
                <div className="space-y-3.5">
                  {/* Top Headline Hook Banner */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 mb-1">
                      <Type className="w-3.5 h-3.5 text-indigo-400" />
                      <span>כותרת עליונה קבועה (Headline Hook Bar):</span>
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={headlineText}
                      onChange={(e) => setHeadlineText(e.target.value)}
                      placeholder="למשל: למה כשהילד צועק הוא בעצם נבהל?"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
                    />
                  </div>

                  {/* Style Selector Grid */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1.5">בחר סגנון קריוקי:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSubtitleStyle('karaoke-yellow')}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          subtitleStyle === 'karaoke-yellow' ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow' : 'bg-slate-800/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FFE600]" />
                        <span>🟨 צהוב ויראלי (Hormozi)</span>
                      </button>

                      <button
                        onClick={() => setSubtitleStyle('karaoke-brand-cyan')}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          subtitleStyle === 'karaoke-brand-cyan' ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow' : 'bg-slate-800/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                        <span>🔷 תכלת מותג</span>
                      </button>

                      <button
                        onClick={() => setSubtitleStyle('karaoke-clean-floating')}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          subtitleStyle === 'karaoke-clean-floating' ? 'bg-indigo-600/30 border-indigo-400 text-white shadow' : 'bg-slate-800/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        <span>🫧 קריוקי צף נקי</span>
                      </button>

                      <button
                        onClick={() => setSubtitleStyle('karaoke-brand-coral')}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          subtitleStyle === 'karaoke-brand-coral' ? 'bg-rose-500/20 border-rose-400 text-rose-300 shadow' : 'bg-slate-800/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FB7185]" />
                        <span>💖 קורל חם</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10">
                    <span className="font-bold text-xs">הדגשת מילה פעילה (קריוקי חי)</span>
                    <input
                      type="checkbox"
                      checked={karaokeEnabled}
                      onChange={(e) => setKaraokeEnabled(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4 rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Music & Audio Mix Drawer Content */}
              {activeEditorDrawer === 'music' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-fuchsia-400" />
                      <div>
                        <div className="font-bold text-white text-xs">פס קול רקע (MP3/MP4)</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{musicFile ? musicFile.name : 'לא נבחר קובץ מוזיקה'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => musicFileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        {musicFile ? 'החלף' : 'בחר מוזיקה'}
                      </button>
                      {musicFile && (
                        <button
                          onClick={removeMusic}
                          className="p-1 bg-rose-950/60 border border-rose-500/40 text-rose-300 rounded-lg cursor-pointer"
                          title="הסר מוזיקה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1 text-[11px]">
                      <span>עוצמת דיבור (קול מקורי):</span>
                      <span className="font-bold text-sky-400">{Math.round(sourceVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={sourceVolume}
                      onChange={(e) => setSourceVolume(Number(e.target.value))}
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1 text-[11px]">
                      <span>עוצמת מוזיקת רקע:</span>
                      <span className="font-bold text-fuchsia-400">{Math.round(musicVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={musicVolume}
                      disabled={!musicFile}
                      onChange={(e) => setMusicVolume(Number(e.target.value))}
                      className="w-full accent-fuchsia-500 cursor-pointer disabled:opacity-40"
                    />
                  </div>
                </div>
              )}

              {/* Trimming Drawer Content */}
              {activeEditorDrawer === 'trim' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10">
                    <span className="font-bold text-white text-xs">חיתוך שתיקות אוטומטי</span>
                    <button
                      onClick={handleAutoDetectSilence}
                      disabled={isDetectingSilence}
                      className="px-3 py-1 bg-gradient-to-r from-indigo-950 to-rose-950 border border-indigo-500/50 text-indigo-200 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isDetectingSilence ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                      <span>חתוך שתיקות ✂️</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => {
                        setTrimStart(Number(currentTime.toFixed(2)));
                        setHasCustomTrim(true);
                      }}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold cursor-pointer"
                    >
                      התחלה: {trimStart.toFixed(1)}s
                    </button>
                    <button
                      onClick={() => {
                        setTrimEnd(Number(currentTime.toFixed(2)));
                        setHasCustomTrim(true);
                      }}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold cursor-pointer"
                    >
                      סיום: {(trimEnd || duration).toFixed(1)}s
                    </button>
                  </div>

                  {hasCustomTrim && (
                    <button
                      onClick={() => {
                        setTrimStart(0);
                        setTrimEnd(duration);
                        setHasCustomTrim(false);
                      }}
                      className="w-full py-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl font-bold text-xs cursor-pointer"
                    >
                      אפס חיתוך
                    </button>
                  )}

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1 text-[11px]">
                      <span>בהירות וידאו:</span>
                      <span className="font-bold text-amber-300">{Math.round(brightness * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.8"
                      max="1.4"
                      step="0.05"
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* 5. FLOATING BOTTOM GLASS SCRUBBER & PLAY BAR - ANCHORED INSIDE STAGE */}
        <div className={`absolute bottom-4 inset-x-3 sm:inset-x-6 z-30 pointer-events-auto transition-all duration-300 ${
          isUiHidden || activeEditorDrawer !== 'none' ? 'opacity-0 pointer-events-none translate-y-3' : 'opacity-100 translate-y-0'
        }`}>
          <div className="bg-black/65 backdrop-blur-xl border border-white/20 px-3.5 py-2 rounded-2xl shadow-2xl flex items-center gap-2.5">
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer shrink-0"
              title={isPlaying ? 'השהה' : 'נגן'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

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
              className="flex-1 accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />

            <span className="text-[10px] font-mono font-bold text-slate-300 whitespace-nowrap shrink-0">
              {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Floating Eye indicator when UI is hidden */}
        {isUiHidden && (
          <button
            onClick={() => setIsUiHidden(false)}
            className="absolute bottom-4 right-4 z-40 p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
            title="הצג סרגלים"
          >
            <Eye className="w-4 h-4 text-cyan-300" />
          </button>
        )}

      </div>

      {/* Zero-Bloat Modular Visual Overlays Drawer Modal */}
      {isOverlayDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 text-white">
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

      {/* Hidden file input for media overlays */}
      <input
        ref={videoFileInputRef}
        type="file"
        accept="video/*,video/mp4,video/webm,video/quicktime,video/mov,.mp4,.webm,.mov,.m4v"
        className="hidden"
        onChange={handleVideoFileSelected}
      />
      <input
        ref={musicFileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,video/mp4,audio/mp4,.mp3,.mp4"
        className="hidden"
        onChange={handleMusicFileSelected}
      />

    </div>
  );
};
