import * as mpSelfie from '@mediapipe/selfie_segmentation';

export interface SegmentationOptions {
  backgroundType: string;
  customImageUrl?: string | null;
  blurStrength?: number;
  zoomLevel?: number;
  isMirrored?: boolean;
  brightness?: number;
}

export class VideoBackgroundProcessor {
  private segmentation: any = null;
  private isLoaded = false;
  private isProcessing = false;
  private isBusy = false;
  private customImage: HTMLImageElement | null = null;
  private cachedBgUrl: string | null = null;
  private animFrameId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private options: SegmentationOptions = {
    backgroundType: 'none',
    customImageUrl: null,
    blurStrength: 14,
    zoomLevel: 1.0,
    isMirrored: true,
    brightness: 1.0,
  };

  constructor() {
    this.initModel();
  }

  private async initModel() {
    try {
      if (typeof window === 'undefined') return;

      // Check if global SelfieSegmentation is available from script or import
      const MPClass = (window as any).SelfieSegmentation || 
                      (mpSelfie as any).SelfieSegmentation || 
                      (mpSelfie as any).default?.SelfieSegmentation || 
                      mpSelfie;

      if (!MPClass) {
        console.warn('SelfieSegmentation constructor not found');
        return;
      }

      this.segmentation = new MPClass({
        locateFile: (file: string) => {
          // Serve from local public folder
          return `/mediapipe/selfie_segmentation/${file}`;
        }
      });

      this.segmentation.setOptions({
        modelSelection: 1, // 1: landscape/accurate, 0: general
        selfieMode: false,
      });

      this.segmentation.onResults(this.onResults.bind(this));
      await this.segmentation.initialize();
      this.isLoaded = true;
      console.log('✅ MediaPipe Selfie Segmentation initialized locally!');
    } catch (err) {
      console.warn('MediaPipe initialization warning (will fallback to CDN if needed):', err);
      // Fallback to CDN if local initialization had any issue
      try {
        const MPClass = (window as any).SelfieSegmentation || (mpSelfie as any).SelfieSegmentation || mpSelfie;
        this.segmentation = new MPClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });
        this.segmentation.setOptions({ modelSelection: 1, selfieMode: false });
        this.segmentation.onResults(this.onResults.bind(this));
        await this.segmentation.initialize();
        this.isLoaded = true;
      } catch (fallbackErr) {
        console.error('SelfieSegmentation fallback failed:', fallbackErr);
      }
    }
  }

  public setOptions(opts: Partial<SegmentationOptions>) {
    this.options = { ...this.options, ...opts };
    if (opts.customImageUrl && opts.customImageUrl !== this.cachedBgUrl) {
      this.cachedBgUrl = opts.customImageUrl;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = opts.customImageUrl;
      img.onload = () => {
        this.customImage = img;
      };
    }
  }

  public start(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.videoEl = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });
    this.isProcessing = true;
    this.processLoop();
  }

  public stop() {
    this.isProcessing = false;
    this.isBusy = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private async processLoop() {
    if (!this.isProcessing || !this.videoEl || !this.canvas) return;

    if (this.videoEl.readyState >= 2 && !this.videoEl.paused && !this.videoEl.ended) {
      // Sync canvas dimensions
      const vw = this.videoEl.videoWidth || 1280;
      const vh = this.videoEl.videoHeight || 720;
      if (this.canvas.width !== vw || this.canvas.height !== vh) {
        this.canvas.width = vw;
        this.canvas.height = vh;
      }

      if (this.options.backgroundType === 'none') {
        // Direct rendering with no segmentation overhead
        this.drawDirect(this.videoEl);
      } else if (this.isLoaded && this.segmentation && !this.isBusy) {
        this.isBusy = true;
        try {
          await this.segmentation.send({ image: this.videoEl });
        } catch (e) {
          console.warn('Segmentation send error:', e);
          this.drawDirect(this.videoEl);
        } finally {
          this.isBusy = false;
        }
      } else if (!this.isBusy) {
        this.drawDirect(this.videoEl);
      }
    }

    if (this.isProcessing) {
      this.animFrameId = requestAnimationFrame(this.processLoop.bind(this));
    }
  }

  private drawDirect(video: HTMLVideoElement) {
    if (!this.ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Brightness filter
    if (this.options.brightness && this.options.brightness !== 1.0) {
      ctx.filter = `brightness(${this.options.brightness})`;
    }

    // Mirroring & Zoom
    this.applyTransform(ctx, width, height);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
  }

  private onResults(results: any) {
    if (!this.ctx || !this.canvas || !this.isProcessing) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Apply mirroring & zoom to entire composition
    this.applyTransform(ctx, width, height);

    // 1. Draw the segmentation mask (person silhouette)
    ctx.drawImage(results.segmentationMask, 0, 0, width, height);

    // 2. Keep ONLY the person pixels from the live camera
    ctx.globalCompositeOperation = 'source-in';
    if (this.options.brightness && this.options.brightness !== 1.0) {
      ctx.filter = `brightness(${this.options.brightness})`;
    }
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.filter = 'none';

    // 3. Composite background BEHIND the person
    ctx.globalCompositeOperation = 'destination-over';

    const bgType = this.options.backgroundType;

    if (bgType === 'blur-light' || bgType === 'blur-heavy') {
      const blurAmount = bgType === 'blur-heavy' ? 26 : 12;
      ctx.filter = `blur(${blurAmount}px) brightness(0.92)`;
      ctx.drawImage(results.image, 0, 0, width, height);
      ctx.filter = 'none';
    } else if (bgType === 'custom' && this.customImage) {
      ctx.drawImage(this.customImage, 0, 0, width, height);
    } else {
      this.drawPresetBackground(ctx, bgType, width, height);
    }

    ctx.restore();
  }

  private applyTransform(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const zoom = this.options.zoomLevel || 1.0;
    const isMirrored = this.options.isMirrored ?? true;

    // Center transform
    ctx.translate(width / 2, height / 2);
    if (isMirrored) {
      ctx.scale(-1, 1);
    }
    if (zoom !== 1.0) {
      ctx.scale(zoom, zoom);
    }
    ctx.translate(-width / 2, -height / 2);
  }

  private drawPresetBackground(ctx: CanvasRenderingContext2D, presetId: string, width: number, height: number) {
    switch (presetId) {
      case 'podcast': {
        const grad = ctx.createRadialGradient(width * 0.8, height * 0.2, 50, width / 2, height / 2, width);
        grad.addColorStop(0, '#4f46e5');
        grad.addColorStop(0.45, '#1e1b4b');
        grad.addColorStop(1, '#09090b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'clinic': {
        const grad = ctx.createRadialGradient(width * 0.3, height * 0.3, 40, width / 2, height / 2, width);
        grad.addColorStop(0, '#d97706');
        grad.addColorStop(0.55, '#3b1c54');
        grad.addColorStop(1, '#0c0a14');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'indigo': {
        const grad = ctx.createRadialGradient(width * 0.5, height * 0.3, 80, width / 2, height / 2, width);
        grad.addColorStop(0, '#6366f1');
        grad.addColorStop(0.5, '#1e1e38');
        grad.addColorStop(1, '#050508');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'office': {
        const grad = ctx.createRadialGradient(width * 0.7, height * 0.3, 60, width / 2, height / 2, width);
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(0.5, '#0f2744');
        grad.addColorStop(1, '#070f1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'bookshelf': {
        const grad = ctx.createRadialGradient(width * 0.3, height * 0.4, 50, width / 2, height / 2, width);
        grad.addColorStop(0, '#b45309');
        grad.addColorStop(0.6, '#271c19');
        grad.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      default: {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        break;
      }
    }
  }
}
