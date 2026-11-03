import React from "react";
import { Video, Settings, Sparkles, Scissors, Check } from "lucide-react";
import { ActiveTab } from "../types/studio";
export const Navigation: React.FC<{
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  hasRecordedVideo: boolean;
}> = ({ activeTab, setActiveTab, onOpenSettings, hasRecordedVideo }) => (
  <header className="shrink-0 z-40 bg-[#0c1220] border-b border-white/10">
    <div className="mx-auto max-w-[1560px] px-2 sm:px-5 h-14 flex items-center gap-2 sm:gap-6">
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <Sparkles className="w-6 h-6 text-teal-300" />
        <span className="font-black text-white">
          מצפן הלב{" "}
          <span className="font-normal text-slate-400 text-xs">Studio</span>
        </span>
      </div>
      <nav
        aria-label="שלבי ההפקה"
        className="grid grid-cols-3 gap-1 flex-1 min-w-0 sm:max-w-lg sm:mx-auto"
      >
        {(
          [
            { id: "creative-v2", label: "תסריט", icon: Sparkles },
            { id: "studio", label: "צילום", icon: Video },
            { id: "editor", label: "עריכה", icon: Scissors },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? "step" : undefined}
            className={`min-w-0 min-h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold transition-colors ${activeTab === id ? "bg-white/10 text-teal-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
            {id === "editor" && hasRecordedVideo && (
              <Check
                aria-label="סרטון מוכן"
                className="w-3 h-3 text-emerald-300 shrink-0"
              />
            )}
          </button>
        ))}
      </nav>
      <button
        onClick={onOpenSettings}
        title="הגדרות Gemini API"
        aria-label="הגדרות Gemini API"
        className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  </header>
);
