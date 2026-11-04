/** Keep the decoder and canvas in the rendered document during mobile export. */
export function mountExportSurface(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
) {
  const surface = document.createElement("div");
  surface.setAttribute("aria-hidden", "true");
  surface.dataset.exportSurface = "true";
  Object.assign(surface.style, {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    pointerEvents: "none",
    overflow: "hidden",
  });
  for (const element of [...(video ? [video] : []), canvas]) {
    Object.assign(element.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
    });
    surface.appendChild(element);
  }
  host.appendChild(surface);
  return () => surface.remove();
}

export function waitForVideoData(
  video: HTMLVideoElement,
  timeout = 15000,
): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
      error ? reject(error) : resolve();
    };
    const loaded = () =>
      video.videoWidth && video.videoHeight ? finish() : failed();
    const failed = () =>
      finish(new Error("לא ניתן לפענח תמונה מהסרטון. נסה קובץ MP4 אחר."));
    const timer = setTimeout(
      () => finish(new Error("טעינת תמונת הסרטון ארכה זמן רב מדי.")),
      timeout,
    );
    video.addEventListener("loadeddata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

export function seekExportVideo(
  video: HTMLVideoElement,
  time: number,
): Promise<void> {
  if (
    !video.seeking &&
    Math.abs(video.currentTime - time) < 0.001 &&
    video.readyState >= 2
  )
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
      error ? reject(error) : resolve();
    };
    const done = () => (video.readyState >= 2 ? finish() : failed());
    const failed = () => finish(new Error("פענוח הפריים לייצוא נכשל."));
    const timer = setTimeout(
      () => finish(new Error("הניווט לפריים ארך זמן רב מדי.")),
      10000,
    );
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    try {
      video.currentTime = time;
    } catch {
      failed();
    }
  });
}

/** Paint on decoded video frames; rAF remains available on older engines. */
export function pumpExportFrames(
  video: HTMLVideoElement,
  draw: (time: number) => void,
) {
  let stopped = false,
    frameId = 0,
    animationId = 0;
  const hasFrameCallback =
    typeof video.requestVideoFrameCallback === "function";
  const frame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
    if (stopped) return;
    draw(metadata.mediaTime);
    if (!stopped) frameId = video.requestVideoFrameCallback(frame);
  };
  const tick = () => {
    if (stopped) return;
    if (video.readyState >= 2 && !video.seeking) draw(video.currentTime);
    if (!stopped) animationId = requestAnimationFrame(tick);
  };
  if (hasFrameCallback) frameId = video.requestVideoFrameCallback(frame);
  else animationId = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    if (hasFrameCallback) video.cancelVideoFrameCallback?.(frameId);
    else cancelAnimationFrame(animationId);
  };
}

export function frameLuma(source: CanvasImageSource): number | null {
  const sample = document.createElement("canvas");
  sample.width = 12;
  sample.height = 12;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, 12, 12);
    const pixels = ctx.getImageData(0, 0, 12, 12).data;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4)
      total +=
        0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    return total / (pixels.length / 4);
  } finally {
    sample.width = 0;
    sample.height = 0;
  }
}

/** Decode the completed container before it can be downloaded, including a picture check. */
export async function verifyExportedVideo(
  blob: Blob,
  host: HTMLElement,
  proof?: { time: number; luma: number },
) {
  const video = document.createElement("video"),
    canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 12;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const remove = mountExportSurface(video, canvas, host);
  const url = URL.createObjectURL(blob);
  try {
    const loaded = waitForVideoData(video);
    video.src = url;
    video.load();
    await loaded;
    if (proof) {
      await seekExportVideo(
        video,
        Math.max(
          0,
          Math.min(
            proof.time,
            (Number.isFinite(video.duration)
              ? video.duration
              : proof.time + 0.1) - 0.01,
          ),
        ),
      );
      const actual = frameLuma(video);
      // Do not reject deliberately dark source footage: compare with the composed source frame.
      if (actual !== null && actual < 1 && proof.luma > 8)
        throw new Error(
          "בדיקת הייצוא זיהתה תמונה שחורה במקום הווידאו. נסה לייצא שוב והשאר את הדף פתוח.",
        );
    }
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    remove();
    URL.revokeObjectURL(url);
  }
}
