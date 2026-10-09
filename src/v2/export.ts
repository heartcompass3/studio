import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import fixWebmDuration from "fix-webm-duration";
import { Asset, Composition, ExportOptions, MediaPool } from "./types";
import { createMediaPool, disposeMediaPool, seekComposition } from "./media";
import { renderComposition } from "./render";

const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("הייצוא בוטל", "AbortError");
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function decodeAndMixAudio(
  c: Composition,
  base: Asset,
  options: ExportOptions,
): Promise<AudioBuffer> {
  const sampleRate = 48000;
  const decodeContext = new AudioContext();
  try {
    const [sourceAudio, musicAudio] = await Promise.all([
      decodeContext.decodeAudioData(await (await fetch(base.src)).arrayBuffer()),
      options.musicBlob
        ? decodeContext.decodeAudioData(await options.musicBlob.arrayBuffer())
        : Promise.resolve(null),
    ]);
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(c.duration * sampleRate),
      sampleRate,
    );
    const limiter = offline.createDynamicsCompressor();
    const masterGain = offline.createGain();
    limiter.threshold.setValueAtTime(-4, 0);
    limiter.knee.setValueAtTime(3, 0);
    limiter.ratio.setValueAtTime(20, 0);
    limiter.attack.setValueAtTime(0.002, 0);
    limiter.release.setValueAtTime(0.12, 0);
    masterGain.gain.setValueAtTime(0.88, 0);
    limiter.connect(masterGain).connect(offline.destination);
    const source = offline.createBufferSource();
    const sourceGain = offline.createGain();
    source.buffer = sourceAudio;
    sourceGain.gain.value = Math.max(0, Math.min(1, options.sourceVolume ?? 1));
    source.connect(sourceGain).connect(limiter);
    source.start(0);

    if (musicAudio) {
      const music = offline.createBufferSource();
      const musicGain = offline.createGain();
      music.buffer = musicAudio;
      music.loop = options.musicFitMode === "loop"
        || (options.musicFitMode === "auto" && musicAudio.duration < c.duration);
      const level = Math.max(0, Math.min(1, options.musicVolume ?? 0.2));
      musicGain.gain.setValueAtTime(level, 0);
      const fade = Math.min(0.8, c.duration / 3);
      if (c.duration > fade) {
        musicGain.gain.setValueAtTime(level, c.duration - fade);
        musicGain.gain.linearRampToValueAtTime(0, c.duration);
      }
      music.connect(musicGain).connect(limiter);
      music.start(0);
    }
    return await offline.startRendering();
  } finally {
    await decodeContext.close();
  }
}

export async function exportComposition(
  c: Composition,
  assets: Asset[],
  options: ExportOptions,
): Promise<Blob> {
  if (!Number.isFinite(c.duration) || c.duration <= 0 || c.duration > 1800)
    throw new Error("משך הסרטון חייב להיות בין 0 ל־1800 שניות");
  if (!c.baseAssetId) throw new Error("יש לטעון סרטון ראשי לפני הייצוא");
  aborted(options.signal);
  await document.fonts.ready;
  const pool = await createMediaPool(assets);
  try {
    aborted(options.signal);
    const base = pool.assets.get(c.baseAssetId)!;
    if (!base) throw new Error("קובץ המקור חסר");
    options.onProgress(0, "מכין ייצוא יציב בזמן אמת");
    let realtimeError: unknown = null;
    const realtimeSupported =
      typeof MediaRecorder !== "undefined" &&
      [
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
      ].some((mime) => MediaRecorder.isTypeSupported(mime));
    if (realtimeSupported) {
      try {
        return await realtimeExport(c, pool, options);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        realtimeError = error;
        options.onProgress(0, "הייצוא הרגיל נכשל — עובר למקודד החלופי");
      }
    }

    options.onProgress(0, "בודק מקודד חלופי");
    const w = window as any;
    const videoConfig = {
      codec: "avc1.640028",
      width: c.width,
      height: c.height,
      bitrate: 12_000_000,
      framerate: 30,
    };
    let audio: AudioBuffer | null = null;
    let offline = !!w.VideoEncoder && !!w.AudioEncoder;
    if (offline) {
      try {
        offline = (await w.VideoEncoder.isConfigSupported(videoConfig))
          .supported;
        audio = await decodeAndMixAudio(c, base, options);
        if (audio)
          offline =
            offline &&
            (
              await w.AudioEncoder.isConfigSupported({
                codec: "mp4a.40.2",
                sampleRate: audio.sampleRate,
                numberOfChannels: audio.numberOfChannels,
                bitrate: 192000,
              })
            ).supported;
      } catch {
        offline = false;
      }
    }
    aborted(options.signal);
    if (offline && audio)
      return await offlineExport(c, pool, audio, videoConfig, options);
    if (realtimeError) throw realtimeError;
    throw new Error("הדפדפן אינו תומך במקודדי הווידאו הנדרשים");
  } finally {
    disposeMediaPool(pool);
  }
}

async function offlineExport(
  c: Composition,
  pool: MediaPool,
  audio: AudioBuffer,
  videoConfig: any,
  o: ExportOptions,
): Promise<Blob> {
  const w = window as any;
  const canvas = document.createElement("canvas");
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: c.width, height: c.height },
    audio: {
      codec: "aac",
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let failure: Error | null = null;
  const ve = new w.VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: Error) => {
      failure = e;
    },
  });
  const ae = new w.AudioEncoder({
    output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
    error: (e: Error) => {
      failure = e;
    },
  });
  try {
    ve.configure(videoConfig);
    ae.configure({
      codec: "mp4a.40.2",
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      bitrate: 192000,
    });
    const total = Math.ceil(c.duration * 30);
    for (let i = 0; i < total; i++) {
      aborted(o.signal);
      if (failure) throw failure;
      await seekComposition(c, pool, i / 30, o.signal);
      renderComposition(ctx, c, pool, i / 30);
      const frame = new w.VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / 30),
        duration: Math.round(Math.min(1 / 30, c.duration - i / 30) * 1e6),
      });
      try {
        ve.encode(frame, { keyFrame: i % 60 === 0 });
      } finally {
        frame.close();
      }
      if (ve.encodeQueueSize > 8) await ve.flush();
      if (i % 8 === 0) {
        o.onProgress((i / total) * 0.87, "מרנדר וידאו ושכבות");
        await tick();
      }
    }
    await ve.flush();
    aborted(o.signal);
    if (failure) throw failure;
    const samples = Math.min(
      audio.length,
      Math.round(c.duration * audio.sampleRate),
    );
    for (let i = 0; i < samples; i += 1024) {
      aborted(o.signal);
      if (failure) throw failure;
      const count = Math.min(1024, samples - i);
      const data = new Float32Array(count * audio.numberOfChannels);
      for (let ch = 0; ch < audio.numberOfChannels; ch++)
        data.set(audio.getChannelData(ch).subarray(i, i + count), ch * count);
      const frame = new w.AudioData({
        format: "f32-planar",
        sampleRate: audio.sampleRate,
        numberOfFrames: count,
        numberOfChannels: audio.numberOfChannels,
        timestamp: Math.round((i / audio.sampleRate) * 1e6),
        data,
      });
      try {
        ae.encode(frame);
      } finally {
        frame.close();
      }
      if (ae.encodeQueueSize > 32) {
        await ae.flush();
        await tick();
      }
      if (i % 32768 === 0)
        o.onProgress(0.88 + (i / samples) * 0.1, "מקודד את הקול המקורי");
    }
    await ae.flush();
    aborted(o.signal);
    if (failure) throw failure;
    muxer.finalize();
    o.onProgress(1, "הסרטון מוכן");
    return new Blob([(muxer.target as ArrayBufferTarget).buffer], {
      type: "video/mp4",
    });
  } finally {
    if (ve.state !== "closed") ve.close();
    if (ae.state !== "closed") ae.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function realtimeExport(
  c: Composition,
  pool: MediaPool,
  o: ExportOptions,
): Promise<Blob> {
  const base = pool.videos.get(c.baseAssetId!);
  if (!base) throw new Error("לייצוא בזמן אמת נדרש מקור וידאו");
  const canvas = document.createElement("canvas");
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  // Keep one stable audio clock for the whole export. Fragmenting an MP4
  // recording into timed chunks can introduce tiny AAC discontinuities that
  // are heard as periodic clicks even though preview playback is clean.
  const ac = new AudioContext({ sampleRate: 48000, latencyHint: "playback" });
  const destination = ac.createMediaStreamDestination();
  const limiter = ac.createDynamicsCompressor();
  const masterGain = ac.createGain();
  limiter.threshold.setValueAtTime(-4, ac.currentTime);
  limiter.knee.setValueAtTime(3, ac.currentTime);
  limiter.ratio.setValueAtTime(20, ac.currentTime);
  limiter.attack.setValueAtTime(0.002, ac.currentTime);
  limiter.release.setValueAtTime(0.12, ac.currentTime);
  masterGain.gain.setValueAtTime(0.88, ac.currentTime);
  limiter.connect(masterGain).connect(destination);
  const source = ac.createMediaElementSource(base);
  const sourceGain = ac.createGain();
  sourceGain.gain.value = Math.max(0, Math.min(1, o.sourceVolume ?? 1));
  source.connect(sourceGain).connect(limiter);
  base.muted = false;
  base.volume = 1;
  let music: HTMLAudioElement | null = null;
  let musicSource: MediaElementAudioSourceNode | null = null;
  let musicUrl: string | null = null;
  if (o.musicBlob) {
    musicUrl = URL.createObjectURL(o.musicBlob);
    music = new Audio(musicUrl);
    music.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      music!.addEventListener("loadedmetadata", () => resolve(), { once: true });
      music!.addEventListener(
        "error",
        () => reject(new Error("לא ניתן לקרוא את קובץ המוזיקה")),
        { once: true },
      );
      music!.load();
    });
    music.loop = o.musicFitMode === "loop"
      || (o.musicFitMode === "auto" && music.duration < c.duration);
    musicSource = ac.createMediaElementSource(music);
    const musicGain = ac.createGain();
    const level = Math.max(0, Math.min(1, o.musicVolume ?? 0.2));
    musicGain.gain.setValueAtTime(level, ac.currentTime);
    const fade = Math.min(0.8, c.duration / 3);
    if (c.duration > fade) {
      musicGain.gain.setValueAtTime(level, ac.currentTime + c.duration - fade);
      musicGain.gain.linearRampToValueAtTime(0, ac.currentTime + c.duration);
    }
    musicSource.connect(musicGain).connect(limiter);
  }
  const stream = canvas.captureStream(30);
  destination.stream
    .getAudioTracks()
    .forEach((track) => stream.addTrack(track));
  const mime = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
  ].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) {
    stream.getTracks().forEach((t) => t.stop());
    await ac.close();
    throw new Error("הדפדפן אינו תומך בייצוא וידאו");
  }
  let raf = 0;
  let watchdog = 0;
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 192_000,
  });
  try {
    await seekComposition(c, pool, 0, o.signal);
    renderComposition(ctx, c, pool, 0);
    await ac.resume();
    const result = await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let failed = false;
      const cleanup = () => {
        cancelAnimationFrame(raf);
        clearTimeout(watchdog);
        o.signal?.removeEventListener("abort", cancel);
        document.removeEventListener("visibilitychange", visibility);
        base.removeEventListener("error", mediaError);
      };
      const fail = (error: Error) => {
        if (failed) return;
        failed = true;
        cleanup();
        if (recorder.state !== "inactive") recorder.stop();
        reject(error);
      };
      const cancel = () => fail(new DOMException("הייצוא בוטל", "AbortError"));
      const visibility = () => {
        if (document.hidden)
          fail(
            new Error(
              "הייצוא בזמן אמת נעצר כי הלשונית הוסתרה. חזור ללשונית ונסה שוב.",
            ),
          );
      };
      const mediaError = () => fail(new Error("פענוח סרטון המקור נכשל"));
      o.signal?.addEventListener("abort", cancel, { once: true });
      document.addEventListener("visibilitychange", visibility);
      base.addEventListener("error", mediaError);
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => fail(new Error("קידוד הסרטון נכשל"));
      recorder.onstop = () => {
        cleanup();
        if (failed) return;
        if (!chunks.length) {
          reject(new Error("קובץ הייצוא ריק"));
          return;
        }
        const blob = new Blob(chunks, {
          type: mime.includes("mp4") ? "video/mp4" : "video/webm",
        });
        if (mime.includes("webm"))
          fixWebmDuration(blob, c.duration * 1000, resolve);
        else resolve(blob);
      };
      const loop = () => {
        if (failed) return;
        const time = base.currentTime;
        for (const layer of c.layers) {
          const video = layer.assetId ? pool.videos.get(layer.assetId) : null;
          if (!video || video === base) continue;
          if (time >= layer.start && time < layer.end) {
            const target = Math.min(
              video.duration - 0.002,
              layer.sourceIn + time - layer.start,
            );
            if (Math.abs(video.currentTime - target) > 0.13)
              video.currentTime = Math.max(0, target);
            if (video.paused && !video.ended)
              void video
                .play()
                .catch(() => fail(new Error("לא ניתן לנגן את קטע ה־B-Roll")));
          } else video.pause();
        }
        renderComposition(ctx, c, pool, Math.min(time, c.duration - 0.001));
        o.onProgress(
          Math.min(0.99, time / c.duration),
          "ייצוא בזמן אמת — השאר את הלשונית פתוחה",
        );
        if (time >= c.duration - 0.025 || base.ended) {
          base.pause();
          recorder.stop();
          return;
        }
        raf = requestAnimationFrame(loop);
      };
      watchdog = window.setTimeout(
        () => fail(new Error("הייצוא נעצר לפני שהסתיים; נסה קובץ קצר יותר")),
        Math.max(15000, (c.duration + 15) * 1000),
      );
      // A single continuous chunk avoids audible seams between fragmented
      // MP4/AAC segments. `stop()` flushes the final data automatically.
      Promise.all([base.play(), ...(music ? [music.play()] : [])])
        .then(() => {
          recorder.start();
          loop();
        })
        .catch(fail);
    });
    o.onProgress(1, "הסרטון מוכן");
    return result;
  } finally {
    cancelAnimationFrame(raf);
    clearTimeout(watchdog);
    pool.videos.forEach((v) => v.pause());
    music?.pause();
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    source.disconnect();
    musicSource?.disconnect();
    limiter.disconnect();
    masterGain.disconnect();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    await ac.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
