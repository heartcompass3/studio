import { fitMediaFrame } from './mediaGeometry';
import { createMixBus, finishAudioSamples } from './audioMix';
import { captionPages, pageAtWord } from './captionLayout';
export { splitLongCaptions } from './captionLayout';
import { CaptionItem, SubtitleStyle, VideoAspectRatio, VisualOverlayItem, TextCalloutItem } from '../types/studio';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import fixWebmDuration from 'fix-webm-duration';

export interface RenderOptions {
  videoElement: HTMLVideoElement;
  videoFitMode?: 'cover' | 'contain';
  videoBlob?: Blob | null;
  captions: CaptionItem[];
  visualOverlays?: VisualOverlayItem[];
  trimStart: number;
  trimEnd: number;
  brightness: number;
  contrast?: number;
  subtitleStyle: SubtitleStyle;
  exportAspectRatio?: VideoAspectRatio;
  karaokeEnabled?: boolean;
  headlineText?: string;
  sourceVolume?: number;
  musicBlob?: Blob | null;
  musicVolume?: number;
  musicFitMode?: 'auto' | 'loop' | 'trim';
  captionPositionY?: number;
  textCallouts?: TextCalloutItem[];
  onProgress: (percent: number, statusText: string) => void;
}

export const drawHeadlineOverlay = (
  ctx: CanvasRenderingContext2D,
  headlineText: string,
  width: number,
  height: number
) => {
  if (!headlineText || !headlineText.trim()) return;

  const isVertical = height > width;
  const fontSize = Math.max(22, Math.floor(height * (isVertical ? 0.034 : 0.042)));
  const lineHeight = fontSize * 1.3;
  const maxLineWidth = width * 0.88;

  ctx.save();
  ctx.font = `900 ${fontSize}px "Assistant", "Heebo", "Rubik", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  const words = headlineText.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxLineWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const totalBlockHeight = lines.length * lineHeight;
  const paddingX = fontSize * 0.8;
  const paddingY = fontSize * 0.35;
  const topY = isVertical ? height * 0.08 : height * 0.06;

  // Measure max width of lines for background card
  let maxW = 0;
  lines.forEach(l => {
    const w = ctx.measureText(l).width;
    if (w > maxW) maxW = w;
  });

  const cardW = Math.min(width * 0.94, maxW + paddingX * 2);
  const cardH = totalBlockHeight + paddingY * 2;
  const cardX = (width - cardW) / 2;
  const cardY = topY;

  // Background gradient pill / box
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
  } else {
    ctx.rect(cardX, cardY, cardW, cardH);
  }
  ctx.fill();

  // Border outline
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw lines
  const startLineY = cardY + paddingY + lineHeight / 2;
  lines.forEach((line, idx) => {
    const y = startLineY + idx * lineHeight;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, width / 2, y);
  });

  ctx.restore();
};

export const drawVisualOverlay = (
  ctx: CanvasRenderingContext2D,
  overlay: VisualOverlayItem,
  imgElement: HTMLImageElement,
  currentPos: number,
  width: number,
  height: number
) => {
  if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) return;

  const duration = overlay.endTime - overlay.startTime;
  const elapsed = currentPos - overlay.startTime;
  if (elapsed < 0 || elapsed > duration) return;

  // Calculate smooth fade-in and fade-out opacity (0.3s fade)
  const fadeDuration = 0.3;
  let opacity = 1.0;
  if (elapsed < fadeDuration) {
    opacity = Math.max(0, elapsed / fadeDuration);
  } else if (duration - elapsed < fadeDuration) {
    opacity = Math.max(0, (duration - elapsed) / fadeDuration);
  }

  ctx.save();
  ctx.globalAlpha = opacity;

  if (overlay.type === 'hook-cover' || overlay.type === 'b-roll-full') {
    // Full screen overlay with soft cinematic push zoom
    const zoomScale = 1.0 + (elapsed / duration) * 0.04;
    const drawW = width * zoomScale;
    const drawH = height * zoomScale;
    const drawX = (width - drawW) / 2;
    const drawY = (height - drawH) / 2;
    ctx.drawImage(imgElement, drawX, drawY, drawW, drawH);
  } else if (overlay.type === 'pip-corner') {
    // Picture-in-Picture floating card (upper corner)
    const isVertical = height > width;
    const cardW = width * (isVertical ? 0.44 : 0.28);
    const cardH = (imgElement.naturalHeight / imgElement.naturalWidth) * cardW;
    const cardX = width * 0.05; // Left corner in RTL
    const cardY = height * (isVertical ? 0.12 : 0.08);

    // Card shadow & rounded container
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(cardX, cardY, cardW, cardH, 16);
    } else {
      ctx.rect(cardX, cardY, cardW, cardH);
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Clip & draw image
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(cardX, cardY, cardW, cardH, 16);
    } else {
      ctx.rect(cardX, cardY, cardW, cardH);
    }
    ctx.clip();
    ctx.drawImage(imgElement, cardX, cardY, cardW, cardH);
    ctx.restore();
  }

  ctx.restore();
};

export const drawTextCallout = (
  ctx: CanvasRenderingContext2D,
  callout: TextCalloutItem,
  width: number,
  height: number
) => {
  if (!callout.text || !callout.text.trim()) return;
  const isVertical = height > width;
  const fontSize = Math.max(20, Math.floor(height * (isVertical ? 0.034 : 0.044)));
  const posX = width / 2;
  const posY = height * ((callout.positionY ?? 32) / 100);

  ctx.save();
  ctx.font = `900 ${fontSize}px "Assistant", "Heebo", "Rubik", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  const metrics = ctx.measureText(callout.text);
  const textWidth = Math.min(metrics.width, width * 0.86);
  const paddingX = fontSize * 0.85;
  const paddingY = fontSize * 0.36;
  const boxW = textWidth + paddingX * 2;
  const boxH = fontSize + paddingY * 2;
  const boxX = posX - boxW / 2;
  const boxY = posY - boxH / 2;

  if (callout.style === 'fire-pill') {
    ctx.fillStyle = '#EF4444';
    ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
    ctx.shadowBlur = 18;
  } else if (callout.style === 'neon-glow') {
    ctx.fillStyle = '#8B5CF6';
    ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
    ctx.shadowBlur = 22;
  } else if (callout.style === 'warning-box') {
    ctx.fillStyle = '#F59E0B';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
    ctx.shadowBlur = 14;
  } else {
    ctx.fillStyle = '#06B6D4';
    ctx.shadowColor = 'rgba(6, 182, 212, 0.7)';
    ctx.shadowBlur = 16;
  }

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(boxX, boxY, boxW, boxH, boxH / 2);
  } else {
    ctx.rect(boxX, boxY, boxW, boxH);
  }
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = callout.style === 'warning-box' ? '#000000' : '#FFFFFF';
  ctx.fillText(callout.text, posX, posY, textWidth);

  ctx.restore();
};

export const drawStudioSubtitle = (
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  style: SubtitleStyle = 'karaoke-yellow',
  activeWordIndex: number = -1,
  karaokeEnabled: boolean = true,
  captionPositionY: number = 74
) => {
  if (!text || !text.trim()) return;

  const isVertical = height > width;
  // Font size tailored to vertical short-form reels vs horizontal
  const fontSize = Math.max(22, Math.floor(height * (isVertical ? 0.038 : 0.048)));
  const lineHeight = fontSize * 1.32;
  const maxLineWidth = width * (isVertical ? 0.88 : 0.82);

  ctx.save();
  ctx.font = `900 ${fontSize}px "Assistant", "Heebo", "Rubik", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  const page = pageAtWord(captionPages(text, value => ctx.measureText(value).width, maxLineWidth), Math.max(0, activeWordIndex));
  const linesToRender = page?.lines || [];
  const wordOffset = page?.first || 0;

  const totalBlockHeight = linesToRender.length * lineHeight;
  // Position strictly in the safe lower-third zone (82% for vertical, 85% for horizontal)
  const baseY = height * (captionPositionY / 100);
  const startY = baseY - (totalBlockHeight / 2) + (lineHeight / 2);

  let globalWordCounter = wordOffset;

  linesToRender.forEach((lineWords, lineIndex) => {
    const fullLineStr = lineWords.join(' ');
    const lineY = startY + lineIndex * lineHeight;
    const metrics = ctx.measureText(fullLineStr);
    const textWidth = Math.min(metrics.width, maxLineWidth);
    const paddingX = fontSize * 0.55;
    const paddingY = fontSize * 0.20;
    const rectX = (width / 2) - (textWidth / 2) - paddingX;
    const rectY = lineY - (fontSize / 2) - paddingY;
    const rectW = textWidth + paddingX * 2;
    const rectH = fontSize + paddingY * 2;

    // Background Box (Only if not floating style)
    if (style !== 'karaoke-clean-floating') {
      if (style === 'karaoke-brand-cyan') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.90)'; // Dark Slate/Indigo
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.86)'; // Compact Black
      }
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rectX, rectY, rectW, rectH, 10);
      } else {
        ctx.rect(rectX, rectY, rectW, rectH);
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (style === 'karaoke-brand-cyan') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Text Outline / Stroke
    if (style === 'karaoke-clean-floating') {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(5, Math.floor(fontSize * 0.22));
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 12;
      ctx.lineJoin = 'round';
    } else {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(3, Math.floor(fontSize * 0.12));
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
    }

    if (!karaokeEnabled || activeWordIndex === -1) {
      ctx.strokeText(fullLineStr, width / 2, lineY, maxLineWidth);
      if (style === 'karaoke-yellow') {
        ctx.fillStyle = '#FFE600';
      } else if (style === 'karaoke-brand-cyan') {
        ctx.fillStyle = '#38BDF8';
      } else if (style === 'karaoke-brand-coral') {
        ctx.fillStyle = '#FB7185';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillText(fullLineStr, width / 2, lineY, maxLineWidth);
    } else {
      // Dynamic Word-by-Word rendering (RTL right-to-left layout)
      let currentX = (width / 2) + (textWidth / 2);

      lineWords.forEach((word) => {
        const isCurrentActiveWord = globalWordCounter === activeWordIndex;
        const wordMetrics = { width: Math.min(ctx.measureText(word).width, maxLineWidth) };
        const spaceMetrics = ctx.measureText(' ');
        const wordCenterX = currentX - (wordMetrics.width / 2);

        ctx.textAlign = 'center';
        ctx.strokeText(word, wordCenterX, lineY, maxLineWidth);

        if (isCurrentActiveWord) {
          // Highlight Active Word with Brand Colors
          if (style === 'karaoke-brand-cyan') {
            ctx.fillStyle = '#38BDF8'; // Heart Compass Cyan Pop
          } else if (style === 'karaoke-brand-coral') {
            ctx.fillStyle = '#FB7185'; // Compass Rose/Coral Pop
          } else if (style === 'karaoke-clean-floating') {
            ctx.fillStyle = '#FFE600'; // Floating Gold Pop
          } else {
            ctx.fillStyle = '#FFE600'; // Hormozi Yellow Pop
          }
        } else {
          // Inactive words rendered in crisp white
          ctx.fillStyle = '#FFFFFF';
        }

        ctx.fillText(word, wordCenterX, lineY, maxLineWidth);

        currentX -= (wordMetrics.width + spaceMetrics.width);
        globalWordCounter++;
      });
    }
  });

  ctx.restore();
};

/**
 * High-Speed Offline Audio Silence Detector
 * Detects quiet speech boundaries to auto-trim video head & tail.
 */
export const detectAudioSilence = async (
  videoBlob: Blob,
  silenceThreshold: number = 0.02
): Promise<{ start: number; end: number; duration: number }> => {
  const arrayBuffer = await videoBlob.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = channelData.length;
    const duration = audioBuffer.duration;

    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
    let firstSpeechSample = 0;
    let lastSpeechSample = totalSamples - 1;

    // Scan from beginning
    for (let i = 0; i < totalSamples - windowSize; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += Math.abs(channelData[i + j]);
      }
      const rms = sum / windowSize;
      if (rms > silenceThreshold) {
        firstSpeechSample = Math.max(0, i - Math.floor(sampleRate * 0.1)); // 100ms padding
        break;
      }
    }

    // Scan from end
    for (let i = totalSamples - windowSize; i > 0; i -= windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += Math.abs(channelData[i + j]);
      }
      const rms = sum / windowSize;
      if (rms > silenceThreshold) {
        lastSpeechSample = Math.min(totalSamples - 1, i + windowSize + Math.floor(sampleRate * 0.15)); // 150ms padding
        break;
      }
    }

    const startSec = Number((firstSpeechSample / sampleRate).toFixed(2));
    const endSec = Number((lastSpeechSample / sampleRate).toFixed(2));

    return {
      start: startSec,
      end: endSec > startSec ? endSec : duration,
      duration
    };
  } finally {
    audioCtx.close();
  }
};


export const renderStudioFrame = (
  ctx: CanvasRenderingContext2D,
  videoElement: HTMLVideoElement,
  ambientCanvas: HTMLCanvasElement,
  ambientCtx: CanvasRenderingContext2D,
  currentPos: number,
  width: number,
  height: number,
  srcW: number,
  srcH: number,
  isSourceVertical: boolean,
  isTargetVertical: boolean,
  brightness: number,
  contrast: number,
  visualOverlays: VisualOverlayItem[],
  preloadedImages: Map<string, HTMLImageElement>,
  headlineText: string,
  captions: CaptionItem[],
  subtitleStyle: SubtitleStyle,
  karaokeEnabled: boolean,
  videoFitMode: 'cover' | 'contain' = 'cover',
  captionPositionY: number = 74,
  textCallouts: TextCalloutItem[] = []
) => {
  // Use the exact same centered cover/contain geometry as CSS object-fit in preview.
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height);
  ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
  const frame = fitMediaFrame(srcW, srcH, width, height, videoFitMode);
  ctx.drawImage(videoElement, frame.sx, frame.sy, frame.sw, frame.sh, frame.dx, frame.dy, frame.width, frame.height);
  ctx.filter = 'none';

  // 2. Draw active Visual Overlays (Hook Cover, B-Roll, PiP)
  if (visualOverlays && visualOverlays.length > 0) {
    for (const overlay of visualOverlays) {
      if (currentPos >= overlay.startTime && currentPos <= overlay.endTime) {
        const img = preloadedImages.get(overlay.id);
        if (img) {
          drawVisualOverlay(ctx, overlay, img, currentPos, width, height);
        }
      }
    }
  }

  // 3. Draw Top Headline Overlay if provided
  if (headlineText) {
    drawHeadlineOverlay(ctx, headlineText, width, height);
  }

  // 3.5. Draw Kinetic Pop-up Callouts if active
  if (textCallouts && textCallouts.length > 0) {
    for (const callout of textCallouts) {
      if (currentPos >= callout.startTime && currentPos <= callout.endTime) {
        drawTextCallout(ctx, callout, width, height);
      }
    }
  }

  // 4. Draw burnt-in subtitle if active with active word highlight
  const activeCap = captions.find(c => currentPos >= c.start && currentPos < c.end);
  if (activeCap) {
    const capDuration = Math.max(0.1, activeCap.end - activeCap.start);
    const elapsed = Math.max(0, currentPos - activeCap.start);
    const words = activeCap.text.trim().split(/\s+/);
    const activeWordIndex = Math.min(words.length - 1, Math.floor((elapsed / capDuration) * words.length));

    drawStudioSubtitle(ctx, activeCap.text, width, height, subtitleStyle, activeWordIndex, karaokeEnabled, captionPositionY);
  }
};

/**
 * High-Speed Sequential WebCodecs + MP4-Muxer Engine
 * Produces 100% genuine MP4 (H.264 High/Main + AAC 48kHz stereo) with Fast-Start headers.
 * Browser codec support is checked at runtime; the media-element engine is the fallback.
 */
async function exportVideoWithWebCodecs(options: RenderOptions): Promise<Blob> {
  const {
    videoElement,
    videoBlob,
    captions,
    visualOverlays = [],
    trimStart,
    trimEnd,
    brightness,
    contrast = 1,
    subtitleStyle,
    exportAspectRatio,
    karaokeEnabled = true,
    headlineText = '',
    sourceVolume = 1,
    musicBlob = null,
    musicVolume = 0.2,
    musicFitMode = 'auto',
    captionPositionY = 74,
    textCallouts = [],
    onProgress
  } = options;

  const srcW = videoElement.videoWidth || 1080;
  const srcH = videoElement.videoHeight || 1920;

  let width = srcW;
  let height = srcH;
  if (exportAspectRatio === '16:9') {
    width = 1920;
    height = 1080;
  } else if (exportAspectRatio === '9:16') {
    width = 1080;
    height = 1920;
  }

  // Ensure dimensions are even numbers (H.264 requirement)
  width = width % 2 === 0 ? width : width - 1;
  height = height % 2 === 0 ? height : height - 1;

  const fps = 30;
  const maxVideoDuration = (Number.isFinite(videoElement.duration) && videoElement.duration > 0)
    ? videoElement.duration
    : Infinity;
  const safeTrimEnd = Math.min(trimEnd, maxVideoDuration);
  const targetEndTime = Math.max(trimStart + 0.3, safeTrimEnd);
  const duration = Math.max(0.3, targetEndTime - trimStart);

  onProgress(2, 'מחלץ רצועות וידאו ואודיו לקידוד MP4 סופי...');

  // Keep screen awake during export on mobile/laptops
  let wakeLock: any = null;
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
    }
  } catch {}

  // Decode into PCM once. Preview and export use the same gain/limiter settings.
  let audioBuffer: AudioBuffer | null = null;
  const audioCtx = new AudioContext();
  try {
    const blob = videoBlob || await (await fetch(videoElement.currentSrc || videoElement.src)).blob();
    // A decode failure must fall back to the media-element engine, never silently drop speech.
    const rawDecoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000);
    const bus = createMixBus(offline, offline.destination);
    bus.source.gain.value = Math.max(0, Math.min(1, sourceVolume));
    bus.music.gain.value = Math.max(0, Math.min(1, musicVolume));
    const source = offline.createBufferSource();
    source.buffer = rawDecoded; source.connect(bus.source);
    source.start(0, trimStart, duration);
    if (musicBlob) {
      const music = offline.createBufferSource();
      music.buffer = await audioCtx.decodeAudioData(await musicBlob.arrayBuffer());
      music.loop = musicFitMode === 'loop' || (musicFitMode === 'auto' && music.buffer.duration < duration);
      music.connect(bus.music);
      const fade = Math.min(0.8, duration / 3);
      bus.music.gain.setValueAtTime(Math.max(0, Math.min(1, musicVolume)), duration - fade);
      bus.music.gain.linearRampToValueAtTime(0, duration);
      music.start(0);
    }
    audioBuffer = await offline.startRendering();
    finishAudioSamples(Array.from({ length: audioBuffer.numberOfChannels }, (_, ch) => audioBuffer!.getChannelData(ch)), audioBuffer.sampleRate);
  } finally { await audioCtx.close(); }

  // 2. Preload visual overlay images
  const preloadedImages = new Map<string, HTMLImageElement>();
  if (visualOverlays && visualOverlays.length > 0) {
    await Promise.all(
      visualOverlays.map(item => {
        return new Promise<void>((res) => {
          if (!item.imageUrl) return res();
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            preloadedImages.set(item.id, img);
            res();
          };
          img.onerror = () => res();
          img.src = item.imageUrl;
        });
      })
    );
  }

  // 3. Canvas setup
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;

  const ambientCanvas = document.createElement('canvas');
  ambientCanvas.width = 120;
  ambientCanvas.height = Math.round(120 * (height / width));
  const ambientCtx = ambientCanvas.getContext('2d', { alpha: false })!;

  const isSourceVertical = srcH > srcW;
  const isTargetVertical = height > width;

  // 4. Setup MP4 Muxer & VideoEncoder
  const hasAudio = !!(audioBuffer && typeof AudioEncoder !== 'undefined');
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height
    },
    audio: hasAudio && audioBuffer ? {
      codec: 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate
    } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      console.error('VideoEncoder error:', e);
      encoderError = e;
    }
  });

  const candidateCodecs = ['avc1.640028', 'avc1.4d002a', 'avc1.42001f'];
  let chosenCodec = 'avc1.42001f';
  for (const c of candidateCodecs) {
    try {
      const isSupp = await VideoEncoder.isConfigSupported({
        codec: c,
        width,
        height,
        bitrate: 8_000_000,
        framerate: fps
      });
      if (isSupp.supported) {
        chosenCodec = c;
        break;
      }
    } catch (e) {}
  }

  videoEncoder.configure({
    codec: chosenCodec,
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps
  });

  // 5. Deterministic Sequential Video Frame Rendering
  const originalMuted = videoElement.muted;
  const originalVolume = videoElement.volume;

  const originalCurrentTime = videoElement.currentTime;

  const totalFrames = Math.max(1, Math.round(duration * fps));
  const frameIntervalUs = Math.round((1 / fps) * 1_000_000);

  const seekVideo = (time: number): Promise<void> => {
    if (!videoElement.seeking && Math.abs(videoElement.currentTime - time) < 0.002 && videoElement.readyState >= 2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        videoElement.removeEventListener('seeked', done);
        videoElement.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      };
      const done = () => finish();
      const failed = () => finish(new Error('פענוח הפריים נכשל'));
      const timer = setTimeout(() => finish(new Error('פענוח פריים ארך זמן רב מדי')), 10000);
      videoElement.addEventListener('seeked', done, { once: true });
      videoElement.addEventListener('error', failed, { once: true });
      try { videoElement.currentTime = time; } catch (error) { finish(error instanceof Error ? error : new Error('הניווט לפריים נכשל')); }
    });
  };

  try {
    videoElement.muted = true;
    videoElement.pause();

    for (let i = 0; i < totalFrames; i++) {
      if (encoderError) throw encoderError;

      const frameTime = trimStart + (i / fps);
      await seekVideo(frameTime);

      renderStudioFrame(
        ctx,
        videoElement,
        ambientCanvas,
        ambientCtx,
        frameTime,
        width,
        height,
        srcW,
        srcH,
        isSourceVertical,
        isTargetVertical,
        brightness,
        contrast,
        visualOverlays,
        preloadedImages,
        headlineText,
        captions,
        subtitleStyle,
        karaokeEnabled,
        options.videoFitMode || 'cover',
        captionPositionY,
        textCallouts
      );

      const timestampUs = Math.round((i / fps) * 1_000_000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameIntervalUs
      });

      const isKey = i % (fps * 2) === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKey });
      videoFrame.close();

      if (videoEncoder.encodeQueueSize > 8) {
        await videoEncoder.flush();
      }

      if (i % 6 === 0 || i === totalFrames - 1) {
        const pct = Math.min(90, Math.round((i / totalFrames) * 85) + 5);
        const remSec = Math.max(1, Math.round((totalFrames - i) / fps));
        onProgress(pct, `מרנדר MP4 באיכות סטודיו (${pct}%) • נותרו כ-${remSec} שנ'...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    onProgress(92, 'סוגר קידוד וידאו H.264...');
    await videoEncoder.flush();
    if (encoderError) throw encoderError;

    // 6. Encode Audio (AAC) into Muxer matching exact duration
    if (hasAudio && audioBuffer) {
      onProgress(94, 'מקודד רצועת שמע AAC צלולה ב-48kHz...');
      let audioErr: Error | null = null;
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          console.error('AudioEncoder error:', e);
          audioErr = e;
        }
      });

      try {
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        bitrate: 192_000
      });

      const totalSamples = audioBuffer.length;
      const chunkSize = 1024;
      const numChannels = audioBuffer.numberOfChannels;

      for (let offset = 0; offset < totalSamples; offset += chunkSize) {
        if (audioErr) throw audioErr;
        const currentChunkSize = Math.min(chunkSize, totalSamples - offset);
        const audioDataPlanar = new Float32Array(currentChunkSize * numChannels);

        for (let ch = 0; ch < numChannels; ch++) {
          const channelData = audioBuffer.getChannelData(ch);
          const sub = channelData.subarray(offset, offset + currentChunkSize);
          audioDataPlanar.set(sub, ch * currentChunkSize);
        }

        const timestampUs = Math.round((offset / audioBuffer.sampleRate) * 1_000_000);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: audioBuffer.sampleRate,
          numberOfFrames: currentChunkSize,
          numberOfChannels: numChannels,
          timestamp: timestampUs,
          data: audioDataPlanar
        });

        audioEncoder.encode(audioData);
        audioData.close();
        while (audioEncoder.encodeQueueSize > 24) await new Promise(resolve => setTimeout(resolve, 0));
      }

      await audioEncoder.flush();
      if (audioErr) throw audioErr;
      } finally { if (audioEncoder.state !== 'closed') audioEncoder.close(); }
    }
  } finally {
    try { videoElement.pause(); } catch (e) {}
    videoElement.muted = originalMuted;
    videoElement.volume = originalVolume;
    videoElement.currentTime = originalCurrentTime;
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    wakeLock?.release().catch(() => {});
    canvas.width = 0;
    canvas.height = 0;
    ambientCanvas.width = 0;
    ambientCanvas.height = 0;
  }

  onProgress(99, 'סוגר קובץ MP4 סופי עם Fast-Start...');
  muxer.finalize();

  const { buffer } = muxer.target;
  onProgress(100, 'הרינדור הושלם בהצלחה!');
  return new Blob([buffer], { type: 'video/mp4' });
}

/**
 * MediaRecorder Fallback Engine (with fixWebmDuration header repair)
 */
async function exportVideoWithMediaRecorder(options: RenderOptions): Promise<Blob> {
  const { 
    videoElement: previewVideo,
    captions, 
    visualOverlays = [],
    trimStart, 
    trimEnd, 
    brightness, 
    contrast = 1, 
    subtitleStyle, 
    exportAspectRatio,
    karaokeEnabled = true,
    headlineText = '',
    sourceVolume = 1,
    musicBlob = null,
    musicVolume = 0.2,
    musicFitMode = 'auto',
    captionPositionY = 74,
    textCallouts = [],
    onProgress 
  } = options;

  const videoElement = document.createElement('video');
  videoElement.preload = 'auto'; videoElement.playsInline = true;
  videoElement.crossOrigin = 'anonymous'; videoElement.src = previewVideo.currentSrc || previewVideo.src;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('טעינת הסרטון לייצוא ארכה זמן רב מדי')), 15000);
    videoElement.onloadeddata = () => { clearTimeout(timer); resolve(); };
    videoElement.onerror = () => { clearTimeout(timer); reject(new Error('לא ניתן לטעון את הסרטון לייצוא')); };
    videoElement.load();
  });
  const srcW = videoElement.videoWidth || 1080;
  const srcH = videoElement.videoHeight || 1920;

  let width = srcW;
  let height = srcH;

  if (exportAspectRatio === '16:9') {
    width = 1920;
    height = 1080;
  } else if (exportAspectRatio === '9:16') {
    width = 1080;
    height = 1920;
  }

  const fps = 30;
  const maxVideoDuration = (Number.isFinite(videoElement.duration) && videoElement.duration > 0) ? videoElement.duration : Infinity;
  const safeTrimEnd = Math.min(trimEnd, maxVideoDuration);
  const targetEndTime = Math.max(trimStart + 0.3, safeTrimEnd);
  const duration = Math.max(0.3, targetEndTime - trimStart);

  return new Promise<Blob>(async (resolve, reject) => {
    let isCompleted = false;
    let hasResolved = false;
    let animationId: number | null = null;
    let watchdogTimer: any = null;
    let exportAudioContext: AudioContext | null = null;
    let exportMusicElement: HTMLAudioElement | null = null;
    let exportMusicUrl: string | null = null;
    const originalMuted = videoElement.muted;
    const originalVolume = videoElement.volume;

    try {
      onProgress(5, 'מאתחל מנוע רינדור מהיר...');

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;

      const ambientCanvas = document.createElement('canvas');
      ambientCanvas.width = 120;
      ambientCanvas.height = Math.round(120 * (height / width));
      const ambientCtx = ambientCanvas.getContext('2d', { alpha: false })!;

      const preloadedImages = new Map<string, HTMLImageElement>();
      if (visualOverlays && visualOverlays.length > 0) {
        await Promise.all(
          visualOverlays.map(item => {
            return new Promise<void>((res) => {
              if (!item.imageUrl) return res();
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                preloadedImages.set(item.id, img);
                res();
              };
              img.onerror = () => res();
              img.src = item.imageUrl;
            });
          })
        );
      }

      const stream = canvas.captureStream(fps);

      exportAudioContext = new AudioContext({ sampleRate: 48000 });
      const mixDestination = exportAudioContext.createMediaStreamDestination();
      const bus = createMixBus(exportAudioContext, mixDestination);
      bus.source.gain.value = Math.max(0, Math.min(1, sourceVolume));
      bus.music.gain.value = Math.max(0, Math.min(1, musicVolume));
      exportAudioContext.createMediaElementSource(videoElement).connect(bus.source);
      if (musicBlob) {
        exportMusicUrl = URL.createObjectURL(musicBlob);
        exportMusicElement = new Audio(); exportMusicElement.preload = 'auto';
        await new Promise<void>((resolveMusic, rejectMusic) => {
          const timer = setTimeout(() => rejectMusic(new Error('טעינת המוזיקה ארכה זמן רב מדי')), 15000);
          exportMusicElement!.onloadedmetadata = () => { clearTimeout(timer); resolveMusic(); };
          exportMusicElement!.onerror = () => { clearTimeout(timer); rejectMusic(new Error('לא ניתן לקרוא את המוזיקה')); };
          exportMusicElement!.src = exportMusicUrl!;
        });
        exportMusicElement.loop = musicFitMode === 'loop' || (musicFitMode === 'auto' && exportMusicElement.duration < duration);
        exportAudioContext.createMediaElementSource(exportMusicElement).connect(bus.music);
      }
      stream.addTrack(mixDestination.stream.getAudioTracks()[0]);
      await exportAudioContext.resume();

      const candidates = [
        'video/mp4;codecs=avc1.640028,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm'
      ];

      let selectedMimeType = 'video/webm';
      for (const mime of candidates) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 192_000
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const finishExport = () => {
        if (isCompleted) return;
        isCompleted = true;

        videoElement.removeEventListener('ended', finishExport);
        videoElement.removeEventListener('timeupdate', onTimeUpdate);
        videoElement.removeEventListener('pause', onPauseCheck);
        videoElement.removeEventListener('error', finishExport);

        if (watchdogTimer) clearTimeout(watchdogTimer);
        if (animationId) cancelAnimationFrame(animationId);

        try {
          videoElement.pause();
        } catch (e) {}

        try {
          exportMusicElement?.pause();
        } catch (e) {}
        if (exportMusicUrl) {
          URL.revokeObjectURL(exportMusicUrl);
          exportMusicUrl = null;
        }

        videoElement.muted = originalMuted;
        videoElement.volume = originalVolume;

        onProgress(99, 'סוגר קובץ וידאו ומייצר MP4...');

        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch (e) {}
        }

        setTimeout(async () => {
          if (!hasResolved && chunks.length > 0) {
            hasResolved = true;
            onProgress(100, 'הרינדור הושלם בהצלחה!');
            const rawBlob = new Blob(chunks, {
              type: selectedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
            });

            if (selectedMimeType.includes('webm')) {
              try {
                fixWebmDuration(rawBlob, duration * 1000, (fixedBlob: Blob) => {
                  resolve(fixedBlob);
                });
                return;
              } catch (e) {}
            }
            resolve(rawBlob);
          }
        }, 500);
      };

      const onTimeUpdate = () => {
        if (videoElement.currentTime >= targetEndTime - 0.02 || (videoElement.currentTime >= targetEndTime - 0.5 && videoElement.ended)) {
          finishExport();
        }
      };

      const onPauseCheck = () => {
        if (videoElement.currentTime >= targetEndTime - 0.2 || videoElement.currentTime > trimStart + 0.5) {
          if (videoElement.currentTime >= targetEndTime - 0.15 || videoElement.ended) {
            finishExport();
          }
        }
      };

      videoElement.addEventListener('ended', finishExport);
      videoElement.addEventListener('timeupdate', onTimeUpdate);
      videoElement.addEventListener('pause', onPauseCheck);
      videoElement.addEventListener('error', finishExport);

      const maxAllowedSeconds = Math.max(30, duration * 2.5 + 20);
      watchdogTimer = setTimeout(() => {
        finishExport();
      }, maxAllowedSeconds * 1000);

      recorder.onstop = () => {
        if (exportAudioContext?.state !== 'closed') void exportAudioContext?.close();
        videoElement.removeAttribute('src'); videoElement.load();
        stream.getTracks().forEach(track => track.stop());
        if (hasResolved) return;
        hasResolved = true;
        onProgress(100, 'הרינדור הושלם בהצלחה!');
        const rawBlob = new Blob(chunks, {
          type: selectedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
        });

        if (selectedMimeType.includes('webm')) {
          try {
            fixWebmDuration(rawBlob, duration * 1000, (fixedBlob: Blob) => {
              resolve(fixedBlob);
            });
            return;
          } catch (e) {}
        }
        resolve(rawBlob);
      };

      videoElement.muted = false; videoElement.volume = 1;
      if (Math.abs(videoElement.currentTime - trimStart) > 0.001) {
        await new Promise<void>((resolveSeek, rejectSeek) => {
          const timer = setTimeout(() => { videoElement.removeEventListener('seeked', onSeeked); rejectSeek(new Error('הניווט לתחילת הקטע נכשל')); }, 10000);
          const onSeeked = () => { clearTimeout(timer); resolveSeek(); };
          videoElement.addEventListener('seeked', onSeeked, { once: true });
          videoElement.currentTime = trimStart;
        });
      }
      const now = exportAudioContext!.currentTime;
      const voice = Math.max(0, Math.min(1, sourceVolume));
      bus.source.gain.setValueAtTime(0, now);
      bus.source.gain.linearRampToValueAtTime(voice, now + 0.005);
      bus.source.gain.setValueAtTime(voice, now + Math.max(0.005, duration - 0.005));
      bus.source.gain.linearRampToValueAtTime(0, now + duration);
      const musicFade = Math.min(0.8, duration / 3);
      bus.music.gain.setValueAtTime(Math.max(0, Math.min(1, musicVolume)), now + duration - musicFade);
      bus.music.gain.linearRampToValueAtTime(0, now + duration);

      recorder.start(250);
      const playbackPromises: Promise<void>[] = [videoElement.play()];
      if (exportMusicElement) {
        exportMusicElement.currentTime = 0;
        playbackPromises.push(exportMusicElement.play());
      }
      await Promise.all(playbackPromises);

      // The recorder is running before playback so the first audio samples are retained.
      const isSourceVertical = srcH > srcW;
      const isTargetVertical = height > width;

      const renderLoop = () => {
        if (isCompleted) return;
        const currentPos = videoElement.currentTime;

        if (currentPos >= targetEndTime - 0.03 || videoElement.ended) {
          finishExport();
          return;
        }

        const progressPct = Math.min(99, Math.round(((currentPos - trimStart) / duration) * 100));
        onProgress(progressPct, `מעבד וידאו וכתוביות (${isTargetVertical ? '9:16 Reels' : '16:9 YouTube'}): ${progressPct}%`);

        renderStudioFrame(
          ctx,
          videoElement,
          ambientCanvas,
          ambientCtx,
          currentPos,
          width,
          height,
          srcW,
          srcH,
          isSourceVertical,
          isTargetVertical,
          brightness,
          contrast,
          visualOverlays,
          preloadedImages,
          headlineText,
          captions,
          subtitleStyle,
          karaokeEnabled,
          options.videoFitMode || 'cover',
        captionPositionY,
        textCallouts
        );

        animationId = requestAnimationFrame(renderLoop);
      };

      animationId = requestAnimationFrame(renderLoop);

    } catch (err) {
      console.error('MediaRecorder Export Error:', err);
      try {
        exportMusicElement?.pause();
      } catch (e) {}
      if (exportMusicUrl) URL.revokeObjectURL(exportMusicUrl);
      if (exportAudioContext && exportAudioContext.state !== 'closed') {
        exportAudioContext.close().catch(() => undefined);
      }
      videoElement.muted = originalMuted;
      videoElement.volume = originalVolume;
      reject(err);
    }
  });
}

/**
 * Studio MP4 Video Exporter
 * Uses high-performance deterministic WebCodecs engine (VideoEncoder + AudioEncoder) with pure PCM audio extraction
 * for 100% click-free, pop-free, crystal clear MP4 export. Falls back to smooth MediaRecorder if needed.
 */
export const exportVideoToMP4 = async (options: RenderOptions): Promise<Blob> => {
  const isWebCodecsSupported = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined'; // Prioritize fast, smooth real-time MediaRecorder export (30s-60s)
  if (isWebCodecsSupported) {
    try {
      return await exportVideoWithWebCodecs(options);
    } catch (err) {
      console.warn('WebCodecs export failed, falling back to MediaRecorder:', err);
    }
  }
  return await exportVideoWithMediaRecorder(options);
};

export const exportCaptionsToSRT = (captions: CaptionItem[], from = 0, to = Infinity): string => {
  const formatTime = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds * 1000));
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${pad(Math.floor(total / 3600000))}:${pad(Math.floor(total / 60000) % 60)}:${pad(Math.floor(total / 1000) % 60)},${pad(total % 1000, 3)}`;
  };

  return captions.filter(cap => cap.end > from && cap.start < to)
    .map(cap => ({ ...cap, start: Math.max(from, cap.start) - from, end: Math.min(to, cap.end) - from }))
    .map((cap, i) => `${i + 1}\n${formatTime(cap.start)} --> ${formatTime(cap.end)}\n${cap.text}\n`)
    .join('\n');
};
