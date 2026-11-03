import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { AlertCircle } from "lucide-react";
import { ActiveTab, StudioTake } from "./types/studio";
import { Navigation } from "./components/Navigation";
import { SettingsModal } from "./components/SettingsModal";
import { RecordingStudio } from "./components/Studio/RecordingStudio";
import { VideoEditor } from "./components/Editor/VideoEditor";
import { CreativeV2 } from "./components/CreativeV2";
import {
  EditorDraft,
  emptyStudioProject,
  readStudioProject,
  writeStudioProject,
} from "./services/studioProject";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("creative-v2");
  const [project, setProject] = useState(emptyStudioProject);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(
    window.visualViewport?.height,
  );
  const videoUrl = useMemo(
    () => (project.media ? URL.createObjectURL(project.media.blob) : null),
    [project.media?.blob],
  );
  const pending = useRef(false);
  const latest = useRef(project);
  latest.current = project;
  const saveQueue = useRef(Promise.resolve());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setViewportHeight(viewport?.height);
    viewport?.addEventListener("resize", update);
    return () => viewport?.removeEventListener("resize", update);
  }, []);
  const triggerError = useCallback((message: string) => {
    setErrorMsg(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setErrorMsg(""), 7000);
  }, []);
  useEffect(() => {
    let cancelled = false;
    readStudioProject()
      .then((saved) => {
        if (cancelled) {
          saved?.takes.forEach((t) => URL.revokeObjectURL(t.url));
          return;
        }
        if (saved) setProject(saved);
        setSaveStatus(saved ? "הפרויקט שוחזר" : "שמירה אוטומטית במכשיר");
      })
      .catch(() => {
        if (!cancelled) {
          setStorageAvailable(false);
          setSaveStatus("השמירה אינה זמינה");
          triggerError(
            "לא ניתן לשחזר את הפרויקט בדפדפן הזה. העבודה החדשה לא תישמר אוטומטית.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(toastTimer.current);
    };
  }, [triggerError]);
  useEffect(() => {
    if (!ready || !storageAvailable) return;
    pending.current = true;
    setSaveStatus("שומר…");
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => writeStudioProject(project))
        .then(() => {
          if (latest.current === project) {
            pending.current = false;
            setSaveStatus("נשמר במכשיר");
          }
        })
        .catch(() => {
          setSaveStatus("השמירה נכשלה");
          triggerError(
            "הפרויקט לא נשמר. ייתכן שהאחסון מלא. הורד את הסרטון לפני סגירת העמוד.",
          );
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [project, ready, storageAvailable, triggerError]);
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || busy || !storageAvailable) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, storageAvailable]);
  const changeTab = (tab: ActiveTab) => {
    if (busy && tab !== activeTab) {
      triggerError("יש לסיים את ההקלטה או הייצוא לפני מעבר למסך אחר.");
      return;
    }
    setActiveTab(tab);
  };
  const changeScript = useCallback(
    (script: string) =>
      setProject((p) => (p.script === script ? p : { ...p, script })),
    [],
  );
  const changeTakes = useCallback<
    React.Dispatch<React.SetStateAction<StudioTake[]>>
  >((update) => {
    setProject((p) => ({
      ...p,
      takes: typeof update === "function" ? update(p.takes) : update,
    }));
  }, []);
  const changeEditor = useCallback(
    (editor: EditorDraft) => setProject((p) => ({ ...p, editor })),
    [],
  );
  const useVideo = useCallback((blob: Blob, _url: string, duration = 0) => {
    setProject((p) =>
      p.media?.blob === blob
        ? p
        : {
            ...p,
            media: { id: crypto.randomUUID(), blob, duration },
            editor: null,
          },
    );
  }, []);
  const fullScreen = activeTab === "studio" || activeTab === "editor";
  return (
    <div
      style={
        fullScreen && viewportHeight ? { height: viewportHeight } : undefined
      }
      className={`bg-slate-950 text-slate-100 flex flex-col font-sans ${fullScreen ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"}`}
      dir="rtl"
    >
      <Navigation
        activeTab={activeTab}
        setActiveTab={changeTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        hasRecordedVideo={!!project.media}
      />
      {errorMsg && (
        <div
          role="alert"
          className="fixed bottom-8 inset-x-4 mx-auto max-w-lg bg-rose-900 text-white p-4 rounded-2xl shadow-2xl z-[70] flex gap-2 text-sm"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          {errorMsg}
        </div>
      )}
      <main
        className={
          fullScreen
            ? "flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden"
            : "w-full max-w-[1560px] mx-auto p-4 md:p-6 pb-12"
        }
      >
        {!ready ? (
          <p className="p-8 text-center text-slate-400" role="status">
            משחזר את סביבת העבודה…
          </p>
        ) : (
          <>
            <div
              style={{
                display: activeTab === "creative-v2" ? "block" : "none",
              }}
            >
              <CreativeV2
                currentScript={project.script}
                onScriptChange={changeScript}
                onError={triggerError}
                onUseScript={(script, coverTitle) => {
                  setProject((p) => ({
                    ...p,
                    script,
                    coverTitle: coverTitle || "",
                  }));
                  setActiveTab("studio");
                }}
                onUseCover={(coverTitle) => {
                  setProject((p) => ({
                    ...p,
                    coverTitle,
                    editor: p.editor
                      ? { ...p.editor, headlineText: coverTitle }
                      : null,
                  }));
                  setActiveTab("editor");
                }}
              />
            </div>
            <div
              style={{ display: activeTab === "studio" ? "flex" : "none" }}
              className="flex-1 min-h-0 flex-col"
            >
              <RecordingStudio
                active={activeTab === "studio"}
                takes={project.takes}
                onTakesChange={changeTakes}
                onBusyChange={setBusy}
                onVideoRemoved={(blob) =>
                  setProject((p) =>
                    p.media?.blob === blob
                      ? { ...p, media: null, editor: null }
                      : p,
                  )
                }
                scriptText={project.script}
                onScriptChange={changeScript}
                onVideoRecorded={useVideo}
                onOpenEditor={() => changeTab("editor")}
                onError={triggerError}
              />
            </div>
            <div
              style={{ display: activeTab === "editor" ? "flex" : "none" }}
              className="flex-1 min-h-0 flex-col overflow-hidden"
            >
              <VideoEditor
                key={project.media?.id || "empty"}
                active={activeTab === "editor"}
                videoBlob={project.media?.blob || null}
                videoUrl={videoUrl}
                initialDuration={project.media?.duration || 0}
                initialDraft={project.editor}
                coverTitle={project.coverTitle}
                onDraftChange={changeEditor}
                onBusyChange={setBusy}
                referenceScript={project.script}
                onBackToStudio={() => changeTab("studio")}
                onVideoUploaded={useVideo}
                onError={triggerError}
              />
            </div>
          </>
        )}
      </main>
      <div
        role="status"
        className="fixed bottom-0 left-2 z-40 text-[10px] text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded-t-md pointer-events-none"
      >
        {saveStatus}
      </div>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
