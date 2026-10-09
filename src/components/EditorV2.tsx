import { splitLongCaptions } from '../services/captionLayout';
import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Play,
  Pause,
  Image as ImageIcon,
  Film,
  Type,
  Bookmark,
  Download,
  Undo2,
  Redo2,
  Trash2,
  Layers,
  Camera,
  Save,
  FolderOpen,
  Shield,
  ArrowUp,
  ArrowDown,
  Copy,
  Loader,
  Plus,
  Monitor,
  Music,
  Volume2,
  Repeat2,
} from "lucide-react";
import { Asset, Composition, Layer, MediaPool } from "../v2/types";
import {
  createMediaPool,
  disposeMediaPool,
  seekComposition,
} from "../v2/media";
import { renderComposition } from "../v2/render";
import { exportComposition } from "../v2/export";
import {
  defaultComposition,
  newLayer,
  readAsset,
  downloadBlob,
  saveProject,
  loadProject,
  uid,
} from "../v2/project";
import { updateCaptionTiming } from "../services/captionTiming";
import { generateCaptionsFromVideoBlob, proofreadHebrewCaptions, sanitizeAndSequenceCaptions } from "../services/geminiService";
import { CaptionTimeInput } from "./Editor/CaptionTimeInput";
import { PresentationRecorder } from "./PresentationRecorder";
import "./studio-v2.css";

interface Props {
  videoBlob: Blob | null;
  coverTitle: string;
  scriptText: string;
  onError: (s: string) => void;
  active: boolean;
}
const labels: Record<Layer["kind"], string> = {
  video: "B-Roll",
  image: "קאבר / תמונה",
  slide: "שקופית",
  logo: "לוגו",
  text: "כותרת",
};
const stamp = (seconds: number) => {
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  return `${Math.floor(milliseconds / 60000).toString().padStart(2, '0')}:${((milliseconds % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
};
const bounded = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function EditorV2({
  videoBlob,
  coverTitle,
  scriptText,
  onError,
  active,
}: Props) {
  const [doc, setDoc] = useState<Composition>(defaultComposition);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [name, setName] = useState("הריל החדש שלי");
  const [safe, setSafe] = useState(false);
  const [record, setRecord] = useState(false);
  const [sourceVolume, setSourceVolume] = useState(1);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.2);
  const [musicFitMode, setMusicFitMode] = useState<"auto" | "loop" | "trim">("auto");
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<{
    past: Composition[];
    future: Composition[];
  }>({ past: [], future: [] });
  const canvas = useRef<HTMLCanvasElement>(null);
  const pool = useRef<MediaPool | null>(null);
  const abort = useRef<AbortController | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);
  const state = useRef({
    doc,
    time,
    playing,
    active,
    assets,
    sourceVolume,
    musicDuration,
    musicFitMode,
  });
  state.current = {
    doc,
    time,
    playing,
    active,
    assets,
    sourceVolume,
    musicDuration,
    musicFitMode,
  };
  const sourceBlob = useRef<Blob | null>(null);
  const urls = useRef(new Set<string>());
  const lastImported = useRef<Blob | null>(null);
  const chosen = doc.layers.find((l) => l.id === selected);
  const selectedAsset = assets.find((a) => a.id === chosen?.assetId);
  const captionStyle = doc.captionStyle || {
    preset: "classic" as const,
    position: 0.77,
    size: 1,
    color: "#ffffff",
    accent: "#facc15",
    background: "rgba(2,6,23,.76)",
  };
  const transform = useRef<{
    mode: "move" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    rect: DOMRect;
    layer: Layer;
    composition: Composition;
    moved: boolean;
  } | null>(null);

  const beginTransform = (
    mode: "move" | "resize",
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (!chosen || playing) return;
    const frame = canvas.current?.parentElement;
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    transform.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: frame.getBoundingClientRect(),
      layer: { ...chosen },
      composition: doc,
      moved: false,
    };
  };

  const moveTransform = (event: React.PointerEvent<HTMLElement>) => {
    const drag = transform.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - drag.startX) / Math.max(1, drag.rect.width);
    const dy = (event.clientY - drag.startY) / Math.max(1, drag.rect.height);
    drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 0.002;
    let changes: Partial<Layer>;
    if (
      drag.mode === "move" &&
      (drag.layer.fit === "cover" || drag.layer.fit === "blur")
    ) {
      changes = {
        focalX: bounded(drag.layer.focalX - dx, 0, 1),
        focalY: bounded(drag.layer.focalY - dy, 0, 1),
      };
    } else if (drag.mode === "move") {
      changes = {
        x: bounded(drag.layer.x + dx, 0, Math.max(0, 1 - drag.layer.width)),
        y: bounded(drag.layer.y + dy, 0, Math.max(0, 1 - drag.layer.height)),
      };
    } else {
      changes = {
        width: bounded(drag.layer.width + dx, 0.05, 1 - drag.layer.x),
        height: bounded(drag.layer.height + dy, 0.05, 1 - drag.layer.y),
      };
    }
    setDoc({
      ...drag.composition,
      layers: drag.composition.layers.map((layer) =>
        layer.id === drag.layer.id ? { ...layer, ...changes } : layer,
      ),
    });
  };

  const endTransform = (event: React.PointerEvent<HTMLElement>) => {
    const drag = transform.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved)
      setHistory((history) => ({
        past: [...history.past, drag.composition].slice(-40),
        future: [],
      }));
    transform.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      pool.current?.videos.forEach((v) => v.pause());
      musicRef.current?.pause();
      urls.current.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    return () => {
      if (musicUrl) URL.revokeObjectURL(musicUrl);
    };
  }, [musicUrl]);
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      pool.current?.videos.forEach((video) => video.pause());
      musicRef.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const previous = pool.current;
    pool.current = null;
    if (previous) disposeMediaPool(previous);
    createMediaPool(assets)
      .then((p) => {
        if (cancelled) disposeMediaPool(p);
        else {
          pool.current = p;
          setReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) onError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [assets]);
  useEffect(() => {
    let stopped = false,
      raf = 0,
      seeking = false,
      lastSignature = "";
    const frame = () => {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      const s = state.current,
        p = pool.current,
        el = canvas.current;
      if (!p || !el || !s.active || seeking) return;
      if (
        (s.doc.baseAssetId && !p.assets.has(s.doc.baseAssetId)) ||
        s.doc.layers.some((l) => l.assetId && !p.assets.has(l.assetId))
      )
        return;
      const ctx = el.getContext("2d")!;
      const base = s.doc.baseAssetId ? p.videos.get(s.doc.baseAssetId) : null;
      if (s.playing && base) {
        if (base.paused && !base.ended)
          void base.play().catch((e) => {
            setPlaying(false);
            onError(e.message);
          });
        base.muted = false;
        base.volume = s.sourceVolume;
        const current = base.currentTime;
        if (current >= s.doc.duration - 0.015 || base.ended) {
          setPlaying(false);
          setTime(0);
          musicRef.current?.pause();
          return;
        }
        const music = musicRef.current;
        if (music && s.musicDuration > 0) {
          const loops = s.musicFitMode === "loop"
            || (s.musicFitMode === "auto" && s.musicDuration < s.doc.duration);
          const target = loops ? current % s.musicDuration : Math.min(current, s.musicDuration - 0.02);
          music.loop = loops;
          if (Math.abs(music.currentTime - target) > 0.28) music.currentTime = target;
          if (!loops && current >= s.musicDuration) music.pause();
          else if (music.paused) void music.play().catch(() => {});
        }
        p.videos.forEach((v, id) => {
          if (v === base) return;
          const layer = s.doc.layers.find(
            (l) => l.assetId === id && current >= l.start && current < l.end,
          );
          if (layer) {
            const target = Math.max(
              0,
              Math.min(
                v.duration - 0.002,
                layer.sourceIn + current - layer.start,
              ),
            );
            if (Math.abs(v.currentTime - target) > 0.14) v.currentTime = target;
            if (v.paused && !v.ended) void v.play().catch(() => {});
          } else v.pause();
        });
        setTime(current);
        renderComposition(ctx, s.doc, p, current);
        lastSignature = "";
      } else {
        p.videos.forEach((v) => v.pause());
        musicRef.current?.pause();
        const signature = JSON.stringify(s.doc) + "@" + s.time;
        if (signature === lastSignature) return;
        lastSignature = signature;
        seeking = true;
        seekComposition(s.doc, p, Math.min(s.time, s.doc.duration - 0.001))
          .then(() => {
            if (!stopped && pool.current === p)
              renderComposition(ctx, s.doc, p, s.time);
          })
          .catch((e) => {
            if (!stopped && pool.current === p) onError(e.message);
          })
          .finally(() => {
            seeking = false;
          });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      pool.current?.videos.forEach((v) => v.pause());
      musicRef.current?.pause();
    };
  }, [ready]);
  const commit = (next: Composition) => {
    const previous = state.current.doc;
    if (next === previous) return;
    state.current.doc = next;
    setHistory(h => ({ past: [...h.past, previous].slice(-40), future: [] }));
    setDoc(next);
  };
  const editCaptionTime = (id: number, field: 'start' | 'end', visibleTime: number) => {
    const current = state.current.doc;
    const offset = current.captionOffset || 0;
    const captions = updateCaptionTiming(current.captions, id, field, visibleTime - offset, {
      ripple: current.captionRipple !== false, duration: current.duration, offset,
    });
    if (captions !== current.captions) commit({ ...current, captions });
    const actual = captions.find(item => item.id === id)?.[field];
    if (actual !== undefined && Math.abs(actual + offset - visibleTime) > 0.002)
      setStatus('הזמן הוגבל כדי לשמור על גבולות הסרטון ועל רצף הכתוביות. אפשר לכבות סנכרון שרשרת לעריכה מקומית.');
  };
  const pinCaption = (id: number, field: 'start' | 'end') => {
    const current = state.current;
    const base = current.doc.baseAssetId ? pool.current?.videos.get(current.doc.baseAssetId) : null;
    const at = current.playing && base ? base.currentTime : current.time;
    base?.pause();
    setPlaying(false);
    setTime(at);
    editCaptionTime(id, field, at);
  };
  const update = (changes: Partial<Layer>) => {
    if (!chosen) return;
    commit({
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === chosen.id ? { ...l, ...changes } : l,
      ),
    });
  };
  const add = (layers: Layer[]) => {
    const logo = doc.layers.filter((l) => l.kind === "logo");
    commit({
      ...doc,
      layers: [
        ...doc.layers.filter((l) => l.kind !== "logo"),
        ...layers,
        ...logo,
      ],
    });
    setSelected(layers[layers.length - 1].id);
    setTime(layers[0].start);
  };
  const titleLayer = (title: string, end = 3) => ({
    ...newLayer("text", end),
    name: "כותרת פתיחה",
    text: title,
    x: 0.07,
    y: 0.22,
    width: 0.86,
    height: 0.33,
    background: "rgba(2,6,23,.78)",
    fontSize: 0.06,
  });
  const handleError = (e: unknown) =>
    onError(e instanceof Error ? e.message : "הפעולה לא הושלמה");
  const addAssets = (newAssets: Asset[]) => {
    newAssets.forEach((a) => urls.current.add(a.src));
    setAssets((a) => [...a, ...newAssets]);
  };
  const importBase = async (file: Blob, filename: string) => {
    setBusy("טוען סרטון");
    setPlaying(false);
    try {
      const a = await readAsset(file, filename);
      addAssets([a]);
      sourceBlob.current = file;
      commit({
        ...doc,
        baseAssetId: a.id,
        duration: a.duration!,
        layers: doc.layers.map((l) => ({
          ...l,
          start: Math.min(l.start, Math.max(0, a.duration! - 0.1)),
          end: Math.min(l.end, a.duration!),
        })),
      });
      setTime(0);
      setStatus("סרטון המקור נטען. הקול שלו נשמר מתחת לשכבות.");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    if (videoBlob && lastImported.current !== videoBlob) {
      lastImported.current = videoBlob;
      void importBase(videoBlob, "הקלטה מהאולפן");
    }
  }, [videoBlob]);
  const upload = async (
    files: FileList | null,
    kind: "base" | "cover" | "logo" | "video" | "slide",
  ) => {
    if (!files?.length) return;
    if (kind === "base") {
      await importBase(files[0], files[0].name);
      return;
    }
    setBusy("טוען שכבות");
    setPlaying(false);
    try {
      const next: Asset[] = [];
      for (const file of Array.from(files)) {
        next.push(await readAsset(file, file.name));
      }
      addAssets(next);
      const layers = next.map((a, i): Layer => {
        const start =
          kind === "cover" || kind === "logo"
            ? 0
            : Math.min(time + i * 4, Math.max(0, doc.duration - 0.1));
        const end =
          kind === "logo"
            ? doc.duration
            : Math.min(
                doc.duration,
                start + (kind === "cover" ? 2.5 : Math.min(4, a.duration || 4)),
              );
        const l = {
          ...newLayer(kind === "cover" ? "image" : kind, doc.duration),
          assetId: a.id,
          name: a.name,
          start,
          end,
        };
        if (kind === "logo")
          Object.assign(l, {
            x: 0.05,
            y: 0.05,
            width: 0.12,
            height: (((0.12 * doc.width) / doc.height) * a.height) / a.width,
            fit: "contain",
          });
        if (kind === "slide")
          Object.assign(l, {
            x: 0,
            y: 0.2,
            width: 1,
            height: 0.56,
            fit: "contain",
            background: "#07121a",
          });
        return l;
      });
      if (kind === "cover")
        layers.push(
          titleLayer(coverTitle || "מה קורה מעבר למילים?", layers[0].end),
        );
      add(layers);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
    }
  };
  const move = (direction: number) => {
    if (!chosen) return;
    const i = doc.layers.indexOf(chosen),
      j = i + direction;
    if (j < 0 || j >= doc.layers.length) return;
    const layers = [...doc.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    commit({ ...doc, layers });
  };
  const save = async () => {
    setBusy("שומר");
    try {
      await saveProject(name, doc, assets);
      setStatus("הפרויקט והמדיה נשמרו בדפדפן הזה. אפשר לסגור ולחזור.");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
    }
  };
  const restore = async () => {
    setBusy("פותח");
    setPlaying(false);
    try {
      const p = await loadProject();
      p.assets.forEach((a) => urls.current.add(a.src));
      setName(p.name);
      setAssets(p.assets);
      commit(p.composition);
      sourceBlob.current = null;
      setSelected(null);
      setTime(0);
      setStatus("הפרויקט השמור פתוח");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
    }
  };
  const exportVideo = async () => {
    setPlaying(false);
    pool.current?.videos.forEach((v) => v.pause());
    setBusy("ייצוא");
    setProgress(0);
    abort.current = new AbortController();
    try {
      const blob = await exportComposition(doc, assets, {
        signal: abort.current.signal,
        sourceVolume,
        musicBlob: musicFile,
        musicVolume,
        musicFitMode,
        onProgress: (p, s) => {
          if (alive.current) {
            setProgress(p);
            setStatus(s);
          }
        },
      });
      downloadBlob(
        blob,
        `${name}.${blob.type.includes("mp4") ? "mp4" : "webm"}`,
      );
      setStatus(
        `הייצוא הושלם • ${blob.type.includes("mp4") ? "MP4" : "WebM"} • ${(blob.size / 1048576).toFixed(1)} MB`,
      );
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
      abort.current = null;
    }
  };
  const coverDownload = async () => {
    if (!canvas.current) return;
    setPlaying(false);
    const p = pool.current;
    if (!p) return;
    await seekComposition(doc, p, time);
    renderComposition(canvas.current.getContext("2d")!, doc, p, time);
    canvas.current.toBlob((b) => {
      if (b) downloadBlob(b, `${name}-cover.png`);
    }, "image/png");
  };
  const transcribe = async () => {
    if (!doc.baseAssetId) return;
    setBusy("מתמלל");
    try {
      const asset = assets.find((a) => a.id === doc.baseAssetId)!;
      const blob =
        sourceBlob.current || (await (await fetch(asset.src)).blob());
      const captions = await generateCaptionsFromVideoBlob(
        blob,
        scriptText,
        doc.duration,
      );
      commit({ ...doc, captions });
      setStatus(captions.some(c => c.needsReview)
        ? "התמלול הושלם, אך הגהת הכתיב לא הושלמה. אפשר ללחוץ על הגהת כתיב או לתקן ידנית."
        : "התמלול והגהת הכתיב הושלמו. כתוביות ארוכות חולקו למקטעים קצרים.");
      setCaptionsOpen(true);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
    }
  };
  const proofreadCaptions = async () => {
    setBusy("מגיה כתיב");
    try {
      const captions = await proofreadHebrewCaptions(doc.captions, scriptText);
      const sanitized = sanitizeAndSequenceCaptions(captions, doc.duration);
      commit({ ...doc, captions: sanitized });
      setStatus("הגהת הכתיב הושלמה. זמני הכתוביות נשמרו.");
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  };
  const importRecording = async (
    blob: Blob,
    slides: { file: File; start: number; end: number }[],
    duration: number,
    withCamera = true,
  ) => {
    setRecord(false);
    setBusy("טוען הקלטת מצגת");
    try {
      const base = await readAsset(blob, "הקלטת מצגת");
      const newAssets = [base],
        layers: Layer[] = [];
      for (const cue of slides) {
        const a = await readAsset(cue.file, cue.file.name);
        newAssets.push(a);
        layers.push({
          ...newLayer("slide", duration),
          name: a.name,
          assetId: a.id,
          start: cue.start,
          end: cue.end,
          fit: "contain",
          background: "#07121a",
        });
      }
      if (withCamera)
        layers.push({
          ...newLayer("video", duration),
          name: "מצלמה בחלון",
          assetId: base.id,
          x: 0.04,
          y: 0.76,
          width: 0.28,
          height:
            (((0.28 * doc.width) / doc.height) * base.height) / base.width,
          fit: "contain",
        });
      addAssets(newAssets);
      sourceBlob.current = blob;
      commit({
        ...doc,
        baseAssetId: base.id,
        duration,
        layers: [
          ...layers,
          ...doc.layers
            .filter((l) => l.kind === "logo")
            .map((l) => ({ ...l, end: duration })),
        ],
        captions: [],
      });
      setTime(0);
      setStatus("ההקלטה והשקופיות מוכנות לעריכה; אפשר לשנות כל מעבר.");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy("");
    }
  };
  const fileButton = (
    kind: "base" | "cover" | "logo" | "video" | "slide",
    label: string,
    icon: React.ReactNode,
  ) => (
    <label className="sv-button sv-file">
      {icon}
      {label}
      <input
        aria-label={label}
        type="file"
        accept={
          kind === "base" || kind === "video"
            ? "video/*"
            : "image/png,image/jpeg,image/webp"
        }
        multiple={kind === "slide" || kind === "video"}
        disabled={!!busy}
        onChange={(e) => {
          void upload(e.target.files, kind);
          e.target.value = "";
        }}
      />
    </label>
  );
  const chooseMusic = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "mp3" && extension !== "mp4") {
      onError("יש לבחור קובץ מוזיקה בפורמט MP3 או MP4");
      return;
    }
    musicRef.current?.pause();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicFile(file);
    setMusicUrl(URL.createObjectURL(file));
    setMusicDuration(0);
  };
  const clearMusic = () => {
    musicRef.current?.pause();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicFile(null);
    setMusicUrl(null);
    setMusicDuration(0);
  };
  const numberField = (
    label: string,
    value: number,
    change: (n: number) => void,
    min: number,
    max: number,
    step = 0.01,
  ) => (
    <label className="sv-field">
      {label}
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) change(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
  return (
    <div className="sv-root" dir="rtl">
      {musicUrl && (
        <audio
          ref={musicRef}
          src={musicUrl}
          preload="auto"
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            setMusicDuration(Number.isFinite(value) ? value : 0);
            event.currentTarget.volume = musicVolume;
          }}
          onError={() => onError("לא ניתן לקרוא את פס הקול. נסה MP3 או MP4 אחר.")}
        />
      )}
      <div className="sv-heading">
        <div>
          <div className="sv-eyebrow">
            מצפן הלב / DIRECTOR'S CUT <span>בטא</span>
          </div>
          <h1>המסר שלך. הפריים המדויק.</h1>
          <p>קאבר שעוצר. רגע שממחיש. כותרת שנשארת.</p>
        </div>
        <div className="sv-heading-actions">
          <button
            className="sv-button"
            onClick={() => setRecord(!record)}
            disabled={!!busy}
          >
            <Camera size={16} />
            הקלטת מצגת
          </button>
          <button
            className="sv-primary"
            disabled={!doc.baseAssetId || !!busy || !ready}
            onClick={exportVideo}
          >
            <Download size={16} />
            ייצוא הסרטון
          </button>
        </div>
      </div>
      {record && (
        <PresentationRecorder
          active={active}
          frameWidth={doc.width}
          frameHeight={doc.height}
          onRecorded={importRecording}
          onError={onError}
          scriptText={scriptText}
        />
      )}
      <fieldset disabled={!!busy} className="sv-workspace">
        <aside className="sv-panel sv-library">
          <div className="sv-panel-title">
            <Layers size={16} />
            חומרי הגלם
          </div>
          <p className="sv-hint">טוענים, ממקמים, מספרים.</p>
          {fileButton("base", "סרטון ראשי", <Upload size={16} />)}
          {fileButton("video", "קטע B-Roll", <Film size={16} />)}
          <div className="sv-audio-mixer">
            <label className="sv-button sv-file">
              <Music size={16} />
              {musicFile ? "החלף מוזיקה" : "מוזיקת רקע MP3 / MP4"}
              <input
                aria-label="מוזיקת רקע"
                type="file"
                accept="audio/mpeg,audio/mp3,video/mp4,audio/mp4,.mp3,.mp4"
                onChange={(event) => {
                  chooseMusic(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {musicFile && (
              <>
                <div className="sv-audio-name">
                  <span title={musicFile.name}>{musicFile.name}</span>
                  <button type="button" className="sv-icon sv-danger" onClick={clearMusic} aria-label="הסר מוזיקה">
                    <Trash2 size={14} />
                  </button>
                </div>
                <label className="sv-field">
                  <span><Volume2 size={13} /> קול מקורי — {Math.round(sourceVolume * 100)}%</span>
                  <input type="range" min="0" max="1" step=".01" value={sourceVolume} onChange={(e) => setSourceVolume(+e.target.value)} />
                </label>
                <label className="sv-field">
                  <span><Music size={13} /> מוזיקה — {Math.round(musicVolume * 100)}%</span>
                  <input type="range" min="0" max="1" step=".01" value={musicVolume} onChange={(e) => {
                    const value = +e.target.value;
                    setMusicVolume(value);
                    if (musicRef.current) musicRef.current.volume = value;
                  }} />
                </label>
                <label className="sv-field">
                  <span><Repeat2 size={13} /> התאמה לאורך הסרטון</span>
                  <select value={musicFitMode} onChange={(e) => setMusicFitMode(e.target.value as "auto" | "loop" | "trim")}>
                    <option value="auto">חכם — לופ אם קצר, קיצור אם ארוך</option>
                    <option value="loop">לופ קבוע</option>
                    <option value="trim">קיצור בסוף הטרק</option>
                  </select>
                </label>
                <p className="sv-hint">טרק {musicDuration.toFixed(1)} שנ׳ • סרטון {doc.duration.toFixed(1)} שנ׳</p>
              </>
            )}
          </div>
          {fileButton("cover", "קאבר מלא", <ImageIcon size={16} />)}
          {fileButton("slide", "שקופיות כתמונות", <Monitor size={16} />)}
          {fileButton("logo", "לוגו שקוף", <Bookmark size={16} />)}
          <button
            className="sv-button"
            onClick={() =>
              add([
                {
                  ...titleLayer(coverTitle || "הכותרת שלך"),
                  start: time,
                  end: Math.min(doc.duration, time + 3),
                },
              ])
            }
          >
            <Type size={16} />
            כותרת מתוזמנת
          </button>
          <div className="sv-divider" />
          <label className="sv-field">
            שם הפרויקט
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="sv-row">
            <button className="sv-button" onClick={save}>
              <Save size={15} />
              שמור
            </button>
            <button className="sv-button" onClick={restore}>
              <FolderOpen size={15} />
              פתח
            </button>
          </div>
          <p className="sv-hint">
            שמירה מקומית בדפדפן, כולל המדיה. ״שמור״ מעדכן את הפרויקט השמור.
          </p>
          <div className="sv-assets">
            {assets.map((a) => (
              <div key={a.id} title={a.name}>
                {a.kind === "video" ? (
                  <Film size={13} />
                ) : (
                  <ImageIcon size={13} />
                )}
                <span>{a.name}</span>
              </div>
            ))}
          </div>
        </aside>
        <section className="sv-panel sv-stage">
          <div className="sv-stage-toolbar">
            <div className="sv-row">
              <button
                aria-label="בטל פעולה"
                className="sv-icon"
                disabled={!history.past.length}
                onClick={() => {
                  const previous = history.past[history.past.length - 1];
                  setDoc(previous);
                  setHistory({
                    past: history.past.slice(0, -1),
                    future: [doc, ...history.future],
                  });
                }}
              >
                <Undo2 size={16} />
              </button>
              <button
                aria-label="בצע שוב"
                className="sv-icon"
                disabled={!history.future.length}
                onClick={() => {
                  setDoc(history.future[0]);
                  setHistory({
                    past: [...history.past, doc],
                    future: history.future.slice(1),
                  });
                }}
              >
                <Redo2 size={16} />
              </button>
            </div>
            <select
              aria-label="יחס פריים"
              value={
                doc.width === 1080 && doc.height === 1920
                  ? "9:16"
                  : doc.width === 1920 && doc.height === 1080
                    ? "16:9"
                    : doc.width === 1080 && doc.height === 1080
                      ? "1:1"
                      : doc.width === 1080 && doc.height === 1350
                        ? "4:5"
                        : `${doc.width}:${doc.height}`
              }
              onChange={(e) => {
                const map: Record<string, [number, number]> = {
                  "9:16": [1080, 1920],
                  "16:9": [1920, 1080],
                  "1:1": [1080, 1080],
                  "4:5": [1080, 1350],
                };
                const [w, h] = map[e.target.value] || [1080, 1920];
                commit({
                  ...doc,
                  width: w,
                  height: h,
                });
              }}
            >
              <option value="9:16">📱 9:16 (רילס / שורטס / טיקטוק)</option>
              <option value="16:9">🖥️ 16:9 (יוטיוב / מסך רחב)</option>
              <option value="1:1">🔲 1:1 (ריבועי פיד)</option>
              <option value="4:5">🖼️ 4:5 (אינסטגרם פורטרט)</option>
            </select>
            <button
              className={`sv-icon ${safe ? "selected" : ""}`}
              aria-label="אזור בטוח"
              title="הצגת שוליים מנחים בלבד; אינם חלק מהייצוא"
              onClick={() => setSafe(!safe)}
            >
              <Shield size={16} />
            </button>
          </div>
          <div className="sv-canvas-wrap">
            <div
              className="sv-canvas-frame"
              style={{ aspectRatio: `${doc.width}/${doc.height}` }}
            >
              <canvas
                ref={canvas}
                width={doc.width}
                height={doc.height}
                aria-label="תצוגה מקדימה של הסרטון"
              />
              {chosen && !playing && (
                <div
                  className={`sv-transform-box ${chosen.fit === "cover" || chosen.fit === "blur" ? "is-focal" : ""}`}
                  style={{
                    left: `${chosen.x * 100}%`,
                    top: `${chosen.y * 100}%`,
                    width: `${chosen.width * 100}%`,
                    height: `${chosen.height * 100}%`,
                  }}
                  title={
                    chosen.fit === "cover" || chosen.fit === "blur"
                      ? "גרור כדי לשנות את מוקד התמונה; גלול כדי לשנות זום"
                      : "גרור כדי להזיז; השתמש בידית כדי לכווץ או להגדיל"
                  }
                  onPointerDown={(event) => beginTransform("move", event)}
                  onPointerMove={moveTransform}
                  onPointerUp={endTransform}
                  onPointerCancel={endTransform}
                  onWheel={(event) => {
                    event.preventDefault();
                    const nextScale = bounded(
                      (chosen.scale || 1) * (event.deltaY > 0 ? 0.94 : 1.06),
                      0.2,
                      3,
                    );
                    update({ scale: nextScale });
                  }}
                >
                  <span>
                    {chosen.fit === "cover" || chosen.fit === "blur"
                      ? "גרור למיקוד • גלגלת לזום"
                      : "גרור להזזה"}
                  </span>
                  <button
                    type="button"
                    className="sv-resize-handle"
                    aria-label="שנה את גודל השכבה"
                    onPointerDown={(event) => beginTransform("resize", event)}
                    onPointerMove={moveTransform}
                    onPointerUp={endTransform}
                    onPointerCancel={endTransform}
                  />
                </div>
              )}
              {safe && <div className="sv-safe">אזור טקסט מנחה</div>}
              {!doc.baseAssetId && doc.layers.length === 0 && (
                <div className="sv-empty">
                  <Film size={34} />
                  <h2>הסיפור מתחיל כאן</h2>
                  <p>טען סרטון ראשי או התחל עם קאבר.</p>
                </div>
              )}
            </div>
          </div>
          <div className="sv-player">
            <button
              aria-label={playing ? "השהה" : "נגן"}
              className="sv-play"
              disabled={!doc.baseAssetId || !ready}
              onClick={async () => {
                if (playing) { setPlaying(false);pool.current?.videos.forEach(v => v.pause());return; }
                const currentPool = pool.current;
                if (!currentPool) return;
                const target = time >= doc.duration - .1 ? 0 : time;
                try { await seekComposition(doc,currentPool,target);setTime(target);setPlaying(true); }
                catch(error) { handleError(error); }
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <span dir="ltr">
              {stamp(time)} / {stamp(doc.duration)}
            </span>
            <button className="sv-icon" aria-label="חזור פריים אחד" onClick={() => {
              setPlaying(false); setTime(bounded(time - 1 / 30, 0, doc.duration - 0.001));
            }}>−</button>
            <button className="sv-icon" aria-label="התקדם פריים אחד" onClick={() => {
              setPlaying(false); setTime(bounded(time + 1 / 30, 0, doc.duration - 0.001));
            }}>+</button>
            <CaptionTimeInput label="מיקום מדויק בנגן" value={time} max={doc.duration - 0.001}
              onCommit={at => { setPlaying(false); setTime(bounded(at, 0, doc.duration - 0.001)); }} />
            <button
              className="sv-button"
              onClick={() => void coverDownload()}
              disabled={!ready}
            >
              <Download size={14} />
              שמור פריים כקאבר
            </button>
          </div>
          <input
            className="sv-scrub"
            aria-label="מיקום בנגן"
            type="range"
            dir="ltr"
            min="0"
            max={doc.duration - 0.001}
            step=".001"
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(+e.target.value);
            }}
          />
        </section>
        <aside className="sv-panel sv-inspector">
          <div className="sv-panel-title">
            <Type size={16} />
            {chosen ? labels[chosen.kind] : "בימוי הפריים"}
          </div>
          {!chosen ? (
            <div className="sv-hint sv-instructions">
              בחר שכבה בציר הזמן כדי לדייק את המיקום, החיתוך והתזמון.
              <br />
              <br />
              הקול של סרטון המקור נשאר רציף בזמן ה־B-Roll.
              <br />
              <br />
              קאבר ממלא את הפריים; שקופיות ולוגו שומרים על היחס המקורי.
            </div>
          ) : (
            <>
              <label className="sv-field">
                שם השכבה
                <input
                  value={chosen.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              {chosen.kind === "text" && (
                <>
                  <label className="sv-field">
                    המסר
                    <textarea
                      rows={3}
                      value={chosen.text || ""}
                      maxLength={180}
                      onChange={(e) => update({ text: e.target.value })}
                    />
                  </label>
                  <div className="sv-row">
                    <label className="sv-field">
                      צבע
                      <input
                        type="color"
                        value={chosen.color}
                        onChange={(e) => update({ color: e.target.value })}
                      />
                    </label>
                    <label className="sv-field">
                      סגנון
                      <select
                        value={chosen.background}
                        onChange={(e) => update({ background: e.target.value })}
                      >
                        <option value="rgba(2,6,23,.78)">קולנועי כהה</option>
                        <option value="transparent">טקסט נקי</option>
                        <option value="#0e3340">טורקיז עמוק</option>
                        <option value="#9f3f40">קורל</option>
                      </select>
                    </label>
                  </div>
                  {numberField(
                    "גודל כתב (% מגובה הפריים)",
                    chosen.fontSize * 100,
                    (n) => update({ fontSize: n / 100 }),
                    1,
                    15,
                    0.1,
                  )}
                </>
              )}
              <div className="sv-row">
                {numberField(
                  "מ־שנייה",
                  chosen.start,
                  (n) => update({ start: n }),
                  0,
                  chosen.end - 0.05,
                  0.1,
                )}
                {numberField(
                  "עד שנייה",
                  chosen.end,
                  (n) => update({ end: n }),
                  chosen.start + 0.05,
                  doc.duration,
                  0.1,
                )}
              </div>
              {chosen.kind === "video" &&
                chosen.assetId !== doc.baseAssetId &&
                numberField(
                  "התחלה בתוך קטע המקור",
                  chosen.sourceIn,
                  (n) =>
                    update({
                      sourceIn: n,
                      end: Math.min(
                        chosen.end,
                        chosen.start + (selectedAsset?.duration || 0) - n,
                      ),
                    }),
                  0,
                  Math.max(0, (selectedAsset?.duration || 0) - 0.1),
                  0.1,
                )}
              {chosen.kind === "logo" ? (
                <>
                  <label className="sv-field">
                    פינה
                    <select
                      value={
                        chosen.x < 0.5
                          ? chosen.y < 0.5
                            ? "tl"
                            : "bl"
                          : chosen.y < 0.5
                            ? "tr"
                            : "br"
                      }
                      onChange={(e) =>
                        update({
                          x: e.target.value.endsWith("l")
                            ? 0.05
                            : 0.95 - chosen.width,
                          y: e.target.value.startsWith("t")
                            ? 0.05
                            : 0.9 - chosen.height,
                        })
                      }
                    >
                      <option value="tl">שמאל עליון</option>
                      <option value="tr">ימין עליון</option>
                      <option value="bl">שמאל תחתון</option>
                      <option value="br">ימין תחתון</option>
                    </select>
                  </label>
                  {numberField(
                    "רוחב לוגו (% מהפריים)",
                    chosen.width * 100,
                    (n) => {
                      const width = n / 100,
                        height =
                          ((width * doc.width) / doc.height) *
                          (selectedAsset
                            ? selectedAsset.height / selectedAsset.width
                            : 1);
                      update({
                        width,
                        height,
                        x: chosen.x > 0.5 ? 0.95 - width : chosen.x,
                        y: chosen.y > 0.5 ? 0.9 - height : chosen.y,
                      });
                    },
                    3,
                    22,
                    1,
                  )}
                </>
              ) : (
                <>
                  {chosen.kind !== "text" && (
                    <>
                      <label className="sv-field">
                        פריסה מהירה בלחיצה אחת:
                      </label>
                      <div className="sv-preset-grid">
                        <button
                          type="button"
                          className={`sv-preset-btn ${chosen.width === 1 && chosen.height === 1 && chosen.fit === "cover" ? "active" : ""}`}
                          onClick={() =>
                            update({ x: 0, y: 0, width: 1, height: 1, fit: "cover", scale: 1 })
                          }
                        >
                          📱 מסך מלא
                        </button>
                        <button
                          type="button"
                          className={`sv-preset-btn ${chosen.fit === "blur" ? "active" : ""}`}
                          onClick={() =>
                            update({ x: 0, y: 0, width: 1, height: 1, fit: "blur", scale: 1 })
                          }
                          title="ממלא את המסך עם רקע מטושטש אוטומטי של התמונה — ללא פסים שחורים!"
                        >
                          🌫️ רקע מטושטש
                        </button>
                        <button
                          type="button"
                          className="sv-preset-btn"
                          onClick={() => {
                            const a = selectedAsset;
                            if (a && a.width && a.height) {
                              const assetAspect = a.width / a.height;
                              const canvasAspect = doc.width / doc.height;
                              if (assetAspect > canvasAspect) {
                                // Wide image (e.g. 16:9 on 9:16)
                                const h = canvasAspect / assetAspect;
                                update({
                                  x: 0,
                                  y: (1 - h) / 2,
                                  width: 1,
                                  height: Number(h.toFixed(3)),
                                  fit: "contain",
                                  scale: 1,
                                });
                              } else {
                                const w = assetAspect / canvasAspect;
                                update({
                                  x: (1 - w) / 2,
                                  y: 0,
                                  width: Number(w.toFixed(3)),
                                  height: 1,
                                  fit: "contain",
                                  scale: 1,
                                });
                              }
                            } else {
                              update({ x: 0, y: 0.22, width: 1, height: 0.56, fit: "contain" });
                            }
                          }}
                          title="מתאים את גודל השכבה בדיוק ליחס המקורי של התמונה"
                        >
                          🖼️ יחס תמונה
                        </button>
                        <button
                          type="button"
                          className="sv-preset-btn"
                          onClick={() =>
                            update({ x: 0, y: 0, width: 1, height: 0.5, fit: "cover" })
                          }
                        >
                          ⬆️ חצי עליון
                        </button>
                        <button
                          type="button"
                          className="sv-preset-btn"
                          onClick={() =>
                            update({ x: 0, y: 0.5, width: 1, height: 0.5, fit: "cover" })
                          }
                        >
                          ⬇️ חצי תחתון
                        </button>
                        <button
                          type="button"
                          className="sv-preset-btn"
                          onClick={() =>
                            update({
                              x: 0.05,
                              y: 0.65,
                              width: 0.38,
                              height: 0.28,
                              fit: "contain",
                              background: "#07121a",
                            })
                          }
                        >
                          🔲 חלון PiP
                        </button>
                      </div>

                      <div className="sv-row">
                        <label className="sv-field" style={{ flex: 1 }}>
                          סגנון התאמה (Fit Mode)
                          <select
                            value={chosen.fit}
                            onChange={(e) => update({ fit: e.target.value as any })}
                          >
                            <option value="cover">מילוי וחיתוך חכם (Cover)</option>
                            <option value="blur">רקע מטושטש מודרני (Blur Background)</option>
                            <option value="contain">הצג תמונה שלמה (Contain)</option>
                            <option value="stretch">מתיחה למסגרת (Stretch)</option>
                          </select>
                        </label>
                        {chosen.fit === "contain" && (
                          <label className="sv-field" style={{ width: "90px" }}>
                            צבע רקע
                            <input
                              type="color"
                              value={chosen.background === "transparent" ? "#000000" : chosen.background}
                              onChange={(e) => update({ background: e.target.value })}
                            />
                          </label>
                        )}
                      </div>

                      <div className="sv-row">
                        {numberField(
                          "זום / קנה מידה (%)",
                          (chosen.scale || 1) * 100,
                          (n) => update({ scale: n / 100 }),
                          20,
                          300,
                          5,
                        )}
                        {numberField(
                          "שקיפות (%)",
                          chosen.opacity * 100,
                          (n) => update({ opacity: n / 100 }),
                          0,
                          100,
                          5,
                        )}
                      </div>
                    </>
                  )}

                  <div className="sv-row">
                    {numberField(
                      "מיקום X (%)",
                      chosen.x * 100,
                      (n) => update({ x: n / 100 }),
                      0,
                      100 - chosen.width * 100,
                      1,
                    )}
                    {numberField(
                      "מיקום Y (%)",
                      chosen.y * 100,
                      (n) => update({ y: n / 100 }),
                      0,
                      100 - chosen.height * 100,
                      1,
                    )}
                  </div>
                  <div className="sv-row">
                    {numberField(
                      "רוחב (%)",
                      chosen.width * 100,
                      (n) => update({ width: n / 100 }),
                      5,
                      100 - chosen.x * 100,
                      1,
                    )}
                    {numberField(
                      "גובה (%)",
                      chosen.height * 100,
                      (n) => update({ height: n / 100 }),
                      5,
                      100 - chosen.y * 100,
                      1,
                    )}
                  </div>
                  {(chosen.fit === "cover" || chosen.fit === "blur") && chosen.kind !== "text" && (
                    <div className="sv-row">
                      {numberField(
                        "מוקד אופקי (%)",
                        chosen.focalX * 100,
                        (n) => update({ focalX: n / 100 }),
                        0,
                        100,
                        1,
                      )}
                      {numberField(
                        "מוקד אנכי (%)",
                        chosen.focalY * 100,
                        (n) => update({ focalY: n / 100 }),
                        0,
                        100,
                        1,
                      )}
                    </div>
                  )}
                </>
              )}
              {numberField(
                "כניסה ויציאה רכות (שניות)",
                chosen.fade,
                (n) => update({ fade: n }),
                0,
                Math.min(1, (chosen.end - chosen.start) / 2),
                0.05,
              )}
              <div className="sv-row">
                <button
                  className="sv-icon"
                  aria-label="העלה שכבה"
                  onClick={() => move(1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="sv-icon"
                  aria-label="הורד שכבה"
                  onClick={() => move(-1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="sv-button sv-danger"
                  onClick={() => {
                    commit({
                      ...doc,
                      layers: doc.layers.filter((l) => l.id !== selected),
                    });
                    setSelected(null);
                  }}
                >
                  <Trash2 size={15} />
                  מחק שכבה
                </button>
              </div>
            </>
          )}
        </aside>
      </fieldset>
      <section className="sv-panel sv-timeline">
        <div className="sv-panel-title">
          <Layers size={16} />
          ציר הזמן{" "}
          <span className="sv-hint">
            לחץ על שכבה לעריכה • הכותרות והלוגו ניתנים לתזמון
          </span>
        </div>
        <div className="sv-ruler" dir="ltr">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i}>{stamp((doc.duration * i) / 4)}</span>
          ))}
        </div>
        {doc.layers.length === 0 && (
          <p className="sv-hint">
            הוסף קאבר, כותרת או B-Roll כדי לראות אותם כאן.
          </p>
        )}
        {doc.layers.map((l) => (
          <div
            key={l.id}
            className={`sv-track ${l.id === selected ? "active" : ""}`}
          >
            <button
              disabled={!!busy}
              onClick={() => {
                setSelected(l.id);
                setPlaying(false);
                setTime(l.start);
              }}
            >
              {labels[l.kind]}
              <small>{l.name}</small>
            </button>
            <div className="sv-track-lane" dir="ltr">
              <button
                disabled={!!busy}
                aria-label={`בחר ${l.name}`}
                className={`sv-clip sv-${l.kind}`}
                style={{
                  left: `${(l.start / doc.duration) * 100}%`,
                  width: `${((l.end - l.start) / doc.duration) * 100}%`,
                }}
                onClick={() => {
                  setSelected(l.id);
                  setPlaying(false);
                  setTime(l.start);
                }}
              >
                {l.kind === "text" ? l.text : stamp(l.end - l.start)}
              </button>
              <div
                className="sv-playhead"
                style={{ left: `${(time / doc.duration) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </section>
      <section className="sv-panel sv-captions">
        <div className="sv-row">
          <button
            className="sv-button"
            disabled={!doc.baseAssetId || !!busy}
            onClick={transcribe}
          >
            תמלול AI בעברית
          </button>
          <button
            className="sv-button"
            onClick={() => setCaptionsOpen(!captionsOpen)}
          >
            כתוביות ({doc.captions.length})
          </button>
          <button className="sv-button" disabled={!doc.captions.length || !!busy} onClick={proofreadCaptions}>הגהת כתיב</button>
          <button className="sv-button" disabled={!doc.captions.length || !!busy} onClick={() => {
            commit({ ...doc, captions: splitLongCaptions(doc.captions) });
            setStatus("כתוביות ארוכות חולקו למקטעים קצרים. זמני תחילת וסיום המקטע המקורי נשמרו.");
          }}>פצל כתוביות ארוכות</button>
          <button
            className="sv-button"
            disabled={!!busy}
            onClick={() => {
              commit({
                ...doc,
                captions: [
                  ...doc.captions,
                  {
                    id: Date.now(),
                    start: time - (doc.captionOffset || 0),
                    end: Math.min(doc.duration, time + 2) - (doc.captionOffset || 0),
                    text: "כתובית חדשה",
                  },
                ],
              });
              setCaptionsOpen(true);
            }}
          >
            <Plus size={14} />
            כתובית ידנית
          </button>
        </div>
        {captionsOpen && (
          <div className="sv-caption-list">
            <div className="sv-caption-tools">
              <label className="sv-field">
                עיצוב כתוביות
                <select
                  value={captionStyle.preset}
                  onChange={(event) =>
                    commit({
                      ...doc,
                      captionStyle: {
                        ...captionStyle,
                        preset: event.target.value as typeof captionStyle.preset,
                      },
                    })
                  }
                >
                  <option value="classic">קלאסי — לבן על רקע כהה</option>
                  <option value="karaoke">קריוקי — מילה פעילה בצהוב</option>
                  <option value="clean">נקי — טקסט ללא מסגרת</option>
                  <option value="highlight">הדגשה — כהה על צהוב</option>
                </select>
              </label>
              <label className="sv-field">
                סנכרון שרשרת
                <input type="checkbox" aria-label="סנכרון שרשרת כתוביות" checked={doc.captionRipple !== false}
                  onChange={event => commit({ ...doc, captionRipple: event.target.checked })} />
                <small>שינוי התחלה מזיז את הכתובית והבאות באותו הפרש. שינוי סיום מזיז את הבאות ושומר את ההפסקות.</small>
              </label>
              <label className="sv-field">
                תיקון סנכרון לכל הכתוביות (שניות)
                <CaptionTimeInput label="תיקון סנכרון לכל הכתוביות (שניות)" value={doc.captionOffset || 0} min={-5} max={5}
                  onCommit={offset => commit({ ...doc, captionOffset: bounded(offset, -5, 5) })} />
                <small>חיובי = הכתוביות יופיעו מאוחר יותר</small>
              </label>
              <label className="sv-field">
                גודל
                <input
                  type="range"
                  min={65}
                  max={180}
                  step={5}
                  value={captionStyle.size * 100}
                  onChange={(event) =>
                    commit({
                      ...doc,
                      captionStyle: {
                        ...captionStyle,
                        size: +event.target.value / 100,
                      },
                    })
                  }
                />
              </label>
              <label className="sv-field">
                גובה בפריים
                <input
                  type="range"
                  min={8}
                  max={86}
                  step={1}
                  value={captionStyle.position * 100}
                  onChange={(event) =>
                    commit({
                      ...doc,
                      captionStyle: {
                        ...captionStyle,
                        position: +event.target.value / 100,
                      },
                    })
                  }
                />
              </label>
              <label className="sv-field sv-color-field">
                צבע פעיל
                <input
                  type="color"
                  value={captionStyle.accent}
                  onChange={(event) =>
                    commit({
                      ...doc,
                      captionStyle: { ...captionStyle, accent: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <p className="sv-hint">הזמנים הם זמני ההופעה בסרטון, כולל תיקון הסנכרון הכללי. אפשר לדייק במאיות שנייה; אשר שינוי עם Enter או ביציאה מהשדה.</p>
            {[...doc.captions].sort((a, b) => a.start - b.start).map((cap) => (
              <div className="sv-row" key={cap.id}>
                <CaptionTimeInput label="תחילת כתובית" value={cap.start + (doc.captionOffset || 0)} max={doc.duration}
                  onCommit={at => editCaptionTime(cap.id, 'start', at)} />
                <CaptionTimeInput label="סיום כתובית" value={cap.end + (doc.captionOffset || 0)}
                  min={cap.start + (doc.captionOffset || 0) + 0.08} max={doc.duration}
                  onCommit={at => editCaptionTime(cap.id, 'end', at)} />
                <input
                  aria-label="טקסט כתובית"
                  value={cap.text}
                  onChange={(e) =>
                    commit({
                      ...doc,
                      captions: doc.captions.map((c) =>
                        c.id === cap.id ? { ...c, text: e.target.value } : c,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="sv-icon"
                  title="קבע התחלה בזמן הנגן ושמור את משך הכתובית"
                  aria-label="סנכרן את תחילת הכתובית לזמן הנוכחי"
                  onClick={() => pinCaption(cap.id, 'start')}
                >⏱</button>
                <button type="button" className="sv-icon" title="קבע סיום בזמן הנגן"
                  aria-label="סנכרן את סיום הכתובית לזמן הנוכחי" onClick={() => pinCaption(cap.id, 'end')}>סוף</button>
                <button type="button" className="sv-icon" aria-label="עבור לתחילת הכתובית"
                  onClick={() => { setPlaying(false); setTime(bounded(cap.start + (doc.captionOffset || 0), 0, doc.duration)); }}>▶</button>
                <button
                  aria-label="מחק כתובית"
                  className="sv-icon"
                  onClick={() =>
                    commit({
                      ...doc,
                      captions: doc.captions.filter((c) => c.id !== cap.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      {(status || busy) && (
        <div className="sv-status" role="status">
          {busy && <Loader size={15} className="animate-spin" />}
          <span>
            {busy ? `${busy} · ` : ""}
            {status}
          </span>
          {busy === "ייצוא" && (
            <>
              <progress value={progress} max={1} />
              <button onClick={() => abort.current?.abort()}>בטל ייצוא</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
