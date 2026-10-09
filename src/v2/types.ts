export type AssetKind = "video" | "image";
export type LayerKind = "video" | "image" | "logo" | "slide" | "text";
export type FitMode = "cover" | "contain" | "stretch" | "blur";

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  src: string;
  duration?: number;
  width: number;
  height: number;
}

/** All geometry is normalized to the composition: 0..1. */
export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  assetId?: string;
  text?: string;
  start: number;
  end: number;
  sourceIn: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  fit: FitMode;
  focalX: number;
  focalY: number;
  opacity: number;
  fontSize: number;
  color: string;
  background: string;
  align: "center" | "right";
  fade: number;
}

export interface Caption {
  id: number;
  start: number;
  end: number;
  text: string;
  needsReview?: boolean;
}

export type CaptionPreset = "classic" | "karaoke" | "clean" | "highlight";

export interface CaptionStyle {
  preset: CaptionPreset;
  position: number;
  size: number;
  color: string;
  accent: string;
  background: string;
}

export interface Composition {
  width: number;
  height: number;
  duration: number;
  baseAssetId: string | null;
  /** Draw order, from back to front. A logo should normally be last. */
  layers: Layer[];
  captions: Caption[];
  /** Global timing correction in seconds. Positive values show captions later. */
  captionOffset?: number;
  /** Move subsequent captions by the same correction, retaining pauses. */
  captionRipple?: boolean;
  captionStyle?: CaptionStyle;
}

export interface MediaPool {
  assets: Map<string, Asset>;
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
}

export interface ExportOptions {
  signal?: AbortSignal;
  sourceVolume?: number;
  musicBlob?: Blob | null;
  musicVolume?: number;
  musicFitMode?: "auto" | "loop" | "trim";
  onProgress: (fraction: number, message: string) => void;
}
