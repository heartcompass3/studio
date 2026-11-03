import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Mic, Square, Play, Pause, RotateCcw, 
  Lightbulb, Volume2, StopCircle, Loader, Download, 
  Scissors, Settings2, Sliders, Smartphone, Monitor, 
  FlipHorizontal, Eye, ZoomIn, ZoomOut, Image as ImageIcon,
  Sparkles, Upload, Sun, Check, Sparkle, ArrowLeft, ArrowRight,
  Gauge, Type, Video, Layers, Palette, Plus, Trash2, Music,
  RefreshCw, Scan, X, Star, Clapperboard, Timer, Copy, Clipboard
} from 'lucide-react';
import { CameraStage } from './CameraStage';
import { Teleprompter } from './Teleprompter';
import { generateAudioFromText } from '../../services/geminiService';
import { VideoAspectRatio, RecordingMode, BackgroundSourceType, BackgroundSlide, StudioTake } from '../../types/studio';
import { fixWebmDuration } from '../../services/webmFixer';
// Native direct audio stream recording
import { VoiceAudioEffects, VOICE_AUDIO_PRESETS, createVoiceAudioGraph } from '../../services/meditationAudio';

interface RecordingStudioProps {
  active: boolean;
  takes: StudioTake[];
  onTakesChange: React.Dispatch<React.SetStateAction<StudioTake[]>>;
  onBusyChange: (busy: boolean) => void;
  onVideoRemoved: (blob: Blob) => void;
  scriptText: string;
  onScriptChange?: (script: string) => void;
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
  active, takes, onTakesChange: setTakes, onBusyChange, onVideoRemoved,
  scriptText,
  onScriptChange,
  onVideoRecorded,
  onOpenEditor,
  onOpenOriginalEditor,
  onError
}) => {
  const activeRef = useRef(active);
  activeRef.current = active;
  const [liveScript, setLiveScript] = useState(scriptText);
  useEffect(() => {
    setLiveScript(scriptText);
  }, [scriptText]);

  const handleUpdateScript = (newScript: string) => {
    setLiveScript(newScript);
    if (onScriptChange) onScriptChange(newScript);
  };
  // Studio Mode: Camera Video OR Voiceover & B-Roll / Slideshow
  const [studioMode, setStudioMode] = useState<RecordingMode>('camera');

  // Microphone Volume Boost (Web Audio Processor - 100% to 400%)
  const [micGain, setMicGain] = useState<number>(1.0); // 1.0 = Clean native studio mic level
  const [showMicControls, setShowMicControls] = useState<boolean>(false);
  // Native audio ref

  const [voiceEffects, setVoiceEffects] = useState<VoiceAudioEffects>(VOICE_AUDIO_PRESETS.speech);
  const voiceGraphRef = useRef<ReturnType<typeof createVoiceAudioGraph> | null>(null);
  const captureSettingsRef = useRef({ brightness: 1, zoom: 1, mirrored: true });
  const voiceEffectsRef = useRef<VoiceAudioEffects>(VOICE_AUDIO_PRESETS.speech);
  const updateVoiceEffects = (next: VoiceAudioEffects) => {
    voiceEffectsRef.current = next;
    setVoiceEffects(next);
    voiceGraphRef.current?.setEffects(next);
    
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
  const [eyeContactAnchor, setEyeContactAnchor] = useState<boolean>(false);

  // Voiceover / Faceless B-Roll & Slideshow State
  const [bgSourceType, setBgSourceType] = useState<BackgroundSourceType>('gradient');
  const [bgVideoUrl, setBgVideoUrl] = useState<string | null>(null);
  const [bgSlides, setBgSlides] = useState<BackgroundSlide[]>([]);
  const [slideDurationSec, setSlideDurationSec] = useState(5);
  const [selectedGradient, setSelectedGradient] = useState(PRESET_GRADIENTS[0].id);
  const [isAudioOnlyRecording, setIsAudioOnlyRecording] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Multi-Take Studio System (Round 2)

  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);

  // Immersive TikTok/Reels Floating HUD Controls
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [activeStudioDrawer, setActiveStudioDrawer] = useState<"none" | "prompter" | "audio" | "lighting" | "takes" | "broll">("none");
  // Controls: Countdown & Prompter Settings
  const [countdownDuration, setCountdownDuration] = useState<number>(3); // 0, 3, 5, 10

  const playStudioBeep = (frequency: number, durationMs: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
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

  captureSettingsRef.current = { brightness, zoom: hardwareZoomSupported ? 1 : zoomLevel, mirrored: isMirrored };
  useEffect(() => { voiceGraphRef.current?.setGain(micGain); }, [micGain]);
  useEffect(() => { onBusyChange(isRecording || countdown !== null); }, [isRecording, countdown, onBusyChange]);
  useEffect(() => {
    if (!active) { stopCamera(); stopMic(); audioPlayerRef.current?.pause(); previewVideoRef.current?.pause(); bgVideoRef.current?.pause(); setIsPlayingAudio(false); }
  }, [active]);
  useEffect(() => {
    if (takes.length && !selectedTakeId) {
      const take = takes[takes.length - 1];
      setSelectedTakeId(take.id); setRecordedBlob(take.blob); setRecordedUrl(take.url);
    }
  }, [takes]);

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') { recordStopTimeRef.current = performance.now(); mediaRecorderRef.current.stop(); }
      
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

  const startCamera = async (cameraIdOverride?: string, facingOverride?: 'user' | 'environment', ratioOverride?: VideoAspectRatio) => {
    stopCamera();
    setIsCameraLoading(true);
    try {
      const targetFacing = facingOverride || facingMode;
      const targetCameraId = cameraIdOverride !== undefined ? cameraIdOverride : selectedCameraId;

      const isVertical = (ratioOverride || aspectRatio) === '9:16';
      const videoConstraints: MediaTrackConstraints = isVertical
        ? {
            aspectRatio: { ideal: 9 / 16, max: 1.0 },
            width: { ideal: 1080, max: 1080 },
            height: { ideal: 1920, min: 720 },
            frameRate: { ideal: 30, max: 60 }
          }
        : {
            aspectRatio: { ideal: 16 / 9, min: 1.0 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
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
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 }
        }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        // Fallback for mobile browsers with strict constraint support
        const fallbackConstraints: MediaStreamConstraints = {
          video: {
            facingMode: targetFacing,
            aspectRatio: isVertical ? (9 / 16) : (16 / 9)
          },
          audio: constraints.audio
        };
        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      }
      if (!activeRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
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
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 }
        },
        video: false
      });
      if (!activeRef.current) { stream.getTracks().forEach(track => track.stop()); return null; }
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
    let studioAudioCtx: AudioContext | null = null;
    let boostedAudioTrack: MediaStreamTrack | null = null;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const sourceStream = studioMode === 'camera' ? streamRef.current : micStreamRef.current;
      if (AudioCtxClass && sourceStream && sourceStream.getAudioTracks().length > 0) {
        studioAudioCtx = new AudioCtxClass();
        const aSource = studioAudioCtx.createMediaStreamSource(sourceStream);
        await studioAudioCtx.resume();
        const destNode = studioAudioCtx.createMediaStreamDestination();
        voiceGraphRef.current = createVoiceAudioGraph(studioAudioCtx, aSource, destNode, micGain, voiceEffectsRef.current);

        boostedAudioTrack = destNode.stream.getAudioTracks()[0];
      }
    } catch (audioErr) {
      console.warn('Audio booster note:', audioErr);
    }

    const recordAudioTrack = boostedAudioTrack || rawAudioTrack;

    const vTrack = streamRef.current?.getVideoTracks()[0];
    const vSettings = vTrack?.getSettings();
    const isCameraLandscape = !!(vSettings && vSettings.width && vSettings.height && vSettings.width > vSettings.height);

    if (studioMode === 'camera') {
      if (!streamRef.current) { return; }

      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = outWidth; canvas.height = outHeight;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      const video = videoRef.current;
      const drawCamera = () => {
        canvasLoopId = requestAnimationFrame(drawCamera);
        if (!video.videoWidth || !video.videoHeight) return;
        const settings = captureSettingsRef.current;
        const targetRatio = outWidth / outHeight;
        let sw = video.videoWidth, sh = video.videoHeight;
        if (sw / sh > targetRatio) sw = sh * targetRatio; else sh = sw / targetRatio;
        sw /= settings.zoom; sh /= settings.zoom;
        ctx.save();
        ctx.filter = `brightness(${settings.brightness})`;
        if (settings.mirrored) { ctx.translate(outWidth, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, outWidth, outHeight);
        ctx.restore();
      };
      drawCamera();
      recordStream = canvas.captureStream(30);
      if (recordAudioTrack) recordStream.addTrack(recordAudioTrack);
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
      
      
      voiceGraphRef.current?.cleanup(); voiceGraphRef.current = null;
      void studioAudioCtx?.close();
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
      voiceGraphRef.current?.cleanup(); voiceGraphRef.current = null;
      if (studioAudioCtx) { studioAudioCtx.close().catch(() => {}); }
      recordStream.getVideoTracks().forEach(track => track.stop());
      if (bgVideoRef.current) bgVideoRef.current.pause();
      if (false) {

        
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
      
      
      voiceGraphRef.current?.cleanup(); voiceGraphRef.current = null;
      void studioAudioCtx?.close();
      onError('ההקלטה לא התחילה. נסה שוב.');
      return;
    }
    setIsRecording(true);
    setIsScrolling(true);
  };

  const handleStopRecording = (trimTailSec?: number | React.MouseEvent) => {
    const safeSec = typeof trimTailSec === 'number' ? trimTailSec : 0;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const now = performance.now();
      recordStopTimeRef.current = safeSec > 0 
        ? Math.max(recordStartTimeRef.current + 500, now - (safeSec * 1000))
        : now;
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
    const deleted = takes.find(t => t.id === takeId);
    const remaining = takes.filter(t => t.id !== takeId);
    setTakes(remaining);
    if (selectedTakeId === takeId) {
      const next = remaining[remaining.length - 1];
      setSelectedTakeId(next?.id || null); setRecordedBlob(next?.blob || null); setRecordedUrl(next?.url || null);
      if (next) onVideoRecorded(next.blob, next.url, next.duration);
      else if (deleted) onVideoRemoved(deleted.blob);
    }
    if (deleted) URL.revokeObjectURL(deleted.url);
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

  const handleTeleprompterScriptComplete = () => {
    if (isRecording) {
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          playStudioBeep(880, 200);
          handleStopRecording();
        }
      }, 2000);
    }
  };

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
    <div className="relative w-full h-full max-h-full bg-slate-950 overflow-hidden flex items-center justify-center p-0 select-none font-sans">
      
      {/* Centered Phone Canvas Stage - strictly 9:16 portrait on desktop or 16:9 */}
      <CameraStage id="studio-stage" ratio={aspectRatio === '9:16' ? 9 / 16 : 16 / 9}
        onClick={(e) => {
          if (activeStudioDrawer !== 'none' && !(e.target as HTMLElement).closest('button,input,textarea,select,[role=dialog]')) {
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
              transform: `scale(${isMirrored ? -(hardwareZoomSupported ? 1 : zoomLevel) : (hardwareZoomSupported ? 1 : zoomLevel)}, ${hardwareZoomSupported ? 1 : zoomLevel})`,
              objectFit: 'cover',
              objectPosition: 'center center',
              direction: 'ltr'
            }}
            className={`w-full h-full object-cover transition-transform duration-100 ${!isCameraActive ? 'hidden' : ''}`}
          />
        )}

        {/* Eye-Contact Lens Target Overlay */}
        {studioMode === 'camera' && isCameraActive && !recordedUrl && eyeContactAnchor && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center opacity-80 animate-in fade-in">
            <div className="px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-cyan-500/50 text-[10px] font-bold text-cyan-300 shadow-xl backdrop-blur-md">
              <span>👀 עדשת מצלמה</span>
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
              className="px-6 py-3 bg-rose-500 hover:opacity-95 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {isCameraLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              <span>הפעל מצלמה ומיקרופון</span>
            </button>
          </div>
        )}

        {/* Recorded Video Playback Review */}
        {recordedUrl && (
          <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
            <video
              ref={previewVideoRef}
              src={recordedUrl}
              controls
              autoPlay={active}
              playsInline
              onLoadedMetadata={() => {
                if (previewVideoRef.current) {
                  previewVideoRef.current.volume = 1.0;
                  previewVideoRef.current.muted = false;
                }
              }}
              style={{
                objectFit: aspectRatio === '9:16' ? 'cover' : 'contain',
                objectPosition: 'center center',
                direction: 'ltr'
              }}
              className="w-full h-full object-cover mx-auto block max-h-full max-w-full"
            />
          </div>
        )}

        {/* Teleprompter Overlay */}
        {((studioMode === 'camera' && isCameraActive) || (studioMode === 'voiceover')) && !recordedUrl && (
          <div className="absolute inset-0 pointer-events-auto z-10">
            <Teleprompter
              text={liveScript}
              isScrolling={isScrolling}
              scrollSpeed={scrollSpeed}
              fontSize={fontSize}
              opacity={textOpacity}
              isCameraActive={studioMode === 'camera' ? isCameraActive : true}
              isMirrored={false}
              eyeContactAnchor={eyeContactAnchor}
              restartSignal={teleprompterRestartSignal}
              onSpeedChange={setScrollSpeed}
              onFontSizeChange={setFontSize}
              onOpacityChange={setTextOpacity}
              onToggleScroll={() => setIsScrolling(prev => !prev)}
              onRestart={() => setIsScrolling(true)}
              onScriptComplete={handleTeleprompterScriptComplete}
              onPasteScript={handleUpdateScript}
              onOpenPrompterDrawer={() => setActiveStudioDrawer('prompter')}
            />
          </div>
        )}

        
        {/* Top Recording Bar with Instant Stop Button - ALWAYS visible when recording */}
        {isRecording && (
          <div className="absolute top-3 inset-x-3 z-40 flex items-center justify-between pointer-events-auto animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-950/80 backdrop-blur-md border border-rose-500/50 rounded-full text-white text-xs font-bold shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="font-mono text-sm tracking-wide">
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>

            

            <button
              onClick={() => handleStopRecording()}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-full border-2 border-white shadow-2xl shadow-rose-600/60 flex items-center gap-1.5 cursor-pointer"
              title="עצור הקלטה מיד"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>עצור</span>
            </button>
          </div>
        )}

        {/* 2. FLOATING TOP HORIZONTAL GLASS BAR - ANCHORED INSIDE STAGE */}
        <div className={`stage-topbar transition-all duration-300 ${
          (isRecording || isUiHidden) ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Left: Mode switcher pill */}
          <div className="flex items-center bg-black/60 backdrop-blur-xl p-1 rounded-full border border-white/20 shadow-xl">
            <button
              onClick={() => handleModeChange('camera')}
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                studioMode === 'camera'
                  ? 'bg-rose-500 text-white shadow-md'
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

          {/* Center: Status / Timer Pill & Prompter Script Toggle */}
          {isRecording ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-600/80 backdrop-blur-md border border-rose-400/50 rounded-full text-white text-xs font-bold shadow-lg shadow-rose-600/40 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
            </div>
          ) : (
            <button
              onClick={() => setActiveStudioDrawer(prev => prev === 'prompter' ? 'none' : 'prompter')}
              className="flex items-center gap-1.5 px-3 py-1 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 rounded-full text-slate-200 hover:text-white text-[11px] font-bold active:scale-95 transition-all cursor-pointer shadow-lg"
              title="ערוך או הדבק תסריט לפרומפטר"
            >
              <span>📜</span>
              <span>{liveScript ? `${liveScript.trim().split(/\s+/).filter(Boolean).length} מילים` : 'הדבק תסריט'}</span>
              <span className="text-[10px] text-indigo-300">✏️</span>
            </button>
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
        <div aria-label="כלי צילום" className={`stage-tools transition-all duration-300 ${
          (isRecording || isUiHidden) ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100 translate-x-0'
        }`}>
          {/* Flip Camera */}
          {studioMode === 'camera' && (
            <button
              disabled={isRecording || countdown !== null} onClick={toggleFacingMode}
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

          

          {/* Prompter Speed Drawer Toggle */}
          <button
            onClick={() => setActiveStudioDrawer(prev => prev === 'prompter' ? 'none' : 'prompter')}
            title="מהירות וגודל טלפרומפטר"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-xl border flex flex-col items-center justify-center text-[8px] sm:text-[8.5px] font-bold shadow-xl active:scale-90 transition-all cursor-pointer ${
              activeStudioDrawer === 'prompter' ? 'bg-indigo-600/40 border-indigo-400 text-white' : 'bg-black/60 border-white/20 text-slate-300 hover:text-white'
            }`}
          >
            <Gauge className="w-3.5 h-3.5 text-indigo-300" />
            <span>{scrollSpeed}x</span>
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
              if (isRecording || countdown !== null) return;
              const next = aspectRatio === '9:16' ? '16:9' : '9:16';
              setAspectRatio(next);
              if (studioMode === 'camera' && isCameraActive) void startCamera(undefined, undefined, next);
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
          <div role="dialog" aria-label="הגדרות אולפן" onKeyDown={e => { if (e.key === 'Escape') setActiveStudioDrawer('none'); }} onClick={e => e.stopPropagation()} className="stage-sheet text-xs text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <span className="font-bold flex items-center gap-1.5 text-xs sm:text-sm">
                {activeStudioDrawer === 'prompter' && <>⏱️ מהירות וגודל טלפרומפטר</>}
                {activeStudioDrawer === 'audio' && <>🎙️ הגדרות שמע וקול</>}
                {activeStudioDrawer === 'lighting' && <>☀️ תאורה וצבע</>}
                {activeStudioDrawer === 'takes' && <>הטייקים שלי ({takes.length})</>}
              </span>
              <button
                onClick={() => setActiveStudioDrawer('none')}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Prompter Drawer Content */}
            {activeStudioDrawer === 'takes' && <div className="space-y-2">
              {takes.map(take => <div key={take.id} className={`flex items-center gap-2 rounded-xl p-2 border ${selectedTakeId === take.id ? 'border-teal-400 bg-teal-900/20' : 'border-white/10'}`}>
                <button className="flex-1 text-right p-2" onClick={() => handleSelectTake(take)}>טייק {take.takeNumber} · {take.duration.toFixed(1)} שנ׳</button>
                <button aria-label={`סמן טייק ${take.takeNumber} כמועדף`} onClick={e => handleToggleFavoriteTake(take.id, e)}><Star className={`w-4 h-4 ${take.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} /></button>
                <button aria-label={`מחק טייק ${take.takeNumber}`} onClick={e => handleDeleteTake(take.id, e)}><Trash2 className="w-4 h-4 text-rose-300" /></button>
              </div>)}
            </div>}
            {activeStudioDrawer === 'prompter' && (
              <div className="space-y-3.5">
                {/* Direct Script Editor & Paste inside Prompter Drawer */}
                <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-300 flex items-center gap-1">
                      📜 טקסט הטלפרומפטר
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text && text.trim()) handleUpdateScript(text);
                          } catch {
                            onError("לא ניתן לגשת ללוח ההעתקה בדפדפן");
                          }
                        }}
                        className="px-2 py-0.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                      >
                        <Copy className="w-3 h-3" />
                        <span>הדבק מהלוח</span>
                      </button>
                      {liveScript && (
                        <button
                          type="button"
                          onClick={() => handleUpdateScript('')}
                          className="px-1.5 py-0.5 rounded-lg bg-white/10 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold cursor-pointer"
                          title="נקה טקסט"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={liveScript}
                    onChange={(e) => handleUpdateScript(e.target.value)}
                    placeholder="הדבק או הקלד כאן את התסריט שיופיע בטלפרומפטר..."
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl p-2 text-xs text-white leading-relaxed resize-none focus:outline-none focus:border-indigo-400 font-sans"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {liveScript ? `${liveScript.trim().split(/\s+/).filter(Boolean).length} מילים` : 'ריק'}
                    </span>
                    <span>
                      {liveScript ? `כ־${Math.round(liveScript.trim().split(/\s+/).filter(Boolean).length / 2.25)} שניות` : ''}
                    </span>
                  </div>
                </div>

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
        <div className={`stage-capture-bar ${recordedUrl ? 'stage-review-bar' : ''} transition-opacity duration-300 ${
          isUiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Left: Takes Tray or Retake */}
          <div className="stage-capture-secondary">
            {takes.length > 0 && (
              <button
                onClick={() => {
                  setActiveStudioDrawer('takes');
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
          <div className="stage-capture-primary">
            {!recordedUrl ? (
              isRecording ? (
                <button
                  onClick={() => handleStopRecording()}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-rose-600 border-4 border-white flex flex-col items-center justify-center text-white shadow-2xl shadow-rose-600/70 animate-pulse active:scale-95 transition-transform cursor-pointer"
                  title="סיים הקלטה"
                >
                  <Square className="w-5 h-5 sm:w-6 sm:h-6 fill-current mb-0.5" />
                  <span className="text-[9px] sm:text-[10px] font-black tracking-wider">עצור</span>
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={(studioMode === 'camera' && !isCameraActive) || countdown !== null}
                  className="w-16 h-16 rounded-full bg-rose-500 border-4 border-white/90 flex items-center justify-center text-white shadow-2xl shadow-rose-600/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                  title="התחל הקלטה"
                >
                  <div className="w-5 h-5 rounded-full bg-white shadow-md" />
                </button>
              )
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenEditor}
                  className="px-5 py-2.5 bg-teal-600 hover:opacity-95 text-white font-black text-xs sm:text-sm rounded-full shadow-2xl shadow-teal-500/30 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer border border-teal-400/40"
                >
                  <span>עבור לעריכה וכתוביות</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
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

      </CameraStage>
    </div>
  );
};
