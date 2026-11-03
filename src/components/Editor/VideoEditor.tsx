import { CameraStage } from '../Studio/CameraStage';
import { EditorDraft } from '../../services/studioProject';
import { createMixBus } from '../../services/audioMix';
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
import { CaptionItem, SubtitleStyle, VideoAspectRatio, VisualOverlayItem, TextCalloutItem } from '../../types/studio';
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
  initialDraft?: EditorDraft | null;
  coverTitle?: string;
  onDraftChange?: (draft: EditorDraft) => void;
  onBusyChange?: (busy: boolean) => void;
  videoBlob: Blob | null;
  videoUrl: string | null;
  initialDuration?: number;
  referenceScript?: string;
  onBackToStudio: () => void;
  onVideoUploaded?: (blob: Blob, url: string) => void;
  onError: (msg: string) => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({
  active = true, initialDraft, coverTitle = '', onDraftChange, onBusyChange,
  videoBlob,
  videoUrl,
  initialDuration = 0,
  referenceScript = '',
  onBackToStudio,
  onVideoUploaded,
  onError
}) => {
  const activeVideoUrl = videoUrl;
  const activeVideoBlob = videoBlob;
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [exportAspectRatio, setExportAspectRatio] = useState<VideoAspectRatio>(initialDraft?.exportAspectRatio ?? ('9:16'));
  const [videoFitMode, setVideoFitMode] = useState<'cover' | 'contain'>(initialDraft?.videoFitMode ?? ('cover'));
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Immersive TikTok/Reels Floating HUD Controls
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [activeEditorDrawer, setActiveEditorDrawer] = useState<"none" | "captions" | "style" | "music" | "trim" | "callouts">("none");
  const [captionPositionY, setCaptionPositionY] = useState(initialDraft?.captionPositionY ?? (74));
  const [textCallouts, setTextCallouts] = useState<TextCalloutItem[]>(initialDraft?.textCallouts ?? ([]));
  const [newCalloutText, setNewCalloutText] = useState('');
  const [newCalloutStyle, setNewCalloutStyle] = useState<'viral-badge' | 'neon-glow' | 'warning-box' | 'fire-pill'>('fire-pill');
  const [newCalloutPosY, setNewCalloutPosY] = useState(30);

  // Trimming State
  const [trimStart, setTrimStart] = useState(initialDraft?.trimStart ?? (0));
  const [trimEnd, setTrimEnd] = useState(initialDraft?.trimEnd ?? (initialDuration || 0));
  const [hasCustomTrim, setHasCustomTrim] = useState(initialDraft?.hasCustomTrim ?? (false));
  const [isDetectingSilence, setIsDetectingSilence] = useState(false);

  // Captions & Subtitle Styling
  const [captions, setCaptions] = useState<CaptionItem[]>(initialDraft?.captions ?? ([]));
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [isProofreading, setIsProofreading] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(initialDraft?.subtitleStyle ?? ('karaoke-yellow'));
  const [karaokeEnabled, setKaraokeEnabled] = useState(initialDraft?.karaokeEnabled ?? (true)); // Word-by-word active highlight
  const [headlineText, setHeadlineText] = useState(initialDraft?.headlineText ?? coverTitle); // Top headline banner
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
  const [visualOverlays, setVisualOverlays] = useState<VisualOverlayItem[]>(initialDraft?.visualOverlays ?? ([]));
  const [isOverlayDrawerOpen, setIsOverlayDrawerOpen] = useState(false);

  // Video Enhancements
  const [brightness, setBrightness] = useState(initialDraft?.brightness ?? (1));
  const [contrast, setContrast] = useState(initialDraft?.contrast ?? (1));

  // Two-channel audio mix: original voice/video + background music
  const [sourceVolume, setSourceVolume] = useState(initialDraft?.sourceVolume ?? (1));
  const [musicFile, setMusicFile] = useState<File | null>(initialDraft?.musicFile ?? (null));
  const [musicUrl, setMusicUrl] = useState<string | null>(() => initialDraft?.musicFile ? URL.createObjectURL(initialDraft.musicFile) : null);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicVolume, setMusicVolume] = useState(initialDraft?.musicVolume ?? (0.2));
  const [musicFitMode, setMusicFitMode] = useState<'auto' | 'loop' | 'trim'>(initialDraft?.musicFitMode ?? ('auto'));

  const previousCover = useRef(coverTitle);
  useEffect(() => { if (previousCover.current !== coverTitle) { setHeadlineText(coverTitle); previousCover.current = coverTitle; } }, [coverTitle]);
  useEffect(() => {
    onDraftChange?.({ captions, trimStart, trimEnd, hasCustomTrim, exportAspectRatio, videoFitMode,
      captionPositionY, subtitleStyle, karaokeEnabled, headlineText, textCallouts, visualOverlays,
      brightness, contrast, sourceVolume, musicFile, musicVolume, musicFitMode });
  }, [captions, trimStart, trimEnd, hasCustomTrim, exportAspectRatio, videoFitMode, captionPositionY,
    subtitleStyle, karaokeEnabled, headlineText, textCallouts, visualOverlays, brightness, contrast,
    sourceVolume, musicFile, musicVolume, musicFitMode, onDraftChange]);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  useEffect(() => { onBusyChange?.(isExporting); }, [isExporting, onBusyChange]);
  const [exportedFile, setExportedFile] = useState<File | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // Refs & Web Audio Playback Booster (Mobile-safe amplifier)
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mixRef = useRef<ReturnType<typeof createMixBus> | null>(null);
  const connectedMusicRef = useRef<HTMLAudioElement | null>(null);
  const ensureAudioBooster = () => {
    try {
      if (!audioCtxRef.current && videoRef.current) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        mixRef.current = createMixBus(ctx, ctx.destination);
        ctx.createMediaElementSource(videoRef.current).connect(mixRef.current.source);
      }
      if (audioCtxRef.current && mixRef.current && musicRef.current && connectedMusicRef.current !== musicRef.current) {
        audioCtxRef.current.createMediaElementSource(musicRef.current).connect(mixRef.current.music);
        connectedMusicRef.current = musicRef.current;
      }
      mixRef.current?.setLevels(sourceVolume, musicVolume, isMuted);
      if (audioCtxRef.current?.state === 'suspended') void audioCtxRef.current.resume();
    } catch (error) { console.warn('Audio preview:', error); }
  };
  useEffect(() => {
    mixRef.current?.setLevels(sourceVolume, musicVolume, isMuted);
    if (videoRef.current) { videoRef.current.volume = mixRef.current ? 1 : sourceVolume; videoRef.current.muted = !mixRef.current && isMuted; }
    if (musicRef.current) { musicRef.current.volume = mixRef.current ? 1 : musicVolume; musicRef.current.muted = !mixRef.current && isMuted; }
  }, [sourceVolume, musicVolume, isMuted]);
  useEffect(() => () => { void audioCtxRef.current?.close(); }, []);

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
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) { onError('יש לבחור קובץ וידאו נתמך.'); return; }
    onVideoUploaded?.(file, '');
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
    ensureAudioBooster();
    videoRef.current.muted = mixRef.current ? false : isMuted;
    videoRef.current.volume = mixRef.current ? 1 : (isMuted ? 0 : sourceVolume);
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

  const toggleMute = (e?: React.MouseEvent) => { e?.stopPropagation(); ensureAudioBooster(); setIsMuted(value => !value); };

  const togglePlay = () => {
    if (!videoRef.current) return;
    ensureAudioBooster();
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
      if (videoRef.current.muted && !isMuted) {
        videoRef.current.muted = false;
      }
      videoRef.current.volume = mixRef.current ? 1 : (isMuted ? 0 : sourceVolume);
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
      const items = await generateCaptionsFromVideoBlob(targetBlob, referenceScript, realDur);
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
    videoRef.current.pause(); musicRef.current?.pause(); setIsPlaying(false);
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
        captionPositionY,
        textCallouts,
        onProgress: (pct, msg) => {
          setExportProgress(pct);
          setExportStatusText(msg);
        }
      });

      // Download with verified MIME extension (true MP4 vs WebM)
      const isWebm = mp4Blob.type.includes('webm');
      const ext = isWebm ? 'webm' : 'mp4';
      const formatTag = exportAspectRatio === '9:16' ? 'reels_9x16' : 'youtube_16x9';
      const fileName = `heart_compass_${formatTag}_${Date.now()}.${ext}`;
      const url = URL.createObjectURL(mp4Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setExportedFile(new File([mp4Blob], fileName, { type: mp4Blob.type }));
      setTimeout(() => URL.revokeObjectURL(url), 60000);

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
    <div className={`relative w-full h-full max-h-full bg-slate-950 overflow-hidden flex items-center justify-center p-0 select-none font-sans ${isExporting ? "studio-exporting" : ""}`}>

      {/* Centered Phone Canvas Stage - strictly 9:16 portrait on desktop or 16:9 */}
      <CameraStage id="editor-stage" ratio={exportAspectRatio === '9:16' ? 9 / 16 : exportAspectRatio === '16:9' ? 16 / 9 : (videoDimensions ? videoDimensions.width / videoDimensions.height : 9 / 16)}
        onClick={(e) => {
          if (activeEditorDrawer !== 'none' && !(e.target as HTMLElement).closest('button,input,textarea,select,[role=dialog]')) {
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
            onError={() => onError('לא ניתן לנגן את הקובץ. נסה MP4 או WebM אחר.')}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => {
              if (isExporting) return;
              ensureAudioBooster();
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
              videoFitMode === 'cover' ? 'object-cover' : 'object-contain'
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

        {/* Muted warning pill for mobile audio */}
        {activeVideoUrl && isMuted && isPlaying && !isExporting && (
          <button
            onClick={toggleMute}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xl border border-rose-400/50 animate-bounce cursor-pointer pointer-events-auto"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>הקול מושתק — לחץ כאן להפעלה</span>
          </button>
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

        {/* Pop-up Kinetic Callouts Preview */}
        {(() => {
          const activeCallout = textCallouts.find(c => currentTime >= c.startTime && currentTime <= c.endTime);
          if (!activeCallout || isExporting) return null;
          const badgeStyles =
            activeCallout.style === 'fire-pill' ? 'bg-gradient-to-r from-red-600 to-amber-500 shadow-[0_0_20px_rgba(239,68,68,0.7)] text-white' :
            activeCallout.style === 'neon-glow' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-[0_0_22px_rgba(147,51,234,0.8)] text-white' :
            activeCallout.style === 'warning-box' ? 'bg-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.6)] text-black' :
            'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_20px_rgba(6,182,212,0.7)] text-white';

          return (
            <div 
              className="absolute left-0 right-0 px-4 text-center pointer-events-none z-22 flex justify-center animate-in zoom-in-95 duration-200"
              style={{ top: `${activeCallout.positionY ?? 30}%`, transform: 'translateY(-50%)' }}
            >
              <span className={`inline-block px-4 py-2 rounded-2xl font-black text-xs sm:text-sm md:text-base border border-white/30 backdrop-blur-md shadow-2xl ${badgeStyles}`}>
                {activeCallout.text}
              </span>
            </div>
          );
        })()}

        {displayCaption && !isExporting && (
          <CaptionPreview 
            caption={displayCaption} 
            time={currentTime} 
            style={subtitleStyle} 
            karaoke={karaokeEnabled} 
            positionY={captionPositionY} 
          />
        )}

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
        <div className={`stage-topbar transition-all duration-300 ${
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

          <div className="flex items-center gap-1">
            <button title="שנה יחס תמונה" aria-label="שנה יחס תמונה"
              onClick={() => setExportAspectRatio(value => value === '9:16' ? '16:9' : '9:16')}
              className="px-3 py-1.5 rounded-full bg-black/60 border border-white/20 text-xs font-bold flex items-center gap-1.5">
              {exportAspectRatio === '9:16' ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}<span>{exportAspectRatio}</span>
            </button>
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
              className="px-3 sm:px-4 py-1.5 bg-teal-500 hover:opacity-95 text-white rounded-full text-xs font-black flex items-center gap-1.5 shadow-xl shadow-emerald-500/30 border border-emerald-400/40 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
              title="ייצא סרטון MP4"
            >
              {isExporting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>{isExporting ? 'מרנדר...' : 'ייצא MP4'}</span>
            </button>
          </div>
        </div>

        {exportedFile && typeof navigator.share === 'function' && <button
          onClick={async e => { e.stopPropagation(); try { if (navigator.canShare?.({ files: [exportedFile] })) await navigator.share({ files: [exportedFile], title: 'מצפן הלב' }); else onError('השיתוף אינו נתמך בדפדפן הזה. הקובץ זמין בהורדות.'); } catch (error) { if ((error as Error).name !== 'AbortError') onError('לא ניתן לשתף. הקובץ זמין בהורדות.'); } }}
          className="absolute bottom-24 left-3 z-30 rounded-full bg-teal-600 text-white px-4 py-2 text-xs font-bold">שתף את הסרטון</button>}

        {/* 3. TIKTOK / CAPCUT RIGHT VERTICAL GLASS TOOLS RAIL - ANCHORED INSIDE STAGE */}
        <div aria-label="כלי עריכה צפים" className={`stage-tools transition-all duration-300 ${
          isUiHidden ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100 translate-x-0'
        }`}>
          {/* Auto Captions AI */}
          <button
            onClick={handleAutoCaptions}
            disabled={isGeneratingCaptions || !activeVideoUrl}
            title="תמלול כתוביות AI אוטומטי של הסרטון"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-600 text-white flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:opacity-95 active:scale-90 transition-all cursor-pointer disabled:opacity-50 border border-amber-300/40"
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

          {/* Pop-up Kinetic Callouts */}
          <button
            onClick={() => setActiveEditorDrawer(prev => prev === 'callouts' ? 'none' : 'callouts')}
            title="מדבקות וטקסטים צצים במהלך הסרטון"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeEditorDrawer === 'callouts' || textCallouts.length > 0 ? 'bg-amber-500/40 border-amber-400 text-amber-200 shadow-amber-500/20' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>מדבקות</span>
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

          <button onClick={() => setVideoFitMode(value => value === 'cover' ? 'contain' : 'cover')}
            title="מילוי הפריים או הצגת הסרטון בשלמותו" className="w-10 h-10 rounded-full border border-white/20 text-xs flex flex-col items-center justify-center">
            <Scan className="w-3.5 h-3.5" /><span>{videoFitMode === 'cover' ? 'מילוי' : 'שלם'}</span>
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
          <div role="dialog" aria-label="כלי עריכה" onKeyDown={e => { if (e.key === 'Escape') setActiveEditorDrawer('none'); }} onClick={e => e.stopPropagation()} className="stage-sheet flex flex-col text-white text-xs">
            
            {/* Drawer Top Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs sm:text-sm flex items-center gap-1.5">
                  {activeEditorDrawer === 'captions' && <><Subtitles className="w-4 h-4 text-indigo-400" /> כתוביות ({captions.length})</>}
                  {activeEditorDrawer === 'style' && <><Palette className="w-4 h-4 text-amber-400" /> עיצוב כתוביות וכותרת</>}
                  {activeEditorDrawer === 'music' && <><Music className="w-4 h-4 text-fuchsia-400" /> מוזיקת רקע וקול</>}
                  {activeEditorDrawer === 'trim' && <><Scissors className="w-4 h-4 text-sky-400" /> חיתוך ושתיקות</>}
                  {activeEditorDrawer === 'callouts' && <><Zap className="w-4 h-4 text-amber-400" /> מדבקות וטקסטים צצים ({textCallouts.length})</>}
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

                  {/* Subtitle Height Slider & Presets */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-slate-200">
                        <MoveHorizontal className="w-3.5 h-3.5 text-amber-300 rotate-90" />
                        גובה כתוביות (הגבהה / הנמכה):
                      </span>
                      <span className="text-amber-300 font-mono text-[11px] bg-black/50 px-2 py-0.5 rounded-full border border-amber-400/30">
                        {captionPositionY}% מהחלק העליון
                      </span>
                    </div>

                    <input
                      type="range"
                      min="18"
                      max="82"
                      step="1"
                      value={captionPositionY}
                      onChange={(e) => setCaptionPositionY(parseInt(e.target.value, 10))}
                      className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                    />

                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <button
                        onClick={() => setCaptionPositionY(74)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          captionPositionY === 74 ? 'bg-amber-400/25 border-amber-400 text-amber-200 shadow' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        ⬇️ תחתון (74%)
                      </button>
                      <button
                        onClick={() => setCaptionPositionY(50)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          captionPositionY === 50 ? 'bg-amber-400/25 border-amber-400 text-amber-200 shadow' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        🎯 מרכז (50%)
                      </button>
                      <button
                        onClick={() => setCaptionPositionY(25)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          captionPositionY === 25 ? 'bg-amber-400/25 border-amber-400 text-amber-200 shadow' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        🔝 עליון (25%)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              
              {/* Pop-up Callouts Drawer Content */}
              {activeEditorDrawer === 'callouts' && (
                <div className="space-y-3.5 max-h-[50vh] overflow-y-auto pr-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      הוסף מדבקת טקסט צץ (בזמן הנוכחי: {currentTime.toFixed(1)}s):
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        dir="rtl"
                        value={newCalloutText}
                        onChange={(e) => setNewCalloutText(e.target.value)}
                        placeholder="טקסט צץ, למשל: 🔥 שימו לב לזה!"
                        className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                      />
                      <button
                        onClick={() => {
                          if (!newCalloutText.trim()) return;
                          const callout = {
                            id: `callout_${Date.now()}`,
                            text: newCalloutText.trim(),
                            startTime: Math.max(0, currentTime),
                            endTime: Math.min(duration || 10, currentTime + 2.5),
                            style: newCalloutStyle,
                            positionY: newCalloutPosY
                          };
                          setTextCallouts(prev => [...prev, callout]);
                          setNewCalloutText('');
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-rose-600 hover:opacity-90 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
                      >
                        + הוסף
                      </button>
                    </div>
                  </div>

                  {/* Viral Presets Grid */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1.5">מדבקות ויראליות מוכנות בלחיצה:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { text: '🔥 שימו לב!', style: 'fire-pill' },
                        { text: '💡 תובנה של מיליון דולר', style: 'neon-glow' },
                        { text: '⚠️ טעות נפוצה', style: 'warning-box' },
                        { text: '🎯 טיפ זהב', style: 'viral-badge' },
                        { text: '🤯 לא תאמינו שזה עובד', style: 'fire-pill' },
                        { text: '👇 שמרו לעצמכם', style: 'neon-glow' },
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const callout: TextCalloutItem = {
                              id: `callout_${Date.now()}_${idx}`,
                              text: preset.text,
                              startTime: Math.max(0, currentTime),
                              endTime: Math.min(duration || 10, currentTime + 2.5),
                              style: preset.style as TextCalloutItem['style'],
                              positionY: newCalloutPosY
                            };
                            setTextCallouts(prev => [...prev, callout]);
                          }}
                          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-[10.5px] font-bold text-slate-200 active:scale-95 transition-all cursor-pointer"
                        >
                          {preset.text}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-Distribute Callouts Across Video */}
                  <button
                    onClick={() => {
                      const totalSec = duration || initialDuration || 15;
                      const presets: { text: string; style: TextCalloutItem['style']; time: number }[] = [
                        { text: '🔥 שימו לב!', style: 'fire-pill', time: Math.max(1, totalSec * 0.2) },
                        { text: '💡 התובנה המרכזית', style: 'neon-glow', time: Math.max(3, totalSec * 0.5) },
                        { text: '🎯 טיפ זהב לסיום', style: 'warning-box', time: Math.max(5, totalSec * 0.8) }
                      ];
                      const newItems: TextCalloutItem[] = presets.map((p, i) => ({
                        id: `auto_callout_${Date.now()}_${i}`,
                        text: p.text,
                        startTime: p.time,
                        endTime: Math.min(totalSec, p.time + 2.4),
                        style: p.style,
                        positionY: 28
                      }));
                      setTextCallouts(newItems);
                    }}
                    className="w-full py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-600 hover:opacity-95 text-white rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>פזר אוטומטית 3 מדבקות לאורך הסרטון</span>
                  </button>

                  {/* Callout Style Selector */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">סגנון עיצוב המדבקה:</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => setNewCalloutStyle('fire-pill')}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          newCalloutStyle === 'fire-pill' ? 'bg-red-500/25 border-red-400 text-red-200' : 'bg-slate-800/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        🔥 אש ויראלית
                      </button>
                      <button
                        onClick={() => setNewCalloutStyle('neon-glow')}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          newCalloutStyle === 'neon-glow' ? 'bg-purple-500/25 border-purple-400 text-purple-200' : 'bg-slate-800/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        ⚡ ניאון עתידני
                      </button>
                      <button
                        onClick={() => setNewCalloutStyle('warning-box')}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          newCalloutStyle === 'warning-box' ? 'bg-amber-400/25 border-amber-400 text-amber-200' : 'bg-slate-800/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        ⚠️ התראה בולטת
                      </button>
                      <button
                        onClick={() => setNewCalloutStyle('viral-badge')}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          newCalloutStyle === 'viral-badge' ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200' : 'bg-slate-800/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        💎 תכלת יוקרתי
                      </button>
                    </div>
                  </div>

                  {/* List of active callouts */}
                  {textCallouts.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <label className="text-[10px] font-bold text-slate-400 block">מדבקות קיימות ({textCallouts.length}):</label>
                      {textCallouts.map((callout) => (
                        <div key={callout.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/70 border border-slate-700">
                          <button
                            onClick={() => {
                              setCurrentTime(callout.startTime);
                              if (videoRef.current) videoRef.current.currentTime = callout.startTime;
                            }}
                            className="flex items-center gap-1.5 text-xs font-bold text-white hover:text-amber-300 text-right cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{callout.text}</span>
                            <span className="text-[9px] text-slate-400 font-mono">({callout.startTime.toFixed(1)}s - {callout.endTime.toFixed(1)}s)</span>
                          </button>
                          <button
                            onClick={() => setTextCallouts(prev => prev.filter(c => c.id !== callout.id))}
                            className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                            title="מחק מדבקה"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                      max="2.5"
                      step="0.05"
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

            <button
              onClick={toggleMute}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isMuted 
                  ? 'bg-rose-600/80 text-white border border-rose-400' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white'
              }`}
              title={isMuted ? 'בטל השתקה (הפעל קול)' : 'השתק'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-200" /> : <Volume2 className="w-3.5 h-3.5 text-sky-400" />}
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

      </CameraStage>

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

            <div className="p-4 overflow-y-auto space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {([['hook-cover', 'קאבר פתיחה'], ['b-roll-full', 'תמונת B-Roll'], ['pip-corner', 'תמונה צפה']] as const).map(([type, label]) =>
                  <label key={type} className="rounded-xl p-3 bg-slate-800 cursor-pointer">{label}<input aria-label={label} type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, type)} /></label>)}
              </div>
              {visualOverlays.map(layer => <div key={layer.id} className="flex items-center gap-2 bg-slate-800 p-2 rounded-xl">
                <img src={layer.imageUrl} alt={layer.title} className="w-12 h-12 rounded object-cover" />
                <span className="flex-1">{layer.title}</span>
                <input aria-label="תחילת שכבה" className="w-16 bg-slate-900 p-1" type="number" step="0.1" min="0" value={layer.startTime} onChange={e => updateOverlayTimes(layer.id, Number(e.target.value), layer.endTime)} />
                <input aria-label="סיום שכבה" className="w-16 bg-slate-900 p-1" type="number" step="0.1" min="0" value={layer.endTime} onChange={e => updateOverlayTimes(layer.id, layer.startTime, Number(e.target.value))} />
                <button aria-label="מחק שכבה" onClick={() => removeVisualOverlay(layer.id)}><Trash2 className="w-4 h-4" /></button>
              </div>)}
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
        onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
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
