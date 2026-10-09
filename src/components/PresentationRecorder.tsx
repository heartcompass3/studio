import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Mic,
  Square,
  ChevronRight,
  ChevronLeft,
  Upload,
  Play,
} from "lucide-react";
import { fixWebmDuration } from "../services/webmFixer";
import { createBoostedAudioPipeline, BoostedAudioResult } from "../services/audioService";

interface Props {
  onRecorded: (
    blob: Blob,
    slides: { file: File; start: number; end: number }[],
    duration: number,
    withCamera?: boolean,
  ) => void;
  onError: (s: string) => void;
  scriptText?: string;
  active?: boolean;
  frameWidth?: number;
  frameHeight?: number;
}
export function PresentationRecorder({
  onRecorded,
  onError,
  scriptText,
  active = true,
  frameWidth = 1080,
  frameHeight = 1920,
}: Props) {
  const [slides, setSlides] = useState<{ file: File; url: string }[]>([]);
  const [index, setIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [camera, setCamera] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const boostedPipeline = useRef<BoostedAudioResult | null>(null);
  const cues = useRef<{ index: number; start: number }[]>([]);
  const start = useRef(0);
  const alive = useRef(true);
  const urls = useRef<string[]>([]);
  const frame = useRef(0);
  const cameraRef = useRef(true);
  const stopStream = () => {
    cancelAnimationFrame(frame.current);
    if (boostedPipeline.current) {
      boostedPipeline.current.cleanup();
      boostedPipeline.current = null;
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopStream();
      urls.current.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    if (!active) {
      if (recorder.current?.state === "recording") recorder.current.stop();
      else stopStream();
      setEnabled(false);
    }
  }, [active]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(
      () => setSeconds((performance.now() - start.current) / 1000),
      100,
    );
    return () => clearInterval(timer);
  }, [recording]);
  const enable = async () => {
    setLoading(true);
    try {
      stopStream();
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: camera
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 30 }
          : false,
      });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      cameraRef.current = camera;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setEnabled(true);
    } catch (e) {
      onError("לא ניתן להפעיל מצלמה / מיקרופון. בדוק את הרשאות הדפדפן.");
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  const changeSlide = (next: number) => {
    if (next < 0 || next >= slides.length || next === index) return;
    setIndex(next);
    if (recording)
      cues.current.push({
        index: next,
        start: (performance.now() - start.current) / 1000,
      });
  };
  const begin = () => {
    if (!stream.current || !slides.length) return;
    try {
      const rawAudioTrack = stream.current.getAudioTracks()[0];
      let recordAudioTrack = rawAudioTrack;
      if (rawAudioTrack) {
        try {
          const rawAudioStream = new MediaStream([rawAudioTrack]);
          const pipeline = createBoostedAudioPipeline(rawAudioStream, 2.5);
          boostedPipeline.current = pipeline;
          const boostedTracks = pipeline.processedStream.getAudioTracks();
          if (boostedTracks.length > 0) {
            recordAudioTrack = boostedTracks[0];
          }
        } catch (e) {}
      }

      let recordStream = stream.current;
      if (!cameraRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d")!;
        const paint = () => {
          ctx.fillStyle = "#07121a";
          ctx.fillRect(0, 0, 1080, 1920);
          frame.current = requestAnimationFrame(paint);
        };
        paint();
        const canvasStream = canvas.captureStream(30);
        if (recordAudioTrack) canvasStream.addTrack(recordAudioTrack);
        recordStream = canvasStream;
      } else if (recordAudioTrack) {
        const composite = new MediaStream();
        if (stream.current.getVideoTracks()[0]) composite.addTrack(stream.current.getVideoTracks()[0]);
        composite.addTrack(recordAudioTrack);
        recordStream = composite;
      }

      const mime = [
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("הדפדפן אינו תומך בהקלטה");
      const rec = new MediaRecorder(recordStream, {
        mimeType: mime,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 192000,
      });
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        onError("ההקלטה נכשלה");
        stopStream();
        setRecording(false);
        setEnabled(false);
      };
      rec.onstop = async () => {
        const duration = (performance.now() - start.current) / 1000;
        cancelAnimationFrame(frame.current);
        if (!cameraRef.current)
          recordStream.getVideoTracks().forEach((t) => t.stop());
        stopStream();
        if (!alive.current) return;
        setRecording(false);
        setEnabled(false);
        setLoading(true);
        try {
          if (!chunks.length) throw new Error("ההקלטה ריקה");
          const raw = new Blob(chunks, {
            type: mime.includes("mp4") ? "video/mp4" : "video/webm",
          });
          const blob = mime.includes("mp4")
            ? raw
            : await fixWebmDuration(raw, duration * 1000);
          const visits = cues.current
            .map((cue, i) => ({
              file: slides[cue.index].file,
              start: cue.start,
              end: cues.current[i + 1]?.start ?? duration,
            }))
            .filter((s) => s.end - s.start > 0.02);
          if (alive.current)
            onRecorded(blob, visits, duration, cameraRef.current);
        } catch (e) {
          onError(e instanceof Error ? e.message : "שמירת ההקלטה נכשלה");
        } finally {
          if (alive.current) setLoading(false);
        }
      };
      start.current = performance.now();
      cues.current = [{ index, start: 0 }];
      setSeconds(0);
      rec.start(250);
      setRecording(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "ההקלטה לא התחילה");
    }
  };
  return (
    <section className="sv-panel sv-presentation">
      <div className="sv-panel-title">
        <Camera size={17} />
        הקלטה עם מצגת{" "}
        <span className="sv-hint">הקול והמעברים נשמרים כשכבות לעריכה</span>
      </div>
      <div className="sv-row">
        <label className="sv-button sv-file">
          <Upload size={15} />
          טען שקופיות (PNG / JPG)
          <input
            aria-label="טען שקופיות להקלטה"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            disabled={recording || loading}
            onChange={(e) => {
              const next = Array.from(e.target.files || []).map((file) => {
                const url = URL.createObjectURL(file);
                urls.current.push(url);
                return { file, url };
              });
              setSlides((s) => [...s, ...next]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="sv-check">
          <input
            type="checkbox"
            checked={camera}
            disabled={recording || loading || enabled}
            onChange={(e) => setCamera(e.target.checked)}
          />
          עם מצלמה
        </label>
        <button
          className="sv-button"
          disabled={recording || loading}
          onClick={enable}
        >
          {camera ? <Camera size={15} /> : <Mic size={15} />}הפעל{" "}
          {camera ? "מצלמה ומיקרופון" : "מיקרופון"}
        </button>
        <button
          className={recording ? "sv-button sv-danger" : "sv-primary"}
          disabled={loading || (!recording && (!enabled || !slides.length))}
          onClick={() => (recording ? recorder.current?.stop() : begin())}
        >
          {recording ? <Square size={15} /> : <Play size={15} />}{" "}
          {recording ? "סיים ופתח בעורך" : "התחל הקלטה"}
        </button>
        <span dir="ltr">{seconds.toFixed(1)}s</span>
      </div>
      <div className="sv-presentation-body">
        <div
          className="sv-slide-preview"
          style={{
            aspectRatio: `${frameWidth}/${frameHeight}`,
            width: frameWidth < frameHeight ? 270 : 600,
            flex: "none",
            maxWidth: "100%",
          }}
        >
          {slides[index] ? (
            <img src={slides[index].url} alt={`שקופית ${index + 1}`} />
          ) : (
            <p>ייצא את שקופיות המצגת כתמונות וטען אותן כאן.</p>
          )}
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            style={{
              left: "4%",
              top: "76%",
              bottom: "auto",
              width: "28%",
              borderRadius: 0,
              border: 0,
            }}
            className={camera ? "" : "hidden"}
          />
        </div>
        {scriptText && (
          <div className="sv-presentation-script">
            <strong>התסריט שלך</strong>
            <p>{scriptText}</p>
          </div>
        )}
      </div>
      <div className="sv-row">
        <button
          className="sv-button"
          disabled={index <= 0 || loading}
          onClick={() => changeSlide(index - 1)}
        >
          <ChevronRight size={16} />
          הקודמת
        </button>
        <span>
          {slides.length ? index + 1 : 0} / {slides.length}
        </span>
        <button
          className="sv-button"
          disabled={index >= slides.length - 1 || loading}
          onClick={() => changeSlide(index + 1)}
        >
          הבאה
          <ChevronLeft size={16} />
        </button>
        <span className="sv-hint">
          לחיצה על ״הבאה״ בזמן ההקלטה מתזמנת את המעבר בסרטון.
        </span>
      </div>
    </section>
  );
}
