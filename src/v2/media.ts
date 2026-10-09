import { Asset, Composition, Layer, MediaPool } from "./types";

const SEEK_TIMEOUT_MS = 4000;

function abortError(): DOMException {
  return new DOMException("The export was cancelled.", "AbortError");
}

function waitFor(
  element: HTMLMediaElement | HTMLImageElement,
  ok: string,
  bad: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(
        new Error(
          `Could not load media: ${element instanceof HTMLVideoElement ? element.currentSrc || element.src : element.src}`,
        ),
      );
    };
    const timer = window.setTimeout(fail, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(ok, done);
      element.removeEventListener("error", fail);
    };
    element.addEventListener(ok, done, { once: true });
    element.addEventListener("error", fail, { once: true });
  });
}

export async function createMediaPool(assets: Asset[]): Promise<MediaPool> {
  const pool: MediaPool = {
    assets: new Map(),
    images: new Map(),
    videos: new Map(),
  };
  const results = await Promise.allSettled(
    assets.map(async (asset) => {
      if (pool.assets.has(asset.id))
        throw new Error(`Duplicate asset id: ${asset.id}`);
      pool.assets.set(asset.id, asset);
      if (asset.kind === "image") {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = asset.src;
        if (!image.complete) await waitFor(image, "load", "error");
        if (!image.naturalWidth)
          throw new Error(`Image has no pixels: ${asset.name}`);
        pool.images.set(asset.id, image);
      } else {
        const video = document.createElement("video");
        video.preload = "auto";
        video.playsInline = true;
        video.muted = true; // Layer/B-roll audio is never mixed into the composition.
        video.crossOrigin = "anonymous";
        pool.videos.set(asset.id, video);
        const loaded = waitFor(video, "loadeddata", "error");
        video.src = asset.src;
        await loaded;
        if (!video.videoWidth || !Number.isFinite(video.duration))
          throw new Error(`Video metadata is invalid: ${asset.name}`);
        pool.videos.set(asset.id, video);
      }
    }),
  );
  const failure = results.find((r) => r.status === "rejected") as
    PromiseRejectedResult | undefined;
  if (failure) {
    disposeMediaPool(pool);
    throw failure.reason;
  }
  return pool;
}

export function disposeMediaPool(pool: MediaPool): void {
  pool.videos.forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
  pool.videos.clear();
  pool.images.clear();
  pool.assets.clear();
}

function layerSourceTime(
  layer: Layer,
  compositionTime: number,
  asset: Asset,
): number {
  const elapsed = Math.max(0, compositionTime - layer.start);
  const requested = layer.sourceIn + elapsed;
  const duration = asset.duration || Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(requested, Math.max(0, duration - 0.001)));
}

function activeAt(layer: Layer, time: number): boolean {
  return time >= layer.start && time < layer.end;
}

async function seekVideo(
  video: HTMLVideoElement,
  target: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortError();
  if (
    Math.abs(video.currentTime - target) <= 1 / 120 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  )
    return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        finish(new Error(`Timed out seeking video to ${target.toFixed(3)}s.`)),
      SEEK_TIMEOUT_MS,
    );
    const onAbort = () => finish(abortError());
    const onSeeked = () => {
      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(() => finish());
      } else {
        requestAnimationFrame(() => finish());
      }
    };
    const onError = () => finish(new Error("The video failed while seeking."));
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve();
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      video.currentTime = target;
    } catch (error) {
      finish(
        error instanceof Error ? error : new Error("Unable to seek video."),
      );
    }
  });
}

/** Loads exact media frames required for a still preview or an export frame. */
export async function seekComposition(
  composition: Composition,
  pool: MediaPool,
  time: number,
  signal?: AbortSignal,
): Promise<void> {
  const seekTargets = new Map<string, number>();
  if (composition.baseAssetId) {
    const base = pool.assets.get(composition.baseAssetId);
    if (!base) throw new Error("The selected base asset is missing.");
    if (base.kind === "video")
      seekTargets.set(
        base.id,
        Math.max(0, Math.min(time, (base.duration || time + 1) - 0.001)),
      );
  }
  for (const layer of composition.layers) {
    if (!activeAt(layer, time) || !layer.assetId) continue;
    const asset = pool.assets.get(layer.assetId);
    if (!asset)
      throw new Error(`Layer references a missing asset: ${layer.name}`);
    // A picture-in-picture view of the speaker shares the base clock.
    if (asset.kind === "video" && asset.id !== composition.baseAssetId)
      seekTargets.set(asset.id, layerSourceTime(layer, time, asset));
  }
  await Promise.all(
    [...seekTargets].map(([id, target]) =>
      seekVideo(pool.videos.get(id)!, target, signal),
    ),
  );
}

/** Preview helper. It keeps original speech on the base video only; every B-roll video stays muted. */
export async function syncPreviewPlayback(
  composition: Composition,
  pool: MediaPool,
  time: number,
  playing: boolean,
): Promise<void> {
  await seekComposition(composition, pool, time);
  pool.videos.forEach((video, id) => {
    const isBase = id === composition.baseAssetId;
    video.muted = !isBase;
    if (playing && isBase) void video.play().catch(() => undefined);
    else video.pause();
  });
}
