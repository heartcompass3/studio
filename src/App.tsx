import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { ActiveTab } from "./types/studio";
import { Navigation } from "./components/Navigation";
import { SettingsModal } from "./components/SettingsModal";
import { ScriptEngine } from "./components/ScriptGenerator/ScriptEngine";
import { RecordingStudio } from "./components/Studio/RecordingStudio";
import { VideoEditor } from "./components/Editor/VideoEditor";
import { OfferLab } from "./components/Tools/OfferLab";
import { SmsGenerator } from "./components/Tools/SmsGenerator";
import { BehaviorTranslator } from "./components/Tools/BehaviorTranslator";
import { LoopMapper } from "./components/Tools/LoopMapper";
import { CoachRoom } from "./components/Tools/CoachRoom";
import { EditorV2 } from "./components/EditorV2";
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

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 6000);
  };

  const handleVideoRecorded = (blob: Blob, url: string, dur?: number) => {
    setVideoBlob(blob);
    setVideoUrl(url);
    if (dur && dur > 0) {
      setVideoDuration(dur);
    }
  };

  const handleSendToStudio = () => {
    setActiveTab("studio");
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white"
      dir="rtl"
    >
      {/* Global Error Alert Toast */}
      {errorMsg && (
        <div role="alert" className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-rose-600/95 text-white px-6 py-3.5 rounded-full shadow-2xl z-50 flex items-center gap-2 border border-rose-400 backdrop-blur-md animate-in slide-in-from-bottom-5">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-xs md:text-sm font-bold">{errorMsg}</span>
        </div>
      )}

      {/* Header Navigation */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        hasRecordedVideo={!!videoUrl}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1560px] mx-auto p-4 md:p-6 pb-20">
        <div hidden={activeTab !== "creative-v2"}>
          <CreativeV2
            onError={triggerError}
            onUseScript={(script, title) => {
              setCurrentScript(script);
              setCoverTitle(title || "");
              setActiveTab("studio");
            }}
            onUseCover={(title) => {
              setCoverTitle(title);
              setActiveTab("editor-v2");
            }}
          />
        </div>
        <div hidden={activeTab !== "editor-v2"}>
          <EditorV2
            active={activeTab === "editor-v2"}
            videoBlob={videoBlob}
            coverTitle={coverTitle}
            scriptText={currentScript}
            onError={triggerError}
          />
        </div>

        {/* TAB 1: Scripts & Hooks */}
        {activeTab === "brain" && (
          <ScriptEngine
            currentScript={currentScript}
            onScriptChange={setCurrentScript}
            onSendToStudio={handleSendToStudio}
            onError={triggerError}
          />
        )}

        {/* TAB 2: Broadcast Recording Studio */}
        {activeTab === "studio" && (
          <RecordingStudio
            scriptText={currentScript}
            onVideoRecorded={handleVideoRecorded}
            onOpenEditor={() => setActiveTab("editor-v2")}
            onError={triggerError}
          />
        )}

        {/* TAB 3: Pro Video Editor & Subtitles */}
        {activeTab === "editor" && (
          <VideoEditor
            videoBlob={videoBlob}
            videoUrl={videoUrl}
            initialDuration={videoDuration}
            referenceScript={currentScript}
            onBackToStudio={() => setActiveTab("studio")}
            onError={triggerError}
          />
        )}

        {/* TAB 4: Hormozi Offer Lab */}
        {activeTab === "offer" && (
          <OfferLab
            onUsePitchAsIdea={(pitch) => {
              setCurrentScript(pitch);
              setActiveTab("brain");
            }}
            onError={triggerError}
          />
        )}

        {/* TAB 5: Reconnection WhatsApp SMS */}
        {activeTab === "sms" && <SmsGenerator onError={triggerError} />}

        {/* TAB 6: Teen Behavior Translator */}
        {activeTab === "translator" && (
          <BehaviorTranslator onError={triggerError} />
        )}

        {/* TAB 7: Family Loop Mapper */}
        {activeTab === "loop" && <LoopMapper onError={triggerError} />}

        {/* TAB 8: Coach Room & Teen Simulator */}
        {activeTab === "coach" && (
          <CoachRoom
            onConvertToScriptIdea={(idea) => {
              setCurrentScript(idea);
              setActiveTab("brain");
            }}
            onError={triggerError}
          />
        )}
      </main>

      {/* API Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
