import { TextRenderSettings, textFontSize, safeTextCenter } from './textOverlay';
import { mountExportSurface, waitForVideoData, seekExportVideo, pumpExportFrames, frameLuma, verifyExportedVideo } from './videoExportRuntime';
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
  textSettings?: TextRenderSettings;
  onFrameRendered?: (time: number, canvas: HTMLCanvasElement) => void;
  textCallouts?: TextCalloutItem[];
  onProgress: (percent: number, statusText: string) => void;
}

export const drawHeadlineOverlay = (
  ctx: CanvasRenderingContext2D,
  headlineText: string,
  width: number,
  height: number,
  settings: TextRenderSettings = {}
) => {
  if (!headlineText || !headlineText.trim()) return;

  const isVertical = height > width;
  const fontSize = textFontSize(width, height, settings.headlineFontScale, 'headline');
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


  // Measure max width of lines for background card
  let maxW = 0;
  lines.forEach(l => {
    const w = ctx.measureText(l).width;
    if (w > maxW) maxW = w;
  });

  const cardW = Math.min(width * 0.94, maxW + paddingX * 2);
  const cardH = totalBlockHeight + paddingY * 2;
  const center = safeTextCenter(width, height, cardW, cardH, settings.headlinePositionX ?? 50, settings.headlinePositionY ?? 10);
  const cardX = center.x - cardW / 2;
  const cardY = center.y - cardH / 2;

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
    ctx.fillText(line, center.x, y, maxLineWidth);
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
  const fontSize = textFontSize(width, height, callout.fontScale, 'callout');


  ctx.save();
  ctx.font = `900 ${fontSize}px "Assistant", "Heebo", "Rubik", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  const paddingX = fontSize * .85, paddingY = fontSize * .36;
  const maxTextWidth = Math.max(1, width * .94 - paddingX * 2);
  const lines: string[] = []; let line = '';
  for (const word of callout.text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxTextWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const textWidth = Math.min(maxTextWidth, Math.max(...lines.map(value => ctx.measureText(value).width)));
  const boxW = textWidth + paddingX * 2, lineHeight = fontSize * 1.25;
  const boxH = lines.length * lineHeight + paddingY * 2;
  const center = safeTextCenter(width, height, boxW, boxH, callout.positionX ?? 50, callout.positionY ?? 32);
  const posX = center.x, posY = center.y;
  const boxX = posX - boxW / 2, boxY = posY - boxH / 2;

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
  lines.forEach((line, index) => ctx.fillText(line, posX, posY + (index - (lines.length - 1) / 2) * lineHeight, maxTextWidth));

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
  captionPositionY: number = 74,
  captionPositionX: number = 50,
  captionFontScale: number = 1
) => {
  if (!text || !text.trim()) return;

  const isVertical = height > width;
  // Font size tailored to vertical short-form reels vs horizontal
  const fontSize = textFontSize(width, height, captionFontScale, 'caption');
  const lineHeight = fontSize * 1.32;
  const maxLineWidth = Math.max(1, Math.min(width * (isVertical ? .88 : .82), width * .94 - fontSize * 1.1));

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
  const blockWidth = Math.max(0, ...linesToRender.map(line => Math.min(maxLineWidth, ctx.measureText(line.join(' ')).width))) + fontSize * 1.1;
  const center = safeTextCenter(width, height, blockWidth, totalBlockHeight + fontSize * .4, captionPositionX, captionPositionY);
  const baseY = center.y;
  const startY = baseY - (totalBlockHeight / 2) + (lineHeight / 2);

  let globalWordCounter = wordOffset;

  linesToRender.forEach((lineWords, lineIndex) => {
    const fullLineStr = lineWords.join(' ');
    const lineY = startY + lineIndex * lineHeight;
    const metrics = ctx.measureText(fullLineStr);
    const textWidth = Math.min(metrics.width, maxLineWidth);
    const paddingX = fontSize * 0.55;
    const paddingY = fontSize * 0.20;
    const rectX = center.x - (textWidth / 2) - paddingX;
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
      ctx.strokeText(fullLineStr, center.x, lineY, maxLineWidth);
      if (style === 'karaoke-yellow') {
        ctx.fillStyle = '#FFE600';
      } else if (style === 'karaoke-brand-cyan') {
        ctx.fillStyle = '#38BDF8';
      } else if (style === 'karaoke-brand-coral') {
        ctx.fillStyle = '#FB7185';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillText(fullLineStr, center.x, lineY, maxLineWidth);
    } else {
      // Dynamic Word-by-Word rendering (RTL right-to-left layout)
      let currentX = center.x + (textWidth / 2);

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
  textCallouts: TextCalloutItem[] = [],
  textSettings: TextRenderSettings = {}
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
    drawHeadlineOverlay(ctx, headlineText, width, height, textSettings);
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

    drawStudioSubtitle(ctx, activeCap.text, width, height, subtitleStyle, activeWordIndex, karaokeEnabled, captionPositionY, textSettings.captionPositionX, textSettings.captionFontScale);
  }
};

/**
 * High-Speed Sequential WebCodecs + MP4-Muxer Engine
 * Produces 100% genuine MP4 (H.264 High/Main + AAC 48kHz stereo) with Fast-Start headers.
 * Browser codec support is checked at runtime; the media-element engine is the fallback.
 */
export async function exportVideoWithWebCodecs(options: RenderOptions): Promise<Blob> {
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
  // Prefer a synchronized 2D backing store for canvas -> VideoFrame on mobile GPUs.
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;

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
  let encodedPictureChunks = 0;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta); encodedPictureChunks++; },
    error: (e) => {
      console.error('VideoEncoder error:', e);
      encoderError = e;
    }
  });

  const candidateCodecs = ['avc1.420028', 'avc1.4d0028', 'avc1.640028'];
  let chosenCodec: string | null = null;
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

  if (!chosenCodec) { videoEncoder.close(); throw new Error('אין מקודד H.264 מתאים לגודל הסרטון.'); }
  videoEncoder.configure({
    codec: chosenCodec,
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps,
    avc: { format: 'avc' }
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

  const removePictureSurface = mountExportSurface(null, canvas, videoElement.parentElement || document.body);
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
    }
  } catch {}

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
        textCallouts,
        options.textSettings
      );

      options.onFrameRendered?.(frameTime, canvas);
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
    if (!encodedPictureChunks) throw new Error('המקודד לא הפיק רצועת תמונה.');

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
    removePictureSurface();
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
export async function exportVideoWithMediaRecorder(options: RenderOptions): Promise<Blob> {
  const { videoElement: preview, trimStart, trimEnd, onProgress } = options;
  const video = document.createElement('video');
  video.preload = 'auto'; video.playsInline = true; video.muted = true;
  video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
  video.crossOrigin = 'anonymous';
  const canvas = document.createElement('canvas');
  canvas.width = options.exportAspectRatio === '16:9' ? 1920 : options.exportAspectRatio === '9:16' ? 1080 : preview.videoWidth;
  canvas.height = options.exportAspectRatio === '16:9' ? 1080 : options.exportAspectRatio === '9:16' ? 1920 : preview.videoHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx || !canvas.width || !canvas.height) throw new Error('לא ניתן להכין תמונה לייצוא. טען את הסרטון ונסה שוב.');
  const removeSurface = mountExportSurface(video, canvas, preview.parentElement || document.body);
  let stream: MediaStream | null = null, audioContext: AudioContext | null = null;
  let recorder: MediaRecorder | null = null, music: HTMLAudioElement | null = null;
  let musicUrl: string | null = null, stopFrames: (() => void) | null = null;
  let wakeLock: any = null;
  try {
    onProgress(2, 'טוען פריים ראשון לייצוא תואם מובייל…');
    const loaded = waitForVideoData(video);
    video.src = preview.currentSrc || preview.src; video.load();
    await loaded;
    const end = Math.min(trimEnd, Number.isFinite(video.duration) ? video.duration : trimEnd);
    const duration = end - trimStart;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('טווח החיתוך ריק או לא תקין.');
    await seekExportVideo(video, trimStart);
    const images = new Map<string, HTMLImageElement>();
    await Promise.all((options.visualOverlays || []).map(overlay => new Promise<void>(resolve => {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => { images.set(overlay.id, image); resolve(); }; image.onerror = () => resolve(); image.src = overlay.imageUrl;
    })));
    let painted = 0;
    const paint = (time: number) => {
      if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) return;
      renderStudioFrame(ctx, video, canvas, ctx, time, canvas.width, canvas.height,
        video.videoWidth, video.videoHeight, video.videoHeight > video.videoWidth, canvas.height > canvas.width,
        options.brightness, options.contrast ?? 1, options.visualOverlays || [], images, options.headlineText || '',
        options.captions, options.subtitleStyle, options.karaokeEnabled ?? true, options.videoFitMode || 'cover',
        options.captionPositionY ?? 74, options.textCallouts || [], options.textSettings);
      options.onFrameRendered?.(time, canvas);
      painted++;
      const track = stream?.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      if (typeof track?.requestFrame === 'function') track.requestFrame();
    };
    // The capture track must see a real image before the recorder is started.
    paint(trimStart);
    if (!painted) throw new Error('אין תמונה מפוענחת לייצוא.');
    stream = canvas.captureStream(30);
    const pictureTrack = stream.getVideoTracks()[0];
    if (!pictureTrack || pictureTrack.readyState !== 'live') throw new Error('הדפדפן לא יצר רצועת וידאו.');
    audioContext = new AudioContext({ sampleRate: 48000 });
    const destination = audioContext.createMediaStreamDestination();
    const bus = createMixBus(audioContext, destination);
    bus.source.gain.value = Math.max(0, Math.min(1, options.sourceVolume ?? 1));
    bus.music.gain.value = Math.max(0, Math.min(1, options.musicVolume ?? .2));
    audioContext.createMediaElementSource(video).connect(bus.source);
    if (options.musicBlob) {
      musicUrl = URL.createObjectURL(options.musicBlob); music = new Audio(); music.preload = 'auto';
      const musicElement = music;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('טעינת המוזיקה ארכה זמן רב מדי.')), 15000);
        musicElement.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
        musicElement.onerror = () => { clearTimeout(timer); reject(new Error('לא ניתן לקרוא את המוזיקה.')); };
        musicElement.src = musicUrl!;
      });
      music.loop = options.musicFitMode === 'loop' || (options.musicFitMode !== 'trim' && music.duration < duration);
      audioContext.createMediaElementSource(music).connect(bus.music);
    }
    const audioTrack = destination.stream.getAudioTracks()[0]; if (audioTrack) stream.addTrack(audioTrack);
    await audioContext.resume();
    try { if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen'); } catch {}
    const mime = ['video/mp4;codecs=avc1.42E028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('הדפדפן אינו תומך בייצוא וידאו.');
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000 });
    const activeRecorder = recorder;
    const chunks: Blob[] = [];
    await new Promise<void>((resolve, reject) => {
      let finished = false, ending = false;
      let lastTime = trimStart, lastAdvance = performance.now();
      const cleanup = () => {
        clearInterval(watchdog); video.removeEventListener('ended', ended); video.removeEventListener('error', failed);
        document.removeEventListener('visibilitychange', visibility); stopFrames?.(); stopFrames = null;
      };
      const finish = (error?: Error) => {
        if (finished) return; finished = true; cleanup(); error ? reject(error) : resolve();
      };
      const stop = () => {
        if (ending) return; ending = true;
        if (painted < 2) { finish(new Error('לא התקבלו פריימים בזמן הייצוא. נסה שוב כשהדף פתוח.')); return; }
        video.pause(); music?.pause(); stopFrames?.(); stopFrames = null;
        if (activeRecorder.state !== 'inactive') activeRecorder.stop();
      };
      const ended = () => stop();
      const failed = () => finish(new Error('קריאת הווידאו נכשלה בזמן הייצוא.'));
      const visibility = () => { if (document.hidden) finish(new Error('הייצוא נעצר כשהדף הוסתר. השאר את הסטודיו פתוח ונסה שוב.')); };
      const watchdog = setInterval(() => {
        if (finished) return;
        if (video.currentTime > lastTime + .01) { lastTime = video.currentTime; lastAdvance = performance.now(); }
        if (performance.now() - lastAdvance > 15000) finish(new Error('הווידאו הפסיק להתקדם בזמן הייצוא. נסה שוב.'));
        else if (video.ended || video.currentTime >= end) stop();
      }, 250);
      activeRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      activeRecorder.onerror = () => finish(new Error('קידוד הווידאו נכשל בדפדפן.'));
      activeRecorder.onstop = () => finish(chunks.length ? undefined : new Error('קובץ הייצוא ריק.'));
      video.addEventListener('ended', ended); video.addEventListener('error', failed);
      document.addEventListener('visibilitychange', visibility);
      stopFrames = pumpExportFrames(video, time => {
        if (finished || ending) return;
        try {
          paint(Math.min(time, end));
          onProgress(Math.min(98, Math.round((time - trimStart) / duration * 98)), 'מייצא וידאו — השאר את הדף פתוח…');
          if (time >= end) stop();
        } catch (error) { finish(error instanceof Error ? error : new Error('ציור הפריים נכשל.')); }
      });
      const now = audioContext!.currentTime, voice = Math.max(0, Math.min(1, options.sourceVolume ?? 1));
      bus.source.gain.setValueAtTime(0, now); bus.source.gain.linearRampToValueAtTime(voice, now + .005);
      bus.source.gain.setValueAtTime(voice, now + Math.max(.005, duration - .005)); bus.source.gain.linearRampToValueAtTime(0, now + duration);
      const musicFade = Math.min(.8, duration / 3);
      bus.music.gain.setValueAtTime(Math.max(0, Math.min(1, options.musicVolume ?? .2)), now + duration - musicFade);
      bus.music.gain.linearRampToValueAtTime(0, now + duration);
      activeRecorder.start(250); paint(trimStart);
      // Route speech only through the export bus, separately from the preview audio graph.
      video.muted = false;
      Promise.all([video.play(), ...(music ? [music.play()] : [])]).catch(error => finish(error));
    });
    const blob = new Blob(chunks, { type: activeRecorder.mimeType || mime });
    onProgress(99, 'סוגר קובץ וידאו…');
    return mime.includes('webm') ? await new Promise<Blob>(resolve => fixWebmDuration(blob, duration * 1000, resolve)) : blob;
  } finally {
    stopFrames?.();
    if (recorder?.state !== 'inactive') { try { recorder?.stop(); } catch {} }
    video.pause(); music?.pause(); stream?.getTracks().forEach(track => track.stop());
    if (audioContext && audioContext.state !== 'closed') await audioContext.close();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    video.removeAttribute('src'); video.load(); removeSurface();
    wakeLock?.release().catch(() => {});
  }
}

/**
 * Studio MP4 Video Exporter
 * Uses high-performance deterministic WebCodecs engine (VideoEncoder + AudioEncoder) with pure PCM audio extraction
 * with explicit fallback when the browser cannot encode H.264/AAC.
 */
export const exportVideoToMP4 = async (options: RenderOptions): Promise<Blob> => {
  await document.fonts.ready;
  const midpoint = options.trimStart + (options.trimEnd - options.trimStart) / 2;
  const host = options.videoElement.parentElement || document.body;
  const run = async (engine: (options: RenderOptions) => Promise<Blob>) => {
    let proof: { time: number; luma: number } | undefined;
    const blob = await engine({ ...options, onFrameRendered: (time, canvas) => {
      if (!proof && time >= midpoint) {
        const luma = frameLuma(canvas);
        if (luma !== null) proof = { time: time - options.trimStart, luma };
      }
    } });
    options.onProgress(99, 'בודק שהתוצר כולל תמונה ניתנת לניגון…');
    await verifyExportedVideo(blob, host, proof);
    options.onProgress(100, 'הייצוא הושלם');
    return blob;
  };
  if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try { return await run(exportVideoWithWebCodecs); }
    catch (error) { console.warn('הקידוד המהיר נכשל; מנסה ייצוא בזמן אמת:', error); }
  }
  return await run(exportVideoWithMediaRecorder);
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
