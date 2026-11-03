import React, { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ActiveTab } from "./types/studio";
import { Navigation } from "./components/Navigation";
import { SettingsModal } from "./components/SettingsModal";
import { RecordingStudio } from "./components/Studio/RecordingStudio";
import { VideoEditor } from "./components/Editor/VideoEditor";
import { CreativeV2 } from "./components/CreativeV2";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("creative-v2");
  const [coverTitle, setCoverTitle] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Global Content State
  const [currentScript, setCurrentScript] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 6000);
  };

  const handleVideoRecorded = (blob: Blob, url: string, dur?: number) => {
    setVideoBlob(blob);
    setVideoUrl(URL.createObjectURL(blob));
    if (dur && dur > 0) {
      setVideoDuration(dur);
    }
  };

  return (
    <div
      className={`bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white ${
        activeTab === "studio" || activeTab === "editor"
          ? "h-[100dvh] max-h-[100dvh] overflow-hidden"
          : "min-h-screen"
      }`}
      dir="rtl"
    >
      {/* Global Error Alert Toast */}
      {errorMsg && (
        <div role="alert" className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-rose-600/95 text-white px-6 py-3.5 rounded-full shadow-2xl z-50 flex items-center gap-2 border border-rose-400 backdrop-blur-md animate-in slide-in-from-bottom-5">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-xs md:text-sm font-bold">{errorMsg}</span>
        </div>
      )}

      {/* Header Navigation with 3 Core Pipeline Steps */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        hasRecordedVideo={!!videoUrl}
      />

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto ${
        activeTab === "studio" || activeTab === "editor"
          ? "p-0 pb-0 max-w-full flex-1 min-h-0 overflow-hidden flex flex-col"
          : "max-w-[1560px] p-4 md:p-6 pb-20 overflow-y-auto"
      }`}>
        {/* STEP 1: Unified Creative & Viral Script Engine */}
        <div hidden={activeTab !== "creative-v2"}>
          <CreativeV2
            currentScript={currentScript}
            onScriptChange={setCurrentScript}
            onError={triggerError}
            onUseScript={(script, title) => {
              setCurrentScript(script);
              setCoverTitle(title || "");
              setActiveTab("studio");
            }}
            onUseCover={(title) => {
              setCoverTitle(title);
              setActiveTab("editor");
            }}
          />
        </div>

        {/* STEP 2: Mobile Broadcast Recording Studio */}
        {activeTab === "studio" && (
          <RecordingStudio
            scriptText={currentScript}
            onScriptChange={setCurrentScript}
            onVideoRecorded={handleVideoRecorded}
            onOpenEditor={() => setActiveTab("editor")}
            onError={triggerError}
          />
        )}

        {/* STEP 3: Unified Pro Video Editor with Karaoke Subtitles */}
        <div hidden={activeTab !== "editor"} className="w-full h-full flex-1 min-h-0 flex flex-col overflow-hidden">
          <VideoEditor
            active={activeTab === "editor"}
            videoBlob={videoBlob}
            videoUrl={videoUrl}
            initialDuration={videoDuration}
            referenceScript={currentScript}
            onBackToStudio={() => setActiveTab("studio")}
            onVideoUploaded={(blob, url) => {
              setVideoBlob(blob);
              setVideoUrl(url);
            }}
            onError={triggerError}
          />
        </div>
      </main>

      {/* API Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
