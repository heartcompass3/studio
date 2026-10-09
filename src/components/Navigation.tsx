import React from "react";
import {
  Brain,
  Target,
  Smartphone,
  Ear,
  Layers,
  MessageSquare,
  Video,
  Settings,
  Sparkles,
} from "lucide-react";
import { ActiveTab } from "../types/studio";

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  hasRecordedVideo: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  hasRecordedVideo,
}) => {
  const navItems: {
    id: ActiveTab;
    label: string;
    icon: any;
    color: string;
    badge?: string;
  }[] = [
    {
      id: "creative-v2",
      label: "קריאייטיב V2",
      icon: Sparkles,
      color: "text-teal-300",
    },
    {
      id: "editor-v2",
      label: "בימוי ועריכה V2",
      icon: Layers,
      color: "text-teal-300",
    },
    {
      id: "brain",
      label: "סקריפטים ו-Hooks",
      icon: Brain,
      color: "text-indigo-400",
    },
    {
      id: "studio",
      label: "אולפן הקלטות",
      icon: Video,
      color: "text-rose-400",
    },
    { id: "editor", label: "עורך מקורי", icon: Video, color: "text-slate-400" },
    {
      id: "offer",
      label: "הצעת זהב (Hormozi)",
      icon: Target,
      color: "text-amber-400",
    },
    {
      id: "sms",
      label: "הודעות חיבור",
      icon: Smartphone,
      color: "text-green-400",
    },
    {
      id: "translator",
      label: "מתורגמן הסערה",
      icon: Ear,
      color: "text-emerald-400",
    },
    {
      id: "loop",
      label: "מיפוי לופ מ.ס.ע",
      icon: Layers,
      color: "text-purple-400",
    },
    {
      id: "coach",
      label: "חדר טיפולים & סימולטור",
      icon: MessageSquare,
      color: "text-teal-400",
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-[1560px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              מצפן הלב{" "}
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-normal">
                Studio V2
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              קריאייטיב, צילום ובימוי של מצפן הלב
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 order-3 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${isActive ? "text-white" : item.color}`}
                />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white animate-pulse font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Settings button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            title="הגדרות Gemini API"
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700/60"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
