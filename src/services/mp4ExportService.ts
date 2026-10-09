import { captionPages, pageAtWord } from './captionLayout';
export { splitLongCaptions } from './captionLayout';
import { CaptionItem, SubtitleStyle, VideoAspectRatio, VisualOverlayItem } from '../types/studio';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import fixWebmDuration from 'fix-webm-duration';

export interface RenderOptions {
  videoElement: HTMLVideoElement;
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

export const drawStudioSubtitle = (
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  style: SubtitleStyle = 'karaoke-yellow',
  activeWordIndex: number = -1,
  karaokeEnabled: boolean = true
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
  const baseY = isVertical ? height * 0.82 : height * 0.85;
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
  karaokeEnabled: boolean
) => {
  // 1. Draw video background / aspect ratio fitting
  if (isSourceVertical === isTargetVertical) {
    if (brightness !== 1 || contrast !== 1) {
      ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
    } else {
      ctx.filter = 'none';
    }
    ctx.drawImage(videoElement, 0, 0, width, height);
    ctx.filter = 'none';
  } else {
    // Cross-Format Conversion:
    // Ambient background blit (instantaneous, no GPU slowdown)
    ambientCtx.drawImage(videoElement, 0, 0, ambientCanvas.width, ambientCanvas.height);
    ctx.drawImage(ambientCanvas, 0, 0, width, height);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.72)';
    ctx.fillRect(0, 0, width, height);

    if (brightness !== 1 || contrast !== 1) {
      ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
    } else {
      ctx.filter = 'none';
    }

    let fitW = width;
    let fitH = height;
    let fitX = 0;
    let fitY = 0;

    if (isTargetVertical && !isSourceVertical) {
      fitW = width;
      fitH = (srcH / srcW) * width;
      fitY = (height - fitH) / 2;
    } else {
      fitH = height;
      fitW = (srcW / srcH) * height;
      fitX = (width - fitW) / 2;
    }

    ctx.drawImage(videoElement, fitX, fitY, fitW, fitH);
    ctx.filter = 'none';
  }

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

  // 4. Draw burnt-in subtitle if active with active word highlight
  const activeCap = captions.find(c => currentPos >= c.start && currentPos < c.end);
  if (activeCap) {
    const capDuration = Math.max(0.1, activeCap.end - activeCap.start);
    const elapsed = Math.max(0, currentPos - activeCap.start);
    const words = activeCap.text.trim().split(/\s+/);
    const activeWordIndex = Math.min(words.length - 1, Math.floor((elapsed / capDuration) * words.length));

    drawStudioSubtitle(ctx, activeCap.text, width, height, subtitleStyle, activeWordIndex, karaokeEnabled);
  }
};

/**
 * Deterministic Frame-by-Frame WebCodecs + MP4-Muxer Engine
 * Produces 100% genuine MP4 (H.264/AAC) with constant 30.000fps, zero stutter, zero dropped frames, and crystal clear sync.
 */
async function exportVideoWithWebCodecs(options: RenderOptions): Promise<Blob> {
  const {
    videoElement,
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
  const targetEndTime = Math.max(trimStart + 0.3, trimEnd);
  const duration = Math.max(0.3, targetEndTime - trimStart);
  const totalFrames = Math.max(1, Math.round(duration * fps));

  onProgress(2, 'מחלץ רצועות וידאו ואודיו לקידוד MP4 נקי מתקתוקים...');

  // 1. Extract and process audio data
  let audioBuffer: AudioBuffer | null = null;
  try {
    const srcUrl = videoElement.src || videoElement.currentSrc;
    if (srcUrl && (srcUrl.startsWith('blob:') || srcUrl.startsWith('http') || srcUrl.startsWith('data:'))) {
      const res = await fetch(srcUrl);
      const arrayBuf = await res.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      try {
        const rawDecoded = await audioCtx.decodeAudioData(arrayBuf);

        // Mix or process audio cleanly via OfflineAudioContext
        const sampleRate = rawDecoded.sampleRate || 48000;
        const totalRenderSamples = Math.ceil(duration * sampleRate);
        const offlineCtx = new OfflineAudioContext(
          rawDecoded.numberOfChannels || 2,
          totalRenderSamples,
          sampleRate
        );

        // Source Audio Node
        const sourceNode = offlineCtx.createBufferSource();
        sourceNode.buffer = rawDecoded;
        const sourceGain = offlineCtx.createGain();
        sourceGain.gain.value = Math.max(0, Math.min(1.5, sourceVolume));
        sourceNode.connect(sourceGain).connect(offlineCtx.destination);
        sourceNode.start(0, trimStart, duration);

        // Optional Background Music Node
        if (musicBlob) {
          try {
            const musicArrayBuf = await musicBlob.arrayBuffer();
            const musicDecoded = await audioCtx.decodeAudioData(musicArrayBuf);
            const musicNode = offlineCtx.createBufferSource();
            musicNode.buffer = musicDecoded;
            musicNode.loop = musicFitMode === 'loop' || (musicFitMode === 'auto' && musicDecoded.duration < duration);
            const musicGain = offlineCtx.createGain();
            const safeMusicVol = Math.max(0, Math.min(1, musicVolume));
            musicGain.gain.setValueAtTime(safeMusicVol, 0);

            const fadeDuration = Math.min(0.8, duration / 3);
            if (duration > fadeDuration) {
              musicGain.gain.setValueAtTime(safeMusicVol, duration - fadeDuration);
              musicGain.gain.linearRampToValueAtTime(0, duration);
            }
            musicNode.connect(musicGain).connect(offlineCtx.destination);
            musicNode.start(0, 0, duration);
          } catch (mErr) {
            console.warn('Background music decode note:', mErr);
          }
        }

        audioBuffer = await offlineCtx.startRendering();
      } finally {
        audioCtx.close();
      }
    }
  } catch (audioErr) {
    console.warn('Audio decoding for WebCodecs note:', audioErr);
  }

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

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e)
  });

  videoEncoder.configure({
    codec: 'avc1.640028', // H.264 High Profile Level 4.0
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps
  });

  videoElement.pause();

  // 5. Frame-by-Frame deterministic rendering loop
  for (let i = 0; i < totalFrames; i++) {
    const frameTime = trimStart + (i / fps);

    // Seek video element to exact frame timestamp with GPU presentation guarantee
    if (Math.abs(videoElement.currentTime - frameTime) > 0.001) {
      videoElement.currentTime = frameTime;
      await new Promise<void>((resolve) => {
        let isDone = false;
        const onFrameReady = () => {
          if (isDone) return;
          isDone = true;
          videoElement.removeEventListener('seeked', onSeeked);
          resolve();
        };
        const onSeeked = () => {
          if ('requestVideoFrameCallback' in videoElement) {
            (videoElement as any).requestVideoFrameCallback(() => onFrameReady());
          } else {
            requestAnimationFrame(() => onFrameReady());
          }
        };
        videoElement.addEventListener('seeked', onSeeked, { once: true });
        setTimeout(() => {
          if (!isDone) {
            isDone = true;
            videoElement.removeEventListener('seeked', onSeeked);
            resolve();
          }
        }, 120);
      });
    }

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
      karaokeEnabled
    );

    const timestampUs = Math.round(i * (1_000_000 / fps));
    const durationUs = Math.round(1_000_000 / fps);
    const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
    videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
    videoFrame.close();

    // Progress update
    const pct = Math.min(90, Math.round(((i + 1) / totalFrames) * 88));
    onProgress(pct, `מרנדר פריים ${i + 1} מתוך ${totalFrames} (${Math.round(((i + 1) / totalFrames) * 100)}%)...`);
  }

  onProgress(92, 'סוגר קידוד וידאו H.264...');
  await videoEncoder.flush();

  // 6. Encode Audio (AAC) without chunk boundary pops
  if (hasAudio && audioBuffer) {
    onProgress(95, 'מקודד רצועת שמע AAC צלולה בסנכרון מושלם...');
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error('AudioEncoder error:', e)
    });

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
      const currentChunkSize = Math.min(chunkSize, totalSamples - offset);
      // Fixed 1024 size buffer to prevent AAC boundary clicks on the final chunk
      const audioDataPlanar = new Float32Array(chunkSize * numChannels);

      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        const sub = channelData.subarray(offset, offset + currentChunkSize);
        audioDataPlanar.set(sub, ch * chunkSize);
      }

      const timestampUs = Math.round((offset / audioBuffer.sampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioBuffer.sampleRate,
        numberOfFrames: chunkSize,
        numberOfChannels: numChannels,
        timestamp: timestampUs,
        data: audioDataPlanar
      });

      audioEncoder.encode(audioData);
      audioData.close();
    }

    await audioEncoder.flush();
  }

  onProgress(99, 'סוגר קובץ MP4 סופי...');
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
    videoElement, 
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

  const fps = 30;
  const targetEndTime = Math.max(trimStart + 0.3, trimEnd);
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

      try {
        let audioStream: MediaStream | null = null;
        if ((videoElement as any).captureStream) {
          audioStream = (videoElement as any).captureStream();
        } else if ((videoElement as any).mozCaptureStream) {
          audioStream = (videoElement as any).mozCaptureStream();
        }

        const sourceAudioTracks = audioStream?.getAudioTracks() || [];
        const shouldMixAudio = sourceAudioTracks.length > 0 || Boolean(musicBlob);

        if (shouldMixAudio) {
          if (!musicBlob && sourceAudioTracks.length > 0 && sourceVolume === 1) {
            // Directly attach audio track without passing through AudioContext to prevent buffer underrun clicks
            stream.addTrack(sourceAudioTracks[0]);
          } else {
            exportAudioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
            const mixDestination = exportAudioContext.createMediaStreamDestination();
            const masterGain = exportAudioContext.createGain();
            masterGain.gain.setValueAtTime(0.95, exportAudioContext.currentTime);
            masterGain.connect(mixDestination);

            if (sourceAudioTracks.length > 0) {
              const sourceStream = new MediaStream([sourceAudioTracks[0]]);
              const sourceNode = exportAudioContext.createMediaStreamSource(sourceStream);
              const sourceGain = exportAudioContext.createGain();
              sourceGain.gain.value = Math.max(0, Math.min(1.5, sourceVolume));
              sourceNode.connect(sourceGain).connect(masterGain);
            }

            if (musicBlob) {
              exportMusicUrl = URL.createObjectURL(musicBlob);
              exportMusicElement = new Audio(exportMusicUrl);
              exportMusicElement.preload = 'auto';
              exportMusicElement.crossOrigin = 'anonymous';

              await new Promise<void>((resolveMusic, rejectMusic) => {
                const cleanup = () => {
                  exportMusicElement?.removeEventListener('loadedmetadata', onReady);
                  exportMusicElement?.removeEventListener('error', onError);
                };
                const onReady = () => {
                  cleanup();
                  resolveMusic();
                };
                const onError = () => {
                  cleanup();
                  rejectMusic(new Error('לא ניתן לפענח את קובץ המוזיקה.'));
                };
                exportMusicElement!.addEventListener('loadedmetadata', onReady);
                exportMusicElement!.addEventListener('error', onError);
                exportMusicElement!.load();
              });

              const musicDuration = Number.isFinite(exportMusicElement.duration) ? exportMusicElement.duration : 0;
              exportMusicElement.loop = musicFitMode === 'loop' || (musicFitMode === 'auto' && musicDuration > 0 && musicDuration < duration);
              exportMusicElement.currentTime = 0;

              const musicNode = exportAudioContext.createMediaElementSource(exportMusicElement);
              const musicGain = exportAudioContext.createGain();
              const safeMusicVolume = Math.max(0, Math.min(1, musicVolume));
              musicGain.gain.setValueAtTime(safeMusicVolume, exportAudioContext.currentTime);

              const fadeDuration = Math.min(0.8, duration / 3);
              if (duration > fadeDuration) {
                musicGain.gain.setValueAtTime(
                  safeMusicVolume,
                  exportAudioContext.currentTime + duration - fadeDuration
                );
                musicGain.gain.linearRampToValueAtTime(0, exportAudioContext.currentTime + duration);
              }
              musicNode.connect(musicGain).connect(masterGain);
            }

            const mixedTrack = mixDestination.stream.getAudioTracks()[0];
            if (mixedTrack) stream.addTrack(mixedTrack);
            await exportAudioContext.resume();
          }
        }
      } catch (audioErr) {
        console.error('Audio mix error:', audioErr);
        if (musicBlob) throw audioErr;
      }

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
        if (exportAudioContext && exportAudioContext.state !== 'closed') {
          exportAudioContext.close().catch(() => undefined);
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
        if (videoElement.currentTime >= targetEndTime - 0.05 || videoElement.ended) {
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

      const maxAllowedSeconds = Math.max(8, duration + 4);
      watchdogTimer = setTimeout(() => {
        finishExport();
      }, maxAllowedSeconds * 1000);

      recorder.onstop = () => {
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

      videoElement.currentTime = trimStart;
      videoElement.muted = false;
      videoElement.volume = 1;

      await new Promise<void>((res) => {
        const onSeeked = () => {
          videoElement.removeEventListener('seeked', onSeeked);
          res();
        };
        videoElement.addEventListener('seeked', onSeeked, { once: true });
      });

      const playbackPromises: Promise<void>[] = [videoElement.play()];
      if (exportMusicElement) {
        exportMusicElement.currentTime = 0;
        playbackPromises.push(exportMusicElement.play());
      }
      await Promise.all(playbackPromises);

      // Start recorder strictly AFTER video and audio elements are actively rolling
      recorder.start();

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
          karaokeEnabled
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
  const isWebCodecsSupported = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
  if (isWebCodecsSupported) {
    try {
      return await exportVideoWithWebCodecs(options);
    } catch (err) {
      console.warn('WebCodecs export failed, falling back to MediaRecorder:', err);
    }
  }
  return await exportVideoWithMediaRecorder(options);
};

export const exportCaptionsToSRT = (captions: CaptionItem[]): string => {
  const formatTime = (seconds: number): string => {
    const pad = (n: number, z = 2) => ('00' + n).slice(-z);
    const ms = Math.floor((seconds % 1) * 1000);
    const secs = Math.floor(seconds % 60);
    const mins = Math.floor((seconds / 60) % 60);
    const hrs = Math.floor(seconds / 3600);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  };

  return captions
    .map((cap, i) => `${i + 1}\n${formatTime(cap.start)} --> ${formatTime(cap.end)}\n${cap.text}\n`)
    .join('\n');
};
