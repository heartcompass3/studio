import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Mic, Square, Play, Pause, RotateCcw, 
  Lightbulb, Volume2, StopCircle, Loader, Download, 
  Scissors, Settings2, Sliders, Smartphone, Monitor, 
  FlipHorizontal, Eye, ZoomIn, ZoomOut, Image as ImageIcon,
  Sparkles, Upload, Sun, Check, Sparkle, ArrowLeft, ArrowRight,
  Gauge, Type, Video, Layers, Palette, Plus, Trash2, Music
} from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { Teleprompter } from './Teleprompter';
import { generateAudioFromText } from '../../services/geminiService';
import { VideoAspectRatio, RecordingMode, BackgroundSourceType, BackgroundSlide } from '../../types/studio';
import { fixWebmDuration } from '../../services/webmFixer';
import { createBoostedAudioPipeline, BoostedAudioResult } from '../../services/audioService';
import { VoiceAudioEffects, VOICE_AUDIO_PRESETS } from '../../services/meditationAudio';

interface RecordingStudioProps {
  scriptText: string;
  onVideoRecorded: (blob: Blob, url: string, duration?: number) => void;
  onOpenEditor: () => void;
  onError: (msg: string) => void;
}

const PRESET_GRADIENTS = [
  { id: 'deep-indigo', name: 'אינדיגו עמוק (מותג)', style: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #020617 100%)', colorA: '#0f172a', colorB: '#1e1b4b', colorC: '#020617' },
  { id: 'warm-amber', name: 'חמימות והקשבה', style: 'linear-gradient(135deg, #1c1917 0%, #451a03 50%, #0c0a09 100%)', colorA: '#1c1917', colorB: '#451a03', colorC: '#0c0a09' },
  { id: 'midnight-rose', name: 'מצפן הלב (סגול-רוז)', style: 'linear-gradient(135deg, #1e1b4b 0%, #4c0519 50%, #0f172a 100%)', colorA: '#1e1b4b', colorB: '#4c0519', colorC: '#0f172a' },
  { id: 'calm-cyan', name: 'שקט וקרקוע', style: 'linear-gradient(135deg, #022c22 0%, #082f49 50%, #020617 100%)', colorA: '#022c22', colorB: '#082f49', colorC: '#020617' },
];

export const RecordingStudio: React.FC<RecordingStudioProps> = ({
  scriptText,
  onVideoRecorded,
  onOpenEditor,
  onError
}) => {
  // Studio Mode: Camera Video OR Voiceover & B-Roll / Slideshow
  const [studioMode, setStudioMode] = useState<RecordingMode>('camera');

  // Microphone Volume Boost (Web Audio Processor - 100% to 400%)
  const [micGain, setMicGain] = useState<number>(1.2); // Moderate gain avoids lifting the room noise floor
  const [showMicControls, setShowMicControls] = useState<boolean>(false);
  const boostedAudioPipelineRef = useRef<BoostedAudioResult | null>(null);

  const [voiceEffects, setVoiceEffects] = useState<VoiceAudioEffects>(VOICE_AUDIO_PRESETS.speech);
  const voiceEffectsRef = useRef<VoiceAudioEffects>(VOICE_AUDIO_PRESETS.speech);
  const updateVoiceEffects = (next: VoiceAudioEffects) => {
    voiceEffectsRef.current = next;
    setVoiceEffects(next);
    boostedAudioPipelineRef.current?.setEffects(next);
    const tracks = [...(streamRef.current?.getAudioTracks() || []), ...(micStreamRef.current?.getAudioTracks() || [])];
    for (const track of tracks) void track.applyConstraints({
      noiseSuppression: next.noiseReduction !== false, echoCancellation: true, autoGainControl: false,
    }).catch(() => onError('לא ניתן לשנות את סינון המיקרופון במכשיר הזה בזמן ההקלטה. ההגדרה הנוכחית נשמרת.'));
  };

  // Camera & Stream State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [isMirrored, setIsMirrored] = useState(true);

  // Digital Zoom State (1.0x - 3.0x)
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showZoomBar, setShowZoomBar] = useState(false);

  // Voiceover / Faceless B-Roll & Slideshow State
  const [bgSourceType, setBgSourceType] = useState<BackgroundSourceType>('gradient');
  const [bgVideoUrl, setBgVideoUrl] = useState<string | null>(null);
  const [bgSlides, setBgSlides] = useState<BackgroundSlide[]>([]);
  const [slideDurationSec, setSlideDurationSec] = useState(5);
  const [selectedGradient, setSelectedGradient] = useState(PRESET_GRADIENTS[0].id);
  const [isAudioOnlyRecording, setIsAudioOnlyRecording] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Teleprompter Controls
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2);
  const [teleprompterRestartSignal, setTeleprompterRestartSignal] = useState(0);
  const [fontSize, setFontSize] = useState(32);
  const [textOpacity, setTextOpacity] = useState(0.85);
  const [showPrompterSettings, setShowPrompterSettings] = useState(false);

  // Lighting & Video Filter
  const [brightness, setBrightness] = useState(1);
  const [ringLight, setRingLight] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // TTS State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartingRef = useRef(false);
  const recordStartTimeRef = useRef<number>(0);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgVideoInputRef = useRef<HTMLInputElement>(null);
  const bgImagesInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const loadedSlideImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      boostedAudioPipelineRef.current?.cleanup();
      stopCamera();
      stopMic();
    };
  }, []);

  // Update recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  // Preload slide images whenever bgSlides change
  useEffect(() => {
    bgSlides.forEach(slide => {
      if (!loadedSlideImagesRef.current.has(slide.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = slide.url;
        img.onload = () => {
          loadedSlideImagesRef.current.set(slide.id, img);
        };
      }
    });
  }, [bgSlides]);

  const startCamera = async () => {
    stopCamera();
    setIsCameraLoading(true);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: aspectRatio === '9:16' ? 1080 : 1920 },
          height: { ideal: aspectRatio === '9:16' ? 1920 : 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: voiceEffectsRef.current.noiseReduction !== false,
          autoGainControl: false,
          sampleRate: 48000
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('Video play warning:', e);
        }
      }

      setIsCameraActive(true);
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      setRecordedUrl(null);
      setRecordedBlob(null);
    } catch (err: any) {
      console.error('Camera Access Error:', err);
      onError('לא ניתן לגשת למצלמה. אנא ודא הרשאות בדפדפן (סמל המנעול ליד שורת הכתובת).');
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsRecording(false);
  };

  const startMic = async (): Promise<MediaStream | null> => {
    stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: voiceEffectsRef.current.noiseReduction !== false,
          autoGainControl: false,
          sampleRate: 48000
        },
        video: false
      });
      micStreamRef.current = stream;
      setMicStream(stream);
      return stream;
    } catch (err) {
      console.error('Mic Access Error:', err);
      onError('לא ניתן לגשת למיקרופון. אנא ודא הרשאות בדפדפן.');
      return null;
    }
  };

  const stopMic = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
      micStreamRef.current = null;
      setMicStream(null);
    }
  };

  const handleModeChange = (mode: RecordingMode) => {
    if (isRecording || recordingStartingRef.current || countdownTimerRef.current) return;
    setStudioMode(mode);
    if (mode === 'camera') {
      stopMic();
      startCamera();
    } else {
      stopCamera();
      startMic();
    }
  };

  const handleUploadBgVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (bgVideoUrl) URL.revokeObjectURL(bgVideoUrl);
    const url = URL.createObjectURL(file);
    setBgVideoUrl(url);
    setBgSourceType('broll-video');
    if (bgVideoRef.current) {
      bgVideoRef.current.src = url;
      bgVideoRef.current.play().catch(() => {});
    }
  };

  const handleUploadBgImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newSlides: BackgroundSlide[] = Array.from(files).map((file, idx) => ({
      id: `slide_${Date.now()}_${idx}`,
      url: URL.createObjectURL(file),
      title: file.name.replace(/\.[^/.]+$/, "")
    }));
    setBgSlides(prev => [...prev, ...newSlides]);
    setBgSourceType('slideshow');
  };

  const removeSlide = (id: string) => {
    setBgSlides(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0 && bgSourceType === 'slideshow') {
        setBgSourceType('gradient');
      }
      return filtered;
    });
  };

  const handleStartRecording = async () => {
    if (isRecording || recordingStartingRef.current || countdownTimerRef.current) return;
    recordingStartingRef.current = true;
    try {
      if (studioMode === 'camera') {
        if (!streamRef.current) {
          await startCamera();
          return;
        }
      } else if (!micStreamRef.current && !(await startMic())) {
        return;
      }
      // Initialize from the user's click, before the countdown, to resume Web Audio.
      const rawTrack = (studioMode === 'camera' ? streamRef.current : micStreamRef.current)?.getAudioTracks()[0];
      boostedAudioPipelineRef.current?.cleanup();
      boostedAudioPipelineRef.current = null;
      if (rawTrack) {
        const pipeline = createBoostedAudioPipeline(new MediaStream([rawTrack]), micGain, voiceEffectsRef.current);
        boostedAudioPipelineRef.current = pipeline;
        try {
          await pipeline.resume();
          if (!pipeline.isProcessed && (voiceEffectsRef.current.bassDb > 0 || voiceEffectsRef.current.reverbMix > 0)) {
            onError('האפקטים לא זמינים בדפדפן הזה. ההקלטה תישמר עם קול המיקרופון המקורי.');
          }
        } catch (error) {
          pipeline.cleanup();
          boostedAudioPipelineRef.current = null;
          onError('עיבוד השמע לא הופעל. ההקלטה תישמר עם קול המיקרופון המקורי.');
        }
      }
      let remaining = 3;
      setCountdown(remaining);
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdown(null);
          void triggerActualRecording();
        } else setCountdown(remaining);
      }, 1000);
    } finally {
      recordingStartingRef.current = false;
    }
  };

  const triggerActualRecording = async () => {
    chunksRef.current = [];
    recordStartTimeRef.current = performance.now();

    const isVertical = aspectRatio === '9:16';
    const outWidth = isVertical ? 1080 : 1920;
    const outHeight = isVertical ? 1920 : 1080;

    let recordStream: MediaStream;
    let canvasLoopId: number | null = null;

    const rawAudioTrack = (studioMode === 'camera' ? streamRef.current : micStreamRef.current)?.getAudioTracks()[0];
    const recordAudioTrack = boostedAudioPipelineRef.current?.processedStream.getAudioTracks()[0] || rawAudioTrack;

    if (studioMode === 'camera') {
      if (!streamRef.current) { boostedAudioPipelineRef.current?.cleanup(); boostedAudioPipelineRef.current = null; return; }

      if (isVertical && videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
        const video = videoRef.current;

        let lastDrawTime = 0;
        const fpsInterval = 1000 / 30; // 30 FPS target for video recording

        const drawLoop = (now: number) => {
          if (!video || video.paused || video.ended) return;
          canvasLoopId = requestAnimationFrame(drawLoop);

          const elapsed = now - lastDrawTime;
          if (elapsed < fpsInterval) return;
          lastDrawTime = now - (elapsed % fpsInterval);

          const vw = video.videoWidth || 1920;
          const vh = video.videoHeight || 1080;

          const targetAspect = 9 / 16;
          const srcAspect = vw / vh;
          let sx = 0, sy = 0, sw = vw, sh = vh;

          if (srcAspect > targetAspect) {
            sw = vh * targetAspect;
            sx = (vw - sw) / 2;
          } else {
            sh = vw / targetAspect;
            sy = (vh - sh) / 2;
          }

          ctx.save();
          if (isMirrored) {
            ctx.translate(outWidth, 0);
            ctx.scale(-1, 1);
          }
          if (brightness !== 1) {
            ctx.filter = `brightness(${brightness})`;
          }
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
          ctx.restore();
        };

        canvasLoopId = requestAnimationFrame(drawLoop);
        const canvasStream = canvas.captureStream(30);
        if (recordAudioTrack) {
          canvasStream.addTrack(recordAudioTrack);
        }
        recordStream = canvasStream;
      } else {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const composite = new MediaStream();
        if (videoTrack) composite.addTrack(videoTrack);
        if (recordAudioTrack) composite.addTrack(recordAudioTrack);
        recordStream = composite;
      }
    } else {
      // Voiceover & Faceless Canvas Compositor
      let activeMic = micStreamRef.current;
      if (!activeMic) {
        activeMic = await startMic();
        if (!activeMic) return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;

      if (bgSourceType === 'broll-video' && bgVideoRef.current) {
        bgVideoRef.current.currentTime = 0;
        bgVideoRef.current.loop = true;
        bgVideoRef.current.play().catch(() => {});
      }

      const selectedGrad = PRESET_GRADIENTS.find(g => g.id === selectedGradient) || PRESET_GRADIENTS[0];
      let lastDrawTime = 0;
      const fpsInterval = 1000 / 30;

      const drawLoop = (now: number) => {
        canvasLoopId = requestAnimationFrame(drawLoop);
        const elapsedSinceLast = now - lastDrawTime;
        if (elapsedSinceLast < fpsInterval) return;
        lastDrawTime = now - (elapsedSinceLast % fpsInterval);

        const elapsedSec = (performance.now() - recordStartTimeRef.current) / 1000;

        if (bgSourceType === 'broll-video' && bgVideoRef.current && !bgVideoRef.current.paused) {
          const bv = bgVideoRef.current;
          const bvw = bv.videoWidth || 1920;
          const bvh = bv.videoHeight || 1080;
          const targetAspect = outWidth / outHeight;
          const srcAspect = bvw / bvh;
          let sx = 0, sy = 0, sw = bvw, sh = bvh;

          if (srcAspect > targetAspect) {
            sw = bvh * targetAspect;
            sx = (bvw - sw) / 2;
          } else {
            sh = bvw / targetAspect;
            sy = (bvh - sh) / 2;
          }

          ctx.drawImage(bv, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
        } else if (bgSourceType === 'slideshow' && bgSlides.length > 0) {
          const currentSlideIndex = Math.floor(elapsedSec / Math.max(2, slideDurationSec)) % bgSlides.length;
          const currentSlide = bgSlides[currentSlideIndex];
          const img = loadedSlideImagesRef.current.get(currentSlide.id);

          if (img && img.complete) {
            // Smooth subtle Ken Burns breathing effect
            const slideProgress = (elapsedSec % slideDurationSec) / slideDurationSec;
            const scale = 1.0 + slideProgress * 0.05;
            const iw = img.naturalWidth || outWidth;
            const ih = img.naturalHeight || outHeight;
            const targetAspect = outWidth / outHeight;
            const srcAspect = iw / ih;
            let sx = 0, sy = 0, sw = iw, sh = ih;

            if (srcAspect > targetAspect) {
              sw = ih * targetAspect;
              sx = (iw - sw) / 2;
            } else {
              sh = iw / targetAspect;
              sy = (ih - sh) / 2;
            }

            ctx.save();
            ctx.translate(outWidth / 2, outHeight / 2);
            ctx.scale(scale, scale);
            ctx.translate(-outWidth / 2, -outHeight / 2);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
            ctx.restore();
          } else {
            // Gradient fallback
            const grad = ctx.createLinearGradient(0, 0, outWidth, outHeight);
            grad.addColorStop(0, selectedGrad.colorA);
            grad.addColorStop(0.5, selectedGrad.colorB);
            grad.addColorStop(1, selectedGrad.colorC);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, outWidth, outHeight);
          }
        } else {
          // Dynamic Atmospheric Gradient
          const angle = (elapsedSec * 0.1) % (Math.PI * 2);
          const x1 = Math.cos(angle) * outWidth;
          const y1 = Math.sin(angle) * outHeight;
          const grad = ctx.createLinearGradient(0, 0, outWidth + x1 * 0.2, outHeight + y1 * 0.2);
          grad.addColorStop(0, selectedGrad.colorA);
          grad.addColorStop(0.5, selectedGrad.colorB);
          grad.addColorStop(1, selectedGrad.colorC);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, outWidth, outHeight);

          // Subtle animated light orb
          const orbX = outWidth / 2 + Math.sin(elapsedSec * 0.8) * (outWidth * 0.25);
          const orbY = outHeight / 2 + Math.cos(elapsedSec * 0.6) * (outHeight * 0.2);
          const radial = ctx.createRadialGradient(orbX, orbY, 10, orbX, orbY, outWidth * 0.6);
          radial.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
          radial.addColorStop(1, 'rgba(15, 23, 42, 0)');
          ctx.fillStyle = radial;
          ctx.fillRect(0, 0, outWidth, outHeight);
        }
      };

      canvasLoopId = requestAnimationFrame(drawLoop);
      const canvasStream = canvas.captureStream(30);
      if (recordAudioTrack) {
        canvasStream.addTrack(recordAudioTrack);
      }
      recordStream = canvasStream;
    }

    let mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordStream, {
        mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192000,
      });
    } catch (error) {
      if (canvasLoopId) cancelAnimationFrame(canvasLoopId);
      boostedAudioPipelineRef.current?.cleanup();
      boostedAudioPipelineRef.current = null;
      onError('לא ניתן להתחיל הקלטה בדפדפן הזה. נסה שוב או בחר דפדפן אחר.');
      return;
    }
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      if (canvasLoopId) cancelAnimationFrame(canvasLoopId);
      if (bgVideoRef.current) bgVideoRef.current.pause();
      if (boostedAudioPipelineRef.current) {
        boostedAudioPipelineRef.current.cleanup();
        boostedAudioPipelineRef.current = null;
      }
      if (chunksRef.current.length === 0) return;
      const rawBlob = new Blob(chunksRef.current, { type: 'video/webm' });
      const exactDurationSecs = Math.max(0.5, (performance.now() - recordStartTimeRef.current) / 1000);
      
      const fixedBlob = await fixWebmDuration(rawBlob, exactDurationSecs * 1000);
      const url = URL.createObjectURL(fixedBlob);

      setRecordedBlob(fixedBlob);
      setRecordedUrl(url);
      setIsScrolling(false);
      onVideoRecorded(fixedBlob, url, exactDurationSecs);
    };

    try {
      recorder.start();
    } catch (error) {
      if (canvasLoopId) cancelAnimationFrame(canvasLoopId);
      boostedAudioPipelineRef.current?.cleanup();
      boostedAudioPipelineRef.current = null;
      onError('ההקלטה לא התחילה. נסה שוב.');
      return;
    }
    setIsRecording(true);
    setIsScrolling(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleRetake = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedUrl(null);
    setRecordedBlob(null);
    if (studioMode === 'camera') {
      startCamera();
    } else {
      startMic();
    }
  };

  const handleDownloadRaw = () => {
    if (!recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = `recording_${Date.now()}.webm`;
    a.click();
  };

  const handleGenerateTTS = async () => {
    if (!scriptText) return;
    setAudioLoading(true);
    try {
      const url = await generateAudioFromText(scriptText);
      setAudioUrl(url);
      setIsPlayingAudio(true);
    } catch (err: any) {
      onError(err.message || 'שגיאה ביצירת קריינות');
    } finally {
      setAudioLoading(false);
    }
  };

  const toggleTTSPlay = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-95px)] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      
      {/* Top Studio Controls Bar */}
      <div className="bg-slate-900/90 backdrop-blur px-6 py-3 border-b border-slate-800 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          
          {/* Main Mode Toggle: Camera vs. Voiceover / Faceless */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-inner">
            <button
              onClick={() => handleModeChange('camera')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                studioMode === 'camera' 
                  ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>מצלמת וידאו</span>
            </button>
            <button
              onClick={() => handleModeChange('voiceover')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                studioMode === 'voiceover' 
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-indigo-400" />
              <span>קריינות ורקעי B-Roll</span>
            </button>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/20 border border-rose-500/40 rounded-full text-rose-400 text-xs font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>מקליט: {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
            </div>
          )}
        </div>

        {/* Action Controls & Format Switcher */}
        <div className="flex items-center gap-2">
          
          {/* Mic Boost Control Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowMicControls(prev => !prev)}
              title="ניקוי רעשים, עוצמה, בס והדהוד לקול"
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                showMicControls
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>צליל הקול</span>
            </button>

            {showMicControls && (
              <div className="absolute top-full left-0 mt-2 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-30 w-72 space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-white">
                  <input type="checkbox" aria-label="ניקוי רעשי רקע" checked={voiceEffects.noiseReduction !== false}
                    onChange={event => updateVoiceEffects({ ...voiceEffects, noiseReduction: event.target.checked })} />
                  ניקוי רעשי רקע
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">סינון המיקרופון וניקוי עדין בין משפטים. רעשים חזקים בזמן הדיבור עדיין עשויים להישמע. להקלטת דיבור צלולה התחל בלי הדהוד ובהגברה נמוכה.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateVoiceEffects(VOICE_AUDIO_PRESETS.speech)} className="px-2 py-1 rounded bg-slate-800 text-xs text-white">דיבור יבש</button>
                  <button type="button" onClick={() => updateVoiceEffects(VOICE_AUDIO_PRESETS.meditation)} className="px-2 py-1 rounded bg-indigo-700 text-xs text-white">מדיטציה עדינה</button>
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>עוצמת הגברה:</span>
                  <span className="text-indigo-400 font-mono">{Math.round(micGain * 100)}%</span>
                </div>
                <input
                  aria-label="עוצמת הגברת מיקרופון"
                  type="range"
                  min="1"
                  max="4"
                  step="0.1"
                  value={micGain}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setMicGain(val);
                    if (boostedAudioPipelineRef.current) {
                      boostedAudioPipelineRef.current.setGain(val);
                    }
                  }}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>100% (רגיל)</span>
                  <span>200%</span>
                  <span>400% (מקסימום)</span>
                </div>
                <label className="block text-xs text-slate-200">
                  בס: {voiceEffects.bassDb} dB
                  <input aria-label="בס לקול" type="range" min="0" max="9" step="0.5" value={voiceEffects.bassDb}
                    onChange={(event) => updateVoiceEffects({ ...voiceEffects, bassDb: Number(event.target.value) })}
                    className="w-full accent-indigo-500" />
                </label>
                <label className="block text-xs text-slate-200">
                  הדהוד: {Math.round(voiceEffects.reverbMix * 100)}%
                  <input aria-label="הדהוד לקול" type="range" min="0" max="0.45" step="0.01" value={voiceEffects.reverbMix}
                    onChange={(event) => updateVoiceEffects({ ...voiceEffects, reverbMix: Number(event.target.value) })}
                    className="w-full accent-indigo-500" />
                </label>
                <p className="text-[11px] leading-relaxed text-slate-400">הבס מוסיף עומק לקול וההדהוד מוסיף מרחב. האפקטים נשמרים בהקלטה; אפשר לשנות אותם גם בזמן ההקלטה. האזן לתוצאה בהשמעה החוזרת.</p>
              </div>
            )}
          </div>

          {/* Prompter Speed & Settings Toggle */}
          <button
            onClick={() => setShowPrompterSettings(prev => !prev)}
            title="בורר מהירות והגדרות טלפרומפטר"
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              showPrompterSettings
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Gauge className="w-3.5 h-3.5 text-indigo-400" />
            <span>מהירות: {scrollSpeed}x</span>
          </button>

          {/* Aspect Ratio Switch */}
          <div className="flex bg-slate-800 p-0.5 rounded-xl border border-slate-700">
            <button
              onClick={() => {
                setAspectRatio('9:16');
                if (studioMode === 'camera' && isCameraActive) startCamera();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                aspectRatio === '9:16' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> 9:16 (רילס)
            </button>
            <button
              onClick={() => {
                setAspectRatio('16:9');
                if (studioMode === 'camera' && isCameraActive) startCamera();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                aspectRatio === '16:9' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> 16:9 (רוחב)
            </button>
          </div>

          {studioMode === 'camera' && (
            <>
              {/* Mirror Camera */}
              <button
                onClick={() => setIsMirrored(prev => !prev)}
                title="היפוך מראה למצלמה"
                className={`p-2 rounded-xl border transition-all ${
                  isMirrored ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>

              {/* Zoom Toggle */}
              <button
                onClick={() => setShowZoomBar(prev => !prev)}
                title="זום דיגיטלי"
                className={`p-2 rounded-xl border transition-all ${
                  showZoomBar ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Lighting Controls */}
              <button
                onClick={() => setShowControls(prev => !prev)}
                title="תאורה וצבע"
                className={`p-2 rounded-xl border transition-all ${
                  showControls ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Voiceover B-Roll & Visuals Selector Bar */}
      {studioMode === 'voiceover' && !recordedUrl && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs z-20 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              בחר רקע ויזואלי:
            </span>

            {/* Background Type Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => bgVideoInputRef.current?.click()}
                className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
                  bgSourceType === 'broll-video' && bgVideoUrl
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-indigo-400" />
                <span>{bgVideoUrl ? 'סרטון רקע נבחר ✓' : 'העלה סרטון רקע (MP4)'}</span>
              </button>
              <input
                ref={bgVideoInputRef}
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={handleUploadBgVideo}
              />

              <button
                onClick={() => bgImagesInputRef.current?.click()}
                className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
                  bgSourceType === 'slideshow' && bgSlides.length > 0
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>{bgSlides.length > 0 ? `מצגת (${bgSlides.length} תמונות) ✓` : 'העלה מצגת תמונות'}</span>
              </button>
              <input
                ref={bgImagesInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleUploadBgImages}
              />

              <button
                onClick={() => setBgSourceType('gradient')}
                className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
                  bgSourceType === 'gradient'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-indigo-400" />
                <span>אווירת גרדיאנט דינמית</span>
              </button>
            </div>
          </div>

          {/* Sub-options for Slideshow / Gradient */}
          {bgSourceType === 'slideshow' && bgSlides.length > 0 && (
            <div className="flex items-center gap-3 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-300 font-bold">החלפת שקופית:</span>
              {[3, 5, 7, 10].map((dur) => (
                <button
                  key={dur}
                  onClick={() => setSlideDurationSec(dur)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    slideDurationSec === dur ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {dur} שניות
                </button>
              ))}
            </div>
          )}

          {bgSourceType === 'gradient' && (
            <div className="flex items-center gap-2">
              {PRESET_GRADIENTS.map((grad) => (
                <button
                  key={grad.id}
                  onClick={() => setSelectedGradient(grad.id)}
                  title={grad.name}
                  style={{ background: grad.style }}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    selectedGradient === grad.id ? 'border-white scale-110 shadow-lg' : 'border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Control Sliders (Prompter / Zoom / Lighting) */}
      {(showPrompterSettings || showZoomBar || showControls) && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300 z-20 animate-in slide-in-from-top duration-200">
          
          {/* Prompter Settings Panel */}
          {showPrompterSettings && (
            <div className="flex flex-wrap items-center justify-between w-full gap-4 pb-1">
              <div className="flex items-center gap-3">
                <span className="font-bold flex items-center gap-1.5 text-white">
                  <Gauge className="w-4 h-4 text-indigo-400" />
                  מהירות טלפרומפטר:
                </span>
                
                <div className="flex items-center gap-1.5 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                  <button
                    onClick={() => setScrollSpeed(prev => Math.max(0.25, Number((prev - 0.25).toFixed(2))))}
                    className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold flex items-center justify-center text-xs shadow-sm"
                    title="האט מהירות ב-0.25x"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="0.25"
                    max="10"
                    step="0.25"
                    value={scrollSpeed}
                    onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                    className="w-24 accent-indigo-500 cursor-pointer h-2 bg-slate-900 rounded-lg"
                    title="כוונן מהירות גלילה"
                  />
                  <button
                    onClick={() => setScrollSpeed(prev => Math.min(10, Number((prev + 0.25).toFixed(2))))}
                    className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold flex items-center justify-center text-xs shadow-sm"
                    title="הגבר מהירות ב-0.25x"
                  >
                    +
                  </button>
                  <span className="font-black text-indigo-400 min-w-[36px] text-center text-xs">
                    {scrollSpeed}x
                  </span>
                </div>

                {/* Preset Speed Buttons */}
                <div className="flex items-center gap-1">
                  {[0.5, 0.75, 1, 1.5, 2, 3, 4].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setScrollSpeed(spd)}
                      className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all ${
                        scrollSpeed === spd
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size & Prompter Play/Pause */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold flex items-center gap-1 text-slate-300">
                    <Type className="w-3.5 h-3.5 text-indigo-400" />
                    גודל גופן: {fontSize}px
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setFontSize(prev => Math.max(20, prev - 2))} className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-xs">-</button>
                    <button onClick={() => setFontSize(prev => Math.min(64, prev + 2))} className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-xs">+</button>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
                  <button
                    onClick={() => setIsScrolling(prev => !prev)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    {isScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{isScrolling ? 'השהה גלילה' : 'הפעל גלילה'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setTeleprompterRestartSignal((value) => value + 1);
                      setIsScrolling(true);
                    }}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl"
                    title="חזור לתחילת הטקסט"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {showZoomBar && (
            <div className="flex items-center gap-3">
              <span className="font-bold flex items-center gap-1.5"><ZoomIn className="w-3.5 h-3.5 text-indigo-400" /> זום: {zoomLevel.toFixed(1)}x</span>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.1"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                className="w-32 accent-indigo-500 cursor-pointer"
              />
              <button
                onClick={() => setZoomLevel(1.0)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-bold"
              >
                איפוס
              </button>
            </div>
          )}

          {showControls && (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="font-bold flex items-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-400" /> בהירות: {Math.round(brightness * 100)}%</span>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={brightness}
                  onChange={(e) => setBrightness(parseFloat(e.target.value))}
                  className="w-28 accent-amber-500 cursor-pointer"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ringLight}
                  onChange={(e) => setRingLight(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span className="font-bold">רינגלייט (מסך לבן מרכך)</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Main Studio Viewport */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden select-none">
        
        {/* Ring Light Effect */}
        {ringLight && (
          <div className="absolute inset-0 pointer-events-none border-[24px] border-white/40 shadow-[inset_0_0_80px_rgba(255,255,255,0.6)] z-10" />
        )}

        {/* 3-2-1 Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-50 bg-black/70 flex flex-col items-center justify-center animate-in fade-in">
            <div className="w-36 h-36 rounded-full bg-indigo-600/90 border-4 border-indigo-400 flex items-center justify-center text-7xl font-black text-white shadow-2xl animate-bounce">
              {countdown}
            </div>
            <p className="text-white text-lg font-bold mt-6 tracking-wide">התכונן... מתחילים להקליט!</p>
          </div>
        )}

        {/* Video Canvas / Stream View */}
        <div className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
          aspectRatio === '9:16' ? 'w-full max-w-[420px] aspect-[9/16] rounded-2xl shadow-2xl border border-slate-800' : 'w-full h-full'
        }`}>
          
          {/* Active Camera Stream */}
          {studioMode === 'camera' && !recordedUrl && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                filter: `brightness(${brightness})`,
                transform: `scale(${isMirrored ? -zoomLevel : zoomLevel}, ${zoomLevel})`
              }}
              className={`w-full h-full object-cover transition-transform duration-100 ${!isCameraActive ? 'hidden' : ''}`}
            />
          )}

          {/* Voiceover Mode Background Visual Viewport */}
          {studioMode === 'voiceover' && !recordedUrl && (
            <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-slate-950">
              
              {/* B-Roll Video Element */}
              {bgSourceType === 'broll-video' && bgVideoUrl ? (
                <video
                  ref={bgVideoRef}
                  src={bgVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : bgSourceType === 'slideshow' && bgSlides.length > 0 ? (
                // Slideshow View
                <div className="w-full h-full relative">
                  <img
                    src={bgSlides[0].url}
                    alt="Slide"
                    className="w-full h-full object-cover animate-pulse duration-1000"
                  />
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-[11px] font-bold text-white">
                    מצגת: {bgSlides.length} תמונות
                  </div>
                </div>
              ) : (
                // Atmospheric Dynamic Motion Background
                <div 
                  className="w-full h-full flex flex-col items-center justify-center text-center p-6 transition-all duration-500"
                  style={{
                    background: (PRESET_GRADIENTS.find(g => g.id === selectedGradient) || PRESET_GRADIENTS[0]).style
                  }}
                >
                  <div className="w-24 h-24 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400 animate-pulse">
                    <Mic className="w-12 h-12" />
                  </div>
                  <h4 className="text-base font-bold text-white mb-1">אולפן קריינות ו-B-Roll</h4>
                  <p className="text-xs text-indigo-200/80 max-w-xs mb-3">הקלט את קולך עם הטלפרומפטר. בסיום תוכל להוסיף כתוביות קריוקי מדויקות או סרטוני רקע!</p>
                </div>
              )}
            </div>
          )}

          {/* Recorded Video Playback Review */}
          {recordedUrl && (
            <div className="w-full h-full relative flex items-center justify-center bg-black">
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Camera Offline Placeholder */}
          {studioMode === 'camera' && !isCameraActive && !recordedUrl && (
            <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-indigo-400 shadow-xl">
                <Camera className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">המצלמה אינה פעילה</h3>
              <p className="text-xs text-slate-400 max-w-xs mb-6">לחץ על הכפתור למטה כדי להפעיל את המצלמה והמיקרופון ולהתחיל בהקלטה.</p>
              <button
                onClick={startCamera}
                disabled={isCameraLoading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
              >
                {isCameraLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                <span>הפעל מצלמה ומיקרופון</span>
              </button>
            </div>
          )}

          {/* Teleprompter Overlay */}
          {((studioMode === 'camera' && isCameraActive) || (studioMode === 'voiceover')) && !recordedUrl && (
            <div className="absolute inset-0 pointer-events-auto z-10">
              <Teleprompter
                text={scriptText || 'כתוב או צור תסריט בלשונית מחולל התסריטים כדי להציג אותו כאן בזמן אמת...'}
                isScrolling={isScrolling}
                scrollSpeed={scrollSpeed}
                fontSize={fontSize}
                opacity={textOpacity}
                isCameraActive={studioMode === 'camera' ? isCameraActive : true}
                isMirrored={studioMode === 'camera' ? isMirrored : false}
                restartSignal={teleprompterRestartSignal}
                onSpeedChange={setScrollSpeed}
                onFontSizeChange={setFontSize}
                onOpacityChange={setTextOpacity}
                onToggleScroll={() => setIsScrolling(prev => !prev)}
                onRestart={() => setIsScrolling(true)}
              />
            </div>
          )}

          {/* Live Audio Visualizer Meter */}
          {!recordedUrl && (
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
              <AudioVisualizer 
                stream={studioMode === 'camera' ? streamRef.current : micStream} 
                isActive={studioMode === 'camera' ? isCameraActive : !!micStream} 
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Studio Action Bar */}
      <div className="bg-slate-900 border-t border-slate-800 px-6 py-4 flex items-center justify-between z-20">
        
        {/* Left Area: Audio TTS / Retake */}
        <div className="flex items-center gap-3">
          {recordedUrl ? (
            <button
              onClick={handleRetake}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" /> הקלט מחדש
            </button>
          ) : studioMode === 'camera' ? (
            <button
              onClick={startCamera}
              disabled={isCameraLoading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
            >
              <Camera className="w-4 h-4 text-indigo-400" /> {isCameraActive ? 'אפס מצלמה' : 'הפעל מצלמה'}
            </button>
          ) : (
            <button
              onClick={startMic}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
            >
              <Mic className="w-4 h-4 text-indigo-400" /> {micStream ? 'מיקרופון פעיל ✓' : 'הפעל מיקרופון'}
            </button>
          )}

          {recordedUrl && (
            <button
              onClick={handleDownloadRaw}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
            >
              <Download className="w-4 h-4" /> הורד הקלטת גלם
            </button>
          )}

          {/* Audio TTS Preview Player */}
          {scriptText && (
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={audioUrl ? toggleTTSPlay : handleGenerateTTS}
                disabled={audioLoading}
                className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700"
              >
                {audioLoading ? (
                  <Loader className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : isPlayingAudio ? (
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                )}
                <span>{audioLoading ? 'מייצר...' : audioUrl ? (isPlayingAudio ? 'השהה קריינות' : 'השמע קריינות') : 'הדגם קריינות AI'}</span>
              </button>

              {audioUrl && (
                <audio
                  ref={audioPlayerRef}
                  src={audioUrl}
                  onEnded={() => setIsPlayingAudio(false)}
                  className="hidden"
                />
              )}
            </div>
          )}
        </div>

        {/* Center: Record / Stop Big Button */}
        <div className="flex items-center gap-3">
          {!recordedUrl ? (
            isRecording ? (
              <button
                onClick={handleStopRecording}
                className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-sm flex items-center gap-3 shadow-xl shadow-rose-600/40 animate-pulse transition-all transform active:scale-95"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>סיים הקלטה</span>
              </button>
            ) : (
              <button
                onClick={handleStartRecording}
                disabled={(studioMode === 'camera' && !isCameraActive) || countdown !== null}
                className="px-8 py-3.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white rounded-2xl font-black text-sm flex items-center gap-3 shadow-xl shadow-rose-600/30 disabled:opacity-40 transition-all transform active:scale-95"
              >
                <div className="w-4 h-4 rounded-full bg-white shadow" />
                <span>{studioMode === 'camera' ? 'התחל הקלטת וידאו (3-2-1)' : 'התחל הקלטת קריינות (3-2-1)'}</span>
              </button>
            )
          ) : (
            <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/30">
              <Check className="w-4 h-4" /> ההקלטה נשמרה בהצלחה!
            </div>
          )}
        </div>

        {/* Right Area: Move to Editor & Subtitles */}
        <div>
          <button
            onClick={onOpenEditor}
            disabled={!recordedBlob}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-40 transition-all transform active:scale-95"
          >
            <span>עבור לעריכה וכתוביות MP4</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
};
