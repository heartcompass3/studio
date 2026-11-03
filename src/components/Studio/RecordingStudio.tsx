import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Mic, Square, Play, Pause, RotateCcw, 
  Lightbulb, Volume2, StopCircle, Loader, Download, 
  Scissors, Settings2, Sliders, Smartphone, Monitor, 
  FlipHorizontal, Eye, ZoomIn, ZoomOut, Image as ImageIcon,
  Sparkles, Upload, Sun, Check, Sparkle, ArrowLeft, ArrowRight,
  Gauge, Type, Video, Layers, Palette, Plus, Trash2, Music,
  RefreshCw, Scan, X, Star, Clapperboard, Timer
} from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { Teleprompter } from './Teleprompter';
import { generateAudioFromText } from '../../services/geminiService';
import { VideoAspectRatio, RecordingMode, BackgroundSourceType, BackgroundSlide, StudioTake } from '../../types/studio';
import { fixWebmDuration } from '../../services/webmFixer';
import { createBoostedAudioPipeline, BoostedAudioResult } from '../../services/audioService';
import { VoiceAudioEffects, VOICE_AUDIO_PRESETS } from '../../services/meditationAudio';

interface RecordingStudioProps {
  scriptText: string;
  onVideoRecorded: (blob: Blob, url: string, duration?: number) => void;
  onOpenEditor: () => void;
  onOpenOriginalEditor?: () => void;
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
  onOpenOriginalEditor,
  onError
}) => {
  // Studio Mode: Camera Video OR Voiceover & B-Roll / Slideshow
  const [studioMode, setStudioMode] = useState<RecordingMode>('camera');

  // Microphone Volume Boost (Web Audio Processor - 100% to 400%)
  const [micGain, setMicGain] = useState<number>(1.0); // 1.0 = Clean native studio mic level
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
      noiseSuppression: next.noiseReduction !== false, echoCancellation: true, autoGainControl: true,
    }).catch(() => onError('לא ניתן לשנות את סינון המיקרופון במכשיר הזה בזמן ההקלטה. ההגדרה הנוכחית נשמרת.'));
  };

  // Camera & Stream State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [isMirrored, setIsMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [framingMode, setFramingMode] = useState<'cover' | 'wide'>('cover');

  // Lens & Zoom State (1.0x, 1.2x, 1.5x, 2.0x)
  const [zoomLevel, setZoomLevel] = useState(1.0); // Default 1.0x full 9:16 frame
  const [showZoomBar, setShowZoomBar] = useState(false);
  const [hardwareZoomSupported, setHardwareZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number }>({ min: 1.0, max: 3.0, step: 0.1 });
  const [eyeContactAnchor, setEyeContactAnchor] = useState<boolean>(true);

  // Voiceover / Faceless B-Roll & Slideshow State
  const [bgSourceType, setBgSourceType] = useState<BackgroundSourceType>('gradient');
  const [bgVideoUrl, setBgVideoUrl] = useState<string | null>(null);
  const [bgSlides, setBgSlides] = useState<BackgroundSlide[]>([]);
  const [slideDurationSec, setSlideDurationSec] = useState(5);
  const [selectedGradient, setSelectedGradient] = useState(PRESET_GRADIENTS[0].id);
  const [isAudioOnlyRecording, setIsAudioOnlyRecording] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Multi-Take Studio System (Round 2)
  const [takes, setTakes] = useState<StudioTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);

  // Immersive TikTok/Reels Floating HUD Controls
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [activeStudioDrawer, setActiveStudioDrawer] = useState<"none" | "prompter" | "audio" | "lighting" | "takes" | "broll">("none");

  // Next-Gen Controls: Clapper Beeps, Countdown, Hands-Free Trigger, Voice Tracking
  const [countdownDuration, setCountdownDuration] = useState<number>(3); // 0, 3, 5, 10
  const [clapTriggerActive, setClapTriggerActive] = useState<boolean>(false);
  const [voiceTrackMode, setVoiceTrackMode] = useState<boolean>(false);
  const clapDetectorRef = useRef<{ cleanup: () => void } | null>(null);

  const playStudioBeep = (frequency: number, durationMs: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
      setTimeout(() => { ctx.close().catch(() => {}); }, durationMs + 80);
    } catch {}
  };

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
  const recordStopTimeRef = useRef<number | null>(null);
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
      if (mediaRecorderRef.current?.state === 'recording') { recordStopTimeRef.current = performance.now(); mediaRecorderRef.current.stop(); }
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

  const loadVideoDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
    } catch (e) {
      console.warn('enumerateDevices note:', e);
    }
  };

  const startCamera = async (cameraIdOverride?: string, facingOverride?: 'user' | 'environment') => {
    stopCamera();
    setIsCameraLoading(true);
    try {
      const targetFacing = facingOverride || facingMode;
      const targetCameraId = cameraIdOverride !== undefined ? cameraIdOverride : selectedCameraId;

      const videoConstraints: MediaTrackConstraints = {
        aspectRatio: aspectRatio === '9:16' ? { ideal: 9 / 16 } : { ideal: 16 / 9 },
        width: { ideal: aspectRatio === '9:16' ? 1080 : 1920 },
        height: { ideal: aspectRatio === '9:16' ? 1920 : 1080 },
        frameRate: { ideal: 30, max: 60 }
      };

      if (targetCameraId) {
        videoConstraints.deviceId = { exact: targetCameraId };
      } else {
        videoConstraints.facingMode = targetFacing;
      }

      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: voiceEffectsRef.current.noiseReduction !== false,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: { ideal: 1 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {};
        if (capabilities && capabilities.zoom) {
          setHardwareZoomSupported(true);
          const minZ = typeof capabilities.zoom.min === 'number' ? capabilities.zoom.min : 0.5;
          const maxZ = typeof capabilities.zoom.max === 'number' ? capabilities.zoom.max : 3.0;
          const stepZ = typeof capabilities.zoom.step === 'number' ? capabilities.zoom.step : 0.1;
          setZoomRange({ min: minZ, max: maxZ, step: stepZ });
          
          if (zoomLevel >= minZ && zoomLevel <= maxZ) {
            try {
              await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel } as any] });
            } catch (zErr) {}
          }
        } else {
          setHardwareZoomSupported(false);
        }
      }

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

      void loadVideoDevices();
    } catch (err: any) {
      console.error('Camera Access Error:', err);
      onError('לא ניתן לגשת למצלמה. אנא ודא הרשאות בדפדפן (סמל המנעול ליד שורת הכתובת).');
    } finally {
      setIsCameraLoading(false);
    }
  };

  const applyZoom = async (newZoom: number) => {
    const clamped = Math.max(1.0, Math.min(3.0, Number(newZoom.toFixed(1))));
    setZoomLevel(clamped);
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (videoTrack && hardwareZoomSupported) {
      try {
        const hwZoom = Math.max(zoomRange.min, Math.min(zoomRange.max, clamped));
        await videoTrack.applyConstraints({ advanced: [{ zoom: hwZoom } as any] });
      } catch (e) {}
    }
  };

  const toggleFacingMode = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    setSelectedCameraId('');
    setIsMirrored(nextFacing === 'user');
    await startCamera('', nextFacing);
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
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: { ideal: 1 }
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
      // Initialize from the user's click, before the countdown, to resume Web Audio only when requested.
      const rawTrack = (studioMode === 'camera' ? streamRef.current : micStreamRef.current)?.getAudioTracks()[0];
      boostedAudioPipelineRef.current?.cleanup();
      boostedAudioPipelineRef.current = null;
      const needsAudioProcessing = micGain !== 1.0 || voiceEffectsRef.current.bassDb > 0 || voiceEffectsRef.current.reverbMix > 0;
      if (rawTrack && needsAudioProcessing) {
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
      let remaining = countdownDuration;
      if (remaining <= 0) {
        playStudioBeep(880, 160);
        void triggerActualRecording();
      } else {
        setCountdown(remaining);
        playStudioBeep(440, 90);
        countdownTimerRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            setCountdown(null);
            playStudioBeep(880, 180);
            void triggerActualRecording();
          } else {
            setCountdown(remaining);
            playStudioBeep(440, 90);
          }
        }, 1000);
      }
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

      // CRITICAL FIX FOR A/V SYNC & MOBILE FLUIDITY:
      // Always record directly from the hardware camera track and microphone track!
      // This completely eliminates frame drops, 300ms canvas latency delays,
      // and guarantees 100% hardware-clock lip sync between speech and mouth movements.
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const composite = new MediaStream();
      if (videoTrack) composite.addTrack(videoTrack);
      if (recordAudioTrack) composite.addTrack(recordAudioTrack);
      recordStream = composite;
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

    const getSupportedVideoMimeType = (): { mimeType: string; isWebm: boolean } => {
      const candidates = [
        { type: 'video/webm;codecs=vp9,opus', isWebm: true },
        { type: 'video/webm;codecs=vp8,opus', isWebm: true },
        { type: 'video/webm', isWebm: true },
        { type: 'video/mp4;codecs=avc1,mp4a.40.2', isWebm: false },
        { type: 'video/mp4;codecs=avc1', isWebm: false },
        { type: 'video/mp4', isWebm: false },
      ];
      for (const c of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.type)) {
          return { mimeType: c.type, isWebm: c.isWebm };
        }
      }
      return { mimeType: '', isWebm: true };
    };

    const { mimeType, isWebm } = getSupportedVideoMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 4_500_000,
        audioBitsPerSecond: 192000,
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
      const exactDurationSecs = Math.max(0.5, ((recordStopTimeRef.current ?? performance.now()) - recordStartTimeRef.current) / 1000);
      const rawBlob = new Blob(chunksRef.current, { type: isWebm ? 'video/webm' : 'video/mp4' });
      const fixedBlob = isWebm ? await fixWebmDuration(rawBlob, exactDurationSecs * 1000) : rawBlob;
      const url = URL.createObjectURL(fixedBlob);

      const takeNumber = takes.length + 1;
      const newTake: StudioTake = {
        id: `take_${Date.now()}_${takeNumber}`,
        takeNumber,
        blob: fixedBlob,
        url,
        duration: exactDurationSecs,
        timestamp: Date.now(),
        isFavorite: takes.length === 0,
      };

      setTakes(prev => [...prev, newTake]);
      setSelectedTakeId(newTake.id);
      setRecordedBlob(fixedBlob);
      setRecordedUrl(url);
      setIsScrolling(false);
      onVideoRecorded(fixedBlob, url, exactDurationSecs);
    };

    try {
      recordStopTimeRef.current = null;
      recordStartTimeRef.current = performance.now();
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
      recordStopTimeRef.current = performance.now();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  
  const handleSelectTake = (take: StudioTake) => {
    setSelectedTakeId(take.id);
    setRecordedBlob(take.blob);
    setRecordedUrl(take.url);
    onVideoRecorded(take.blob, take.url, take.duration);
  };

  const handleToggleFavoriteTake = (takeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTakes(prev => prev.map(t => t.id === takeId ? { ...t, isFavorite: !t.isFavorite } : t));
  };

  const handleDeleteTake = (takeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTakes(prev => {
      const remaining = prev.filter(t => t.id !== takeId);
      if (selectedTakeId === takeId) {
        if (remaining.length > 0) {
          const nextTake = remaining[remaining.length - 1];
          setSelectedTakeId(nextTake.id);
          setRecordedBlob(nextTake.blob);
          setRecordedUrl(nextTake.url);
          onVideoRecorded(nextTake.blob, nextTake.url, nextTake.duration);
        } else {
          setSelectedTakeId(null);
          setRecordedBlob(null);
          setRecordedUrl(null);
          if (studioMode === 'camera') startCamera();
          else startMic();
        }
      }
      return remaining;
    });
  };

  const handleNewTake = () => {
    setRecordedBlob(null);
    setRecordedUrl(null);
    setTeleprompterRestartSignal(prev => prev + 1);
    if (studioMode === 'camera') {
      startCamera();
    } else {
      startMic();
    }
  };

  // Sound-Activated Clap Detector
  useEffect(() => {
    if (!clapTriggerActive || isRecording || countdown !== null || recordedUrl) {
      if (clapDetectorRef.current) {
        clapDetectorRef.current.cleanup();
        clapDetectorRef.current = null;
      }
      return;
    }

    const stream = studioMode === 'camera' ? streamRef.current : micStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      let isDestroyed = false;
      let animId: number;
      let prevVolume = 0;
      let cooldownUntil = 0;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolumeClap = () => {
        if (isDestroyed) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const now = performance.now();

        if (now > cooldownUntil && avg > 65 && (avg - prevVolume) > 35) {
          cooldownUntil = now + 2500;
          handleStartRecording();
        }

        prevVolume = avg;
        animId = requestAnimationFrame(checkVolumeClap);
      };

      animId = requestAnimationFrame(checkVolumeClap);

      clapDetectorRef.current = {
        cleanup: () => {
          isDestroyed = true;
          cancelAnimationFrame(animId);
          try { source.disconnect(); } catch {}
          try { ctx.close(); } catch {}
        }
      };
    } catch {}

    return () => {
      if (clapDetectorRef.current) {
        clapDetectorRef.current.cleanup();
        clapDetectorRef.current = null;
      }
    };
  }, [clapTriggerActive, isRecording, countdown, recordedUrl, studioMode, isCameraActive, micStream]);

  const handleOpenEditor = () => {
    stopCamera();
    stopMic();
    onOpenEditor();
  };

  const handleOpenOriginalEditor = () => {
    stopCamera();
    stopMic();
    onOpenOriginalEditor?.();
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
    <div className="relative w-full h-[calc(100vh-70px)] sm:h-[calc(100vh-80px)] bg-slate-950 overflow-hidden flex items-center justify-center p-0 sm:py-2 select-none font-sans">
      
      {/* Centered Phone Canvas Stage - strictly 9:16 portrait on desktop or 16:9 */}
      <div 
        id="studio-stage"
        style={
          aspectRatio === '9:16'
            ? { aspectRatio: '9 / 16', height: '100%', width: 'auto', maxHeight: '100%', maxWidth: '100%' }
            : { aspectRatio: '16 / 9', width: '100%', height: 'auto', maxHeight: '100%', maxWidth: '1200px' }
        }
        className="relative flex items-center justify-center bg-black overflow-hidden transition-all duration-300 sm:rounded-3xl sm:border sm:border-slate-800/80 sm:shadow-[0_0_60px_rgba(0,0,0,0.85)]"
        onClick={(e) => {
          if (activeStudioDrawer !== 'none') {
            setActiveStudioDrawer('none');
            return;
          }
          const target = e.target as HTMLElement;
          if (target.tagName === 'VIDEO' || target.id === 'video-canvas-backdrop' || target.id === 'studio-stage') {
            setIsUiHidden(prev => !prev);
          }
        }}
      >
        {/* Ring Light Effect */}
        {ringLight && (
          <div className="absolute inset-0 pointer-events-none border-[20px] sm:border-[24px] border-white/40 shadow-[inset_0_0_80px_rgba(255,255,255,0.6)] z-10" />
        )}

        {/* 3-2-1 Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-tr from-rose-600 to-indigo-600 border-4 border-white flex items-center justify-center text-6xl sm:text-7xl font-black text-white shadow-2xl animate-bounce">
              {countdown}
            </div>
            <p className="text-white text-sm sm:text-base font-bold mt-4 tracking-wide">התכונן... מתחילים להקליט!</p>
          </div>
        )}

        {/* Active Live Camera Stream */}
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

        {/* Eye-Contact Lens Target Overlay */}
        {studioMode === 'camera' && isCameraActive && !recordedUrl && eyeContactAnchor && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center animate-in fade-in duration-300">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-7 h-7 rounded-full bg-cyan-400/25 animate-ping duration-1000" />
              <div className="w-4 h-4 rounded-full border-2 border-cyan-400 bg-slate-950/90 shadow-[0_0_12px_rgba(34,211,238,0.9)] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
              </div>
            </div>
            <div className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-cyan-500/50 text-[10px] font-black text-cyan-300 shadow-xl backdrop-blur-md flex items-center gap-1">
              <span>👀 הבט כאן לעדשה ⬆️</span>
            </div>
          </div>
        )}

        {/* Voiceover Mode Background Visual Viewport */}
        {studioMode === 'voiceover' && !recordedUrl && (
          <div id="video-canvas-backdrop" className="w-full h-full relative overflow-hidden flex items-center justify-center bg-slate-950">
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
              <div 
                className="w-full h-full flex flex-col items-center justify-center text-center p-6 transition-all duration-500"
                style={{
                  background: (PRESET_GRADIENTS.find(g => g.id === selectedGradient) || PRESET_GRADIENTS[0]).style
                }}
              >
                <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400 animate-pulse">
                  <Mic className="w-10 h-10" />
                </div>
                <h4 className="text-base font-bold text-white mb-1">אולפן קריינות ו-B-Roll</h4>
                <p className="text-xs text-indigo-200/80 max-w-xs mb-3">הקלט את קולך עם הטלפרומפטר. בסיום תוכל להוסיף כתוביות קריוקי מדויקות או סרטוני רקע!</p>
              </div>
            )}
          </div>
        )}

        {/* Camera Offline Placeholder */}
        {studioMode === 'camera' && !isCameraActive && !recordedUrl && (
          <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400">
            <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-indigo-400 shadow-xl">
              <Camera className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">המצלמה אינה פעילה</h3>
            <p className="text-xs text-slate-400 max-w-xs mb-6">לחץ על הכפתור כדי להפעיל את המצלמה והמיקרופון ולהתחיל בהקלטה.</p>
            <button
              onClick={() => startCamera()}
              disabled={isCameraLoading}
              className="px-6 py-3 bg-gradient-to-r from-rose-600 to-indigo-600 hover:opacity-95 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {isCameraLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              <span>הפעל מצלמה ומיקרופון</span>
            </button>
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
              className={`w-full h-full ${aspectRatio === '9:16' && framingMode === 'cover' ? 'object-cover' : 'object-contain'}`}
            />
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
              isMirrored={false}
              eyeContactAnchor={eyeContactAnchor}
              voiceTrackEnabled={voiceTrackMode}
              restartSignal={teleprompterRestartSignal}
              onSpeedChange={setScrollSpeed}
              onFontSizeChange={setFontSize}
              onOpacityChange={setTextOpacity}
              onToggleVoiceTrack={setVoiceTrackMode}
              onToggleScroll={() => setIsScrolling(prev => !prev)}
              onRestart={() => setIsScrolling(true)}
            />
          </div>
        )}

        {/* 2. FLOATING TOP HORIZONTAL GLASS BAR - ANCHORED INSIDE STAGE */}
        <div className={`absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-auto transition-all duration-300 ${
          (isRecording || isUiHidden) ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Left: Mode switcher pill */}
          <div className="flex items-center bg-black/60 backdrop-blur-xl p-1 rounded-full border border-white/20 shadow-xl">
            <button
              onClick={() => handleModeChange('camera')}
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                studioMode === 'camera'
                  ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>מצלמה</span>
            </button>
            <button
              onClick={() => handleModeChange('voiceover')}
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                studioMode === 'voiceover'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden xs:inline">קריינות</span>
            </button>
          </div>

          {/* Center: Status / Timer Pill */}
          {isRecording ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-600/80 backdrop-blur-md border border-rose-400/50 rounded-full text-white text-xs font-bold shadow-lg shadow-rose-600/40 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-black/50 backdrop-blur-md border border-white/10 rounded-full text-slate-300 text-[11px] font-bold">
              <span>📜</span>
              <span>{scriptText ? `${scriptText.trim().split(/\s+/).filter(Boolean).length} מילים` : 'אולפן'}</span>
            </div>
          )}

          {/* Right: Clean View Toggle */}
          <button
            onClick={() => setIsUiHidden(prev => !prev)}
            title="תצוגה נקייה ללא סרגלים (הקש במסך לחזרה)"
            className="px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1 shadow-xl cursor-pointer active:scale-95 transition-all"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden sm:inline">נקי</span>
          </button>
        </div>

        {/* 3. TIKTOK / REELS VERTICAL RIGHT GLASS RAIL - ANCHORED INSIDE STAGE */}
        <div className={`absolute top-14 right-2 sm:right-2.5 z-30 flex flex-col gap-1.5 sm:gap-2 items-center pointer-events-auto transition-all duration-300 ${
          (isRecording || isUiHidden) ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100 translate-x-0'
        }`}>
          {/* Flip Camera */}
          {studioMode === 'camera' && (
            <button
              onClick={toggleFacingMode}
              title="החלף בין מצלמה קדמית לאחורית"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-white flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-300" />
              <span>החלף</span>
            </button>
          )}

          {/* Eye-Contact Lens Anchor */}
          {studioMode === 'camera' && (
            <button
              onClick={() => setEyeContactAnchor(prev => !prev)}
              title="עוגן מיקוד מבט לעדשה"
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
                eyeContactAnchor ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-cyan-500/20' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-cyan-300" />
              <span>עוגן</span>
            </button>
          )}

          {/* Voice-Tracked Prompter AI */}
          <button
            onClick={() => setVoiceTrackMode(prev => !prev)}
            title="טלפרומפטר חכם עוקב קול AI"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              voiceTrackMode ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-emerald-500/20 animate-pulse' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>קול AI</span>
          </button>

          {/* Prompter Speed Drawer Toggle */}
          <button
            onClick={() => setActiveStudioDrawer(prev => prev === 'prompter' ? 'none' : 'prompter')}
            title="מהירות וגודל טלפרומפטר"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeStudioDrawer === 'prompter' ? 'bg-indigo-600/40 border-indigo-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Gauge className="w-3.5 h-3.5 text-indigo-300" />
            <span>${scrollSpeed}x</span>
          </button>

          {/* Countdown Timer */}
          <button
            onClick={() => setCountdownDuration(prev => prev === 3 ? 5 : prev === 5 ? 10 : prev === 10 ? 0 : 3)}
            title="זמן ספירה לאחור עם קלאפר קולי"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-amber-300 flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{countdownDuration === 0 ? '0' : `${countdownDuration}s`}</span>
          </button>

          {/* Clap Trigger Toggle */}
          <button
            onClick={() => setClapTriggerActive(prev => !prev)}
            title="צילום ללא מגע: מחיאת כף מפעילה ספירה לאחור"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              clapTriggerActive ? 'bg-amber-500/30 border-amber-400 text-amber-200 animate-pulse' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Clapperboard className="w-3.5 h-3.5 text-amber-300" />
            <span>מחיאה</span>
          </button>

          {/* Mic Sound / Audio Effects Drawer */}
          <button
            onClick={() => setActiveStudioDrawer(prev => prev === 'audio' ? 'none' : 'audio')}
            title="צליל הקול, ניקוי רעשים, בס והדהוד"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeStudioDrawer === 'audio' ? 'bg-indigo-600/40 border-indigo-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 text-indigo-300" />
            <span>צליל</span>
          </button>

          {/* Zoom */}
          {studioMode === 'camera' && (
            <button
              onClick={() => {
                const next = zoomLevel >= 2.0 ? 1.0 : zoomLevel >= 1.5 ? 2.0 : zoomLevel >= 1.2 ? 1.5 : 1.2;
                applyZoom(next);
              }}
              title="זום עדשה"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5 text-sky-300" />
              <span>{zoomLevel.toFixed(1)}x</span>
            </button>
          )}

          {/* Aspect Ratio Switch */}
          <button
            onClick={() => {
              const next = aspectRatio === '9:16' ? '16:9' : '9:16';
              setAspectRatio(next);
              if (studioMode === 'camera' && isCameraActive) startCamera();
            }}
            title="החלף יחס גובה (9:16 / 16:9)"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
          >
            {aspectRatio === '9:16' ? <Smartphone className="w-3.5 h-3.5 text-rose-400" /> : <Monitor className="w-3.5 h-3.5 text-indigo-400" />}
            <span>{aspectRatio}</span>
          </button>

          {/* Lighting & Ring light */}
          {studioMode === 'camera' && (
            <button
              onClick={() => setActiveStudioDrawer(prev => prev === 'lighting' ? 'none' : 'lighting')}
              title="תאורה ורינגלייט"
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
                activeStudioDrawer === 'lighting' || ringLight ? 'bg-amber-400/30 border-amber-300 text-amber-200' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-300" />
              <span>תאורה</span>
            </button>
          )}
        </div>

        {/* 4. FLOATING TRANSLUCENT DRAWERS - ANCHORED INSIDE STAGE */}
        {activeStudioDrawer !== 'none' && (
          <div className="absolute top-16 right-12 sm:right-14 z-40 bg-slate-900/90 backdrop-blur-2xl border border-white/20 p-4 rounded-3xl shadow-2xl max-w-[280px] sm:max-w-xs max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <span className="font-bold flex items-center gap-1.5 text-xs sm:text-sm">
                {activeStudioDrawer === 'prompter' && <>⏱️ מהירות וגודל טלפרומפטר</>}
                {activeStudioDrawer === 'audio' && <>🎙️ הגדרות שמע וקול</>}
                {activeStudioDrawer === 'lighting' && <>☀️ תאורה וצבע</>}
              </span>
              <button
                onClick={() => setActiveStudioDrawer('none')}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Prompter Drawer Content */}
            {activeStudioDrawer === 'prompter' && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>מהירות גלילה:</span>
                    <span className="font-bold text-indigo-400">{scrollSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="4"
                    step="0.25"
                    value={scrollSpeed}
                    onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>גודל גופן:</span>
                    <span className="font-bold text-indigo-400">{fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="52"
                    step="2"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>שקיפות רקע:</span>
                    <span className="font-bold text-indigo-400">{Math.round(textOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={textOpacity}
                    onChange={(e) => setTextOpacity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/10">
                  <span className="font-bold">מעקב קול AI (he-IL)</span>
                  <button
                    onClick={() => setVoiceTrackMode(prev => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      voiceTrackMode ? 'bg-emerald-500 text-slate-950 shadow' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {voiceTrackMode ? 'פעיל ✓' : 'כבוי'}
                  </button>
                </div>
              </div>
            )}

            {/* Audio Drawer Content */}
            {activeStudioDrawer === 'audio' && (
              <div className="space-y-3">
                <label className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/10 cursor-pointer select-none">
                  <span className="font-bold">ניקוי רעשי רקע (AI)</span>
                  <input
                    type="checkbox"
                    checked={voiceEffects.noiseReduction !== false}
                    onChange={e => updateVoiceEffects({ ...voiceEffects, noiseReduction: e.target.checked })}
                    className="accent-indigo-500 w-4 h-4 rounded"
                  />
                </label>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>עוצמת מיקרופון (Boost):</span>
                    <span className="font-bold text-indigo-400">{micGain.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step="0.1"
                    value={micGain}
                    onChange={e => setMicGain(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>חיזוק בס ונוכחות:</span>
                    <span className="font-bold text-indigo-400">+{voiceEffects.bassDb} dB</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={voiceEffects.bassDb}
                    onChange={e => updateVoiceEffects({ ...voiceEffects, bassDb: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>הדהוד חם (אולפן):</span>
                    <span className="font-bold text-indigo-400">{Math.round(voiceEffects.reverbMix * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.4"
                    step="0.05"
                    value={voiceEffects.reverbMix}
                    onChange={e => updateVoiceEffects({ ...voiceEffects, reverbMix: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Lighting Drawer Content */}
            {activeStudioDrawer === 'lighting' && (
              <div className="space-y-3.5">
                <label className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/10 cursor-pointer select-none">
                  <span className="font-bold">רינגלייט (מסך לבן מרכך)</span>
                  <input
                    type="checkbox"
                    checked={ringLight}
                    onChange={e => setRingLight(e.target.checked)}
                    className="accent-amber-400 w-4 h-4 rounded"
                  />
                </label>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>בהירות תמונה:</span>
                    <span className="font-bold text-amber-300">{Math.round(brightness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.5"
                    step="0.05"
                    value={brightness}
                    onChange={(e) => setBrightness(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. FLOATING BOTTOM GLASS SHUTTER BAR - ANCHORED INSIDE STAGE */}
        <div className={`absolute bottom-4 inset-x-3 z-30 flex items-center justify-between pointer-events-auto transition-all duration-300 ${
          isUiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Left: Takes Tray or Retake */}
          <div className="flex items-center gap-1.5">
            {takes.length > 0 && !recordedUrl && (
              <button
                onClick={() => {
                  const last = takes[takes.length - 1];
                  handleSelectTake(last);
                }}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-black/60 backdrop-blur-xl border border-indigo-400/40 text-indigo-300 hover:text-white text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xl cursor-pointer active:scale-95 transition-all"
              >
                <Clapperboard className="w-3.5 h-3.5 text-indigo-400" />
                <span>טייקים ({takes.length})</span>
              </button>
            )}

            {recordedUrl && (
              <button
                onClick={handleNewTake}
                className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1.5 shadow-xl cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>טייק נוסף</span>
              </button>
            )}
          </div>

          {/* Center: Large Shutter Record / Stop Button */}
          <div className="flex items-center justify-center">
            {!recordedUrl ? (
              isRecording ? (
                <button
                  onClick={handleStopRecording}
                  className="w-16 h-16 rounded-full bg-rose-600 border-4 border-white flex items-center justify-center text-white shadow-2xl shadow-rose-600/50 animate-pulse active:scale-95 transition-transform cursor-pointer"
                  title="סיים הקלטה"
                >
                  <Square className="w-6 h-6 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={(studioMode === 'camera' && !isCameraActive) || countdown !== null}
                  className="w-16 h-16 rounded-full bg-gradient-to-tr from-rose-600 via-rose-500 to-indigo-600 border-4 border-white/90 flex items-center justify-center text-white shadow-2xl shadow-rose-600/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                  title="התחל הקלטה"
                >
                  <div className="w-5 h-5 rounded-full bg-white shadow-md" />
                </button>
              )
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenEditor}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-500 via-indigo-600 to-rose-600 hover:opacity-95 text-white font-black text-xs sm:text-sm rounded-full shadow-2xl shadow-teal-500/30 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer border border-teal-400/40"
                >
                  <span>עבור לעריכה</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Right: VU Meter & Mic Sound Check / Editor Direct Trigger */}
          <div className="flex items-center gap-1.5">
            {!recordedUrl && (
              <div className="bg-black/60 backdrop-blur-xl px-2 py-1 rounded-full border border-white/15 flex items-center shadow-xl">
                <AudioVisualizer
                  stream={studioMode === 'camera' ? streamRef.current : micStream}
                  isActive={studioMode === 'camera' ? isCameraActive : !!micStream}
                  showTestButton={!isRecording}
                />
              </div>
            )}

            {recordedUrl && onOpenOriginalEditor && (
              <button
                onClick={handleOpenOriginalEditor}
                className="px-3 py-1.5 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700 text-slate-200 text-xs font-bold hover:text-white cursor-pointer transition-all active:scale-95"
              >
                <span>מקורי</span>
              </button>
            )}
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
    </div>
  );
};
