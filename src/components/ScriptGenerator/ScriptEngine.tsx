import React, { useState, useEffect } from 'react';
import { 
  Brain, Instagram, Youtube, Sparkles, Loader, 
  Copy, Check, Send, Lightbulb, ChevronDown, 
  ChevronUp, Search, Scissors, Heart, Anchor, Clock, 
  FileText, Wand2, RefreshCw, Layers, Edit3, Share2,
  Bookmark, MessageSquare, ArrowRight, BookOpen,
  Zap, Shield, MessageCircle, Eye, Sparkle
} from 'lucide-react';
import { 
  HOOK_ARCHETYPES, 
  MASTER_NEUROCHEMICAL_HOOKS,
  BENCHMARK_VIRAL_SCRIPT,
  NeuroHookItem,
  generateScriptWithBeats, 
  generateHooksVariations, 
  refineScript, 
  refineScriptBeat,
  transformRawTextToScript,
  generateDeepDive,
  repurposeText,
  fetchAndDeconstructArticle,
  quickTopicResearch,
  generateDiverseInterventions,
  DiverseInterventionOption
} from '../../services/geminiService';
import { getLegacyArchetype, splitLegacyScript } from '../../services/legacyArchetypes';
import { VideoFormat, ScriptBeat } from '../../types/studio';

interface ScriptEngineProps {
  currentScript: string;
  onScriptChange: (text: string) => void;
  onSendToStudio: () => void;
  onError: (msg: string) => void;
}

export const ScriptEngine: React.FC<ScriptEngineProps> = ({
  currentScript,
  onScriptChange,
  onSendToStudio,
  onError
}) => {
  // Input Modes: 'idea' | 'raw_text'
  const [creationMode, setCreationMode] = useState<'idea' | 'raw_text'>('idea');
  const [idea, setIdea] = useState('');
  const [rawText, setRawText] = useState('');
  const [videoType, setVideoType] = useState<VideoFormat>('reel');
  const [hookStyle, setHookStyle] = useState('belief_choice');
  const [inspiration, setInspiration] = useState('');
  const [showInspiration, setShowInspiration] = useState(false);
  const [scientificSource, setScientificSource] = useState('');
  const selectedArchetype = getLegacyArchetype(hookStyle);
  const [scriptStyle, setScriptStyle] = useState<string | undefined>();
  const activeScriptArchetype = getLegacyArchetype(scriptStyle || hookStyle);

  // Beats & Editor View: 'beats' | 'text'
  const [editorViewMode, setEditorViewMode] = useState<'beats' | 'text'>('beats');
  const [beats, setBeats] = useState<ScriptBeat[]>([]);
  const [activeRefiningBeatId, setActiveRefiningBeatId] = useState<string | null>(null);

  // States
  const [loading, setLoading] = useState(false);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [hookOptions, setHookOptions] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [deepDiveResult, setDeepDiveResult] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);

  // Repurpose Social Posts Modal / State
  const [showRepurposeModal, setShowRepurposeModal] = useState(false);
  const [repurposeLoading, setRepurposeLoading] = useState(false);
  const [repurposedPosts, setRepurposedPosts] = useState<string>('');
  const [copiedRepurposed, setCopiedRepurposed] = useState(false);

  // Neurochemical Hooks Modal & Search State
  const [showNeuroHooksModal, setShowNeuroHooksModal] = useState(false);
  const [selectedNeuroCategory, setSelectedNeuroCategory] = useState<string>('all');
  const [neuroSearchTerm, setNeuroSearchTerm] = useState<string>('');
  const [copiedHookId, setCopiedHookId] = useState<number | null>(null);

  // Diverse Solutions & Interventions Modal
  const [showSolutionsModal, setShowSolutionsModal] = useState(false);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsList, setSolutionsList] = useState<DiverseInterventionOption[]>([]);

  // Metrics: 135 words per minute average speaking rate in Hebrew
  const wordCount = currentScript ? currentScript.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((wordCount / 135) * 60);

  // Keep manual/external edits complete and in sync with the modular view.
  useEffect(() => {
    setBeats(previous => previous.map(beat => beat.text).join('\n\n') === currentScript
      ? previous : splitLegacyScript(currentScript));
  }, [currentScript]);

  const handleGenerateHooks = async () => {
    const textToUse = creationMode === 'raw_text' ? rawText : idea;
    if (!textToUse.trim()) {
      onError('נא להזין קודם נושא, רעיון או טקסט מקור');
      return;
    }
    setHooksLoading(true);
    try {
      const hooks = await generateHooksVariations(textToUse, hookStyle, scientificSource);
      setHookOptions(hooks);
    } catch (err: any) {
      onError(err.message || 'שגיאה ביצירת הוקים');
    } finally {
      setHooksLoading(false);
    }
  };

  const handleQuickResearch = async () => {
    if (!idea.trim()) {
      onError('נא להזין קודם נושא או התנהגות למחקר');
      return;
    }
    setResearchLoading(true);
    try {
      const res = await quickTopicResearch(idea);
      if (res.researchSummary || res.neuroMechanism) {
        setInspiration(`זווית תוכן מוצעת (לא מחקר מאומת):\n• ${res.neuroMechanism}\n• ${res.researchSummary}`);
        setShowInspiration(true);
      }
      if (res.suggestedHooks && res.suggestedHooks.length > 0) {
        setHookOptions(res.suggestedHooks);
      }
    } catch (err: any) {
      onError(err.message || 'שגיאה בביצוע מחקר בזק');
    } finally {
      setResearchLoading(false);
    }
  };

  const handleGenerateScript = async (customIdea?: string, selectedStyle = hookStyle, forceIdea = false) => {
    if (creationMode === 'raw_text' && !forceIdea) {
      if (!rawText.trim()) {
        onError('נא להדביק טקסט גולמי / פוסט לשכתוב');
        return;
      }
      setLoading(true);
      setDeepDiveResult(null);
      try {
        const result = await transformRawTextToScript(rawText, videoType, selectedStyle, scientificSource);
        setBeats(result.beats);
        setScriptStyle(selectedStyle);
        onScriptChange(result.fullScript);
        setEditorViewMode('beats');
      } catch (err: any) {
        onError(err.message || 'שגיאה בשכתוב הטקסט לתסריט');
      } finally {
        setLoading(false);
      }
      return;
    }

    const topicToUse = customIdea || idea;
    if (!topicToUse.trim()) {
      onError('נא להזין נושא לתסריט');
      return;
    }
    setLoading(true);
    setDeepDiveResult(null);
    try {
      const result = await generateScriptWithBeats(topicToUse, videoType, selectedStyle, inspiration, scientificSource);
      setBeats(result.beats);
        setScriptStyle(selectedStyle);
      onScriptChange(result.fullScript);
      setEditorViewMode('beats');
    } catch (err: any) {
      onError(err.message || 'שגיאה ביצירת תסריט');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBeatText = (beatId: string, newText: string) => {
    const updated = beats.map(b => b.id === beatId ? { ...b, text: newText } : b);
    setBeats(updated);
    onScriptChange(updated.map(b => b.text).join('\n\n'));
  };

  const handleRefineSingleBeat = async (beatId: string, instruction: string) => {
    setActiveRefiningBeatId(beatId);
    try {
      const updatedBeats = await refineScriptBeat(beats, beatId, instruction, scriptStyle, videoType);
      setBeats(updatedBeats);
      onScriptChange(updatedBeats.map(b => b.text).join('\n\n'));
    } catch (err: any) {
      onError(err.message || 'שגיאה בעדכון המקטע');
    } finally {
      setActiveRefiningBeatId(null);
    }
  };

  const handleRefineGlobal = async (instruction: string) => {
    if (!currentScript) return;
    setLoading(true);
    try {
      const newText = await refineScript(currentScript, instruction, scriptStyle, videoType);
      onScriptChange(newText);
      const paras = newText.split(/\n\n+/).filter(p => p.trim());
      if (paras.length === beats.length) {
        setBeats(prev => prev.map((b, i) => ({ ...b, text: paras[i] || b.text })));
      }
    } catch (err: any) {
      onError(err.message || 'שגיאה בעדכון התסריט');
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDive = async () => {
    if (!currentScript) return;
    setDeepDiveLoading(true);
    try {
      const res = await generateDeepDive(currentScript);
      setDeepDiveResult(res);
    } catch (err: any) {
      onError(err.message || 'שגיאה בניתוח המנגנון');
    } finally {
      setDeepDiveLoading(false);
    }
  };

  const handleRepurposeToPosts = async () => {
    if (!currentScript) return;
    setRepurposeLoading(true);
    setShowRepurposeModal(true);
    try {
      const res = await repurposeText(currentScript, 'facebook');
      setRepurposedPosts(res);
    } catch (err: any) {
      onError(err.message || 'שגיאה במיחזור תוכן לפוסטים');
    } finally {
      setRepurposeLoading(false);
    }
  };

  const handleOpenDiverseSolutions = async () => {
    const context = idea || (beats.length > 0 ? beats[0].text : '') || currentScript || 'הילד מסתגר ולא משתף פעולה';
    setShowSolutionsModal(true);
    setSolutionsLoading(true);
    try {
      const list = await generateDiverseInterventions(context, currentScript);
      setSolutionsList(list);
    } catch (err: any) {
      onError(err.message || 'שגיאה ביצירת מאגר פתרונות מגוון');
    } finally {
      setSolutionsLoading(false);
    }
  };

  const handleApplySolution = (actionText: string) => {
    if (beats.length > 0) {
      const actionIndex = beats.findIndex(b => b.title === activeScriptArchetype.stages[3].title || b.title === 'בחירה שאפשר לבדוק');
      const targetIndex = actionIndex >= 0 ? actionIndex : beats.length - 1;
      const updated = beats.map((b, idx) => idx === targetIndex ? { ...b, text: actionText } : b);
      setBeats(updated);
      onScriptChange(updated.map(b => b.text).join('\n\n'));
    } else {
      onScriptChange(currentScript + '\n\n' + actionText);
    }
    setShowSolutionsModal(false);
  };

  const handleLoadBenchmarkScript = () => {
    setBeats(BENCHMARK_VIRAL_SCRIPT.beats);
    onScriptChange(BENCHMARK_VIRAL_SCRIPT.fullScript);
    setEditorViewMode('beats');
    setHookStyle('neurochemical_retention_mastery');
    setScriptStyle('neurochemical_retention_mastery');
  };

  const handleApplyNeuroHook = (hookItem: NeuroHookItem, mode: 'use_as_idea' | 'replace_hook' | 'copy') => {
    if (mode === 'copy') {
      navigator.clipboard.writeText(hookItem.hook);
      setCopiedHookId(hookItem.id);
      setTimeout(() => setCopiedHookId(null), 2000);
      return;
    }

    if (mode === 'replace_hook') {
      if (beats.length > 0) {
        const updated = beats.map((b, idx) => idx === 0 ? { ...b, text: hookItem.hook } : b);
        setBeats(updated);
        onScriptChange(updated.map(b => b.text).join('\n\n'));
      } else {
        onScriptChange(hookItem.hook);
      }
      setShowNeuroHooksModal(false);
      return;
    }

    if (mode === 'use_as_idea') {
      setCreationMode('idea');
      setIdea(hookItem.hook);
      setHookStyle('neurochemical_retention_mastery');
      setShowNeuroHooksModal(false);
      handleGenerateScript(hookItem.hook, 'neurochemical_retention_mastery', true);
    }
  };

  const copyToClipboard = () => {
    if (!currentScript) return;
    navigator.clipboard.writeText(currentScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Article Link State
  const [inspirationMode, setInspirationMode] = useState<'text' | 'url'>('text');
  const [articleUrl, setArticleUrl] = useState('');
  const [articleLoading, setArticleLoading] = useState(false);

  const handleDeconstructArticle = async () => {
    if (!articleUrl.trim()) {
      onError('נא להזין כתובת URL תקינה');
      return;
    }
    setArticleLoading(true);
    try {
      const deconstructed = await fetchAndDeconstructArticle(articleUrl);
      if (deconstructed.topic) {
        setIdea(deconstructed.topic);
      }
      if (deconstructed.sourceMaterial) {
        setScientificSource(deconstructed.sourceMaterial);
      }
      if (deconstructed.researchSummary) {
        setInspiration(`מקור מחקרי (${articleUrl}):\n${deconstructed.researchSummary}`);
      }
      if (deconstructed.suggestedHooks && deconstructed.suggestedHooks.length > 0) {
        setHookOptions(deconstructed.suggestedHooks);
      }
    } catch (err: any) {
      onError(err.message || 'שגיאה במשיכת המאמר');
    } finally {
      setArticleLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
      
      {/* Left Column: Generator Controls */}
      <div className="space-y-5">
        
        {/* Creation Mode Switcher: Idea vs. Raw Text Rewrite */}
        <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex gap-1.5 shadow-md">
          <button
            onClick={() => setCreationMode('idea')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              creationMode === 'idea'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span>רעיון / משבר חדש</span>
          </button>

          <button
            onClick={() => setCreationMode('raw_text')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              creationMode === 'raw_text'
                ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Edit3 className="w-4 h-4 text-rose-400" />
            <span>שכתוב מטקסט קיים / פוסט ישן</span>
          </button>
        </div>

        {/* Format Selector */}
        <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex gap-2">
          <button
            onClick={() => setVideoType('reel')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              videoType === 'reel'
                ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Instagram className="w-4 h-4" />
            <span>רילס / טיקטוק (עד 3 דק' - סוחף)</span>
          </button>
          <button
            onClick={() => setVideoType('youtube')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              videoType === 'youtube'
                ? 'bg-red-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Youtube className="w-4 h-4" />
            <span>יוטיוב מאסטר-קלאס (עד 30 דק')</span>
          </button>
        </div>

        {/* Neurochemical Quick Arsenal & Benchmark Script */}
        <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-rose-950/80 border border-indigo-800/60 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <button
            onClick={() => setShowNeuroHooksModal(true)}
            className="flex-1 min-w-[200px] py-2.5 px-3 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 text-indigo-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow"
          >
            <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>מאגר פתיחות שמזמינות הקשבה</span>
          </button>

          <button
            onClick={handleLoadBenchmarkScript}
            className="flex-1 min-w-[200px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-600/30 to-amber-600/30 hover:from-rose-600/50 hover:to-amber-600/50 border border-rose-500/50 text-rose-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow"
            title="טען דוגמה לקול המעודכן ולרצף של חמש תחנות"
          >
            <Sparkles className="w-4 h-4 text-rose-400" />
            <span>תסריט לדוגמה: להישאר קרובים</span>
          </button>
        </div>

        {/* Strategic Framework / Archetype Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>ארכיטיפ התסריט — איך הרעיון מתקדם:</span>
            <span className="text-indigo-400 text-[11px]">{HOOK_ARCHETYPES.length} ארכיטיפים</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {HOOK_ARCHETYPES.map((arch) => (
              <button
                key={arch.id}
                onClick={() => { setHookStyle(arch.id); setHookOptions([]); }}
                aria-pressed={hookStyle === arch.id}
                className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                  hookStyle === arch.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold">{arch.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono">
                    {arch.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">{arch.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-xl p-4 space-y-2 text-xs text-slate-300">
          <p className="font-bold text-indigo-200">מצפן הלב — רואים ובוחרים יחד</p>
          <p>הכרה לפני פרשנות. בכל תסריט: הבנה חדשה, צעד קטן והסבר למה ידיעה לבדה אינה תמיד משנה דפוס.</p>
          <p className="font-bold">הרצף: {selectedArchetype.stages.map(stage => stage.title).join(' → ')}</p>
          <p>דוגמת פתיחה: ״{selectedArchetype.openingExample}״</p>
          <p className="text-slate-400">הדוגמה ממחישה את המבנה; התסריט נכתב לפי הנושא שלך.</p>
        </div>

        {/* Input Idea / Topic OR Raw Text for Rewrite */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          
          {creationMode === 'idea' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-300">השאלה, הרעיון או המצב שנרצה להבין:</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleQuickResearch}
                    disabled={researchLoading || !idea.trim()}
                    className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 rounded-lg text-xs flex items-center gap-1 font-bold disabled:opacity-50 transition-all cursor-pointer"
                    title="הצע זווית והבחנה מתוך הנושא; זו חשיבה יצירתית, לא מחקר מאומת"
                  >
                    {researchLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5 text-rose-400" />}
                    <span>הצע זווית תוכן</span>
                  </button>

                  <button
                    onClick={handleGenerateHooks}
                    disabled={hooksLoading || !idea.trim()}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {hooksLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-indigo-400" />}
                    <span>הצע 3 Hooks</span>
                  </button>
                </div>
              </div>

              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="לדוגמה: איך יודעים שהמתבגר מתקשה כשהוא לא משתף? קורה שהורה רוצה לשאול, אבל לא יודע איך לפתוח שיחה..."
                className="w-full h-28 p-4 bg-slate-800/60 border border-slate-700/80 rounded-xl text-white text-sm focus:border-indigo-500 outline-none resize-none leading-relaxed placeholder:text-slate-500"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span>הדבק פוסט ישן, טיוטה או פריקה חופשית לשכתוב:</span>
                </label>
                <button
                  onClick={handleGenerateHooks}
                  disabled={hooksLoading || !rawText.trim()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {hooksLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-indigo-400" />}
                  <span>הצע 3 Hooks מהטקסט</span>
                </button>
              </div>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="הדבק רעיון, פוסט או טקסט שכתבת. הוא יעובד לקול המעודכן לפי רצף הארכיטיפ שבחרת."
                className="w-full h-36 p-4 bg-slate-800/60 border border-slate-700/80 rounded-xl text-white text-sm focus:border-indigo-500 outline-none resize-none leading-relaxed placeholder:text-slate-500"
              />
            </>
          )}

          {/* Hook suggestions list if generated */}
          {hookOptions.length > 0 && (
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-2 animate-in fade-in">
              <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> בחר Hook לפתיחה מיידית:
              </span>
              <div className="space-y-1.5">
                {hookOptions.map((hook, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (creationMode === 'idea') setIdea(hook);
                      handleGenerateScript(hook);
                    }}
                    className="w-full text-right p-2.5 rounded-lg bg-slate-800/80 hover:bg-indigo-900/60 border border-slate-700/60 text-xs text-slate-200 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>"{hook}"</span>
                    <span className="text-[10px] text-indigo-400 shrink-0 font-bold">השתמש בזה ←</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Inspiration accordion (for idea mode) */}
          {creationMode === 'idea' && (
            <div className="border-t border-slate-800 pt-3">
              <button
                onClick={() => setShowInspiration(!showInspiration)}
                className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span>הוסף חומר השראה או ייבא מקור ממאמר</span>
                </span>
                {showInspiration ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showInspiration && (
                <div className="mt-3 space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex bg-slate-800/80 p-1 rounded-lg gap-1 border border-slate-700">
                    <button
                      onClick={() => setInspirationMode('text')}
                      className={`flex-1 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                        inspirationMode === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      טקסט / ציטוט מחקרי
                    </button>
                    <button
                      onClick={() => setInspirationMode('url')}
                      className={`flex-1 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                        inspirationMode === 'url' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🔗 לינק למאמר מאינטרנט
                    </button>
                  </div>

                  {inspirationMode === 'text' ? (
                    <textarea
                      value={inspiration}
                      onChange={(e) => setInspiration(e.target.value)}
                      placeholder="הדבק כאן חומר השראה, תצפית או סיפור אמיתי שניתן להשתמש בו..."
                      className="w-full h-20 p-3 bg-slate-800/40 border border-dashed border-slate-700 rounded-xl text-xs text-slate-300 outline-none resize-none placeholder:text-slate-500"
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={articleUrl}
                          onChange={(e) => setArticleUrl(e.target.value)}
                          placeholder="https://example.com/article..."
                          className="flex-1 p-2.5 bg-slate-800/60 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={handleDeconstructArticle}
                          disabled={articleLoading || !articleUrl.trim()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                          {articleLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                          <span>{articleLoading ? 'מושך ומפרק...' : 'משוך ופרק לתסריט'}</span>
                        </button>
                      </div>
                      {inspiration && (
                        <div className="p-2.5 bg-slate-800/60 border border-slate-700 rounded-lg text-[11px] text-slate-300 max-h-20 overflow-y-auto">
                          {inspiration}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {hookStyle === 'grounded_insight' && (
            <div className="space-y-2 border border-indigo-700/60 bg-indigo-950/30 rounded-xl p-3">
              <label htmlFor="legacy-scientific-source" className="block text-xs font-bold text-indigo-200">מקור לתובנה המדעית</label>
              <p className="text-xs text-slate-400">הוסף שם או קישור למקור וקטע רלוונטי ממנו. ייבוא מאמר מעביר לכאן גם את תוכן המקור. הבחנה שנוצרה ב-AI אינה מקור מחקרי.</p>
              <textarea id="legacy-scientific-source" value={scientificSource} onChange={event => setScientificSource(event.target.value)} rows={5}
                placeholder="שם / קישור למקור, ומה נכתב בו..."
                className="w-full p-3 bg-slate-950/60 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500" />
            </div>
          )}

          <button
            onClick={() => handleGenerateScript()}
            disabled={loading || (creationMode === 'idea' ? !idea.trim() : !rawText.trim())}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            <span>
              {loading 
                ? (creationMode === 'raw_text' ? 'משכתב לתסריט מובנה...' : 'יוצר תסריט 5 תחנות ב-AI...') 
                : (creationMode === 'raw_text' ? 'הפוך לתסריט סטודיו מובנה 🎬' : 'צור תסריט 5 תחנות מלא')}
            </span>
          </button>
        </div>

      </div>

      {/* Right Column: Script Editor (Beats & Full Text View) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-[680px] overflow-hidden shadow-2xl relative">
        
        {/* Header Bar with Metrics & View Switcher */}
        <div className="bg-slate-800/90 px-4 py-2.5 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setEditorViewMode('beats')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  editorViewMode === 'beats' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>תחנות מפתח (Beats)</span>
              </button>
              <button
                onClick={() => setEditorViewMode('text')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  editorViewMode === 'text' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>טקסט מלא</span>
              </button>
            </div>
          </div>

          {currentScript && (
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="flex items-center gap-1 font-mono bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
                <Clock className="w-3 h-3 text-indigo-400" /> ~{estimatedSeconds} שנ'
              </span>
              <span className="text-slate-400 font-mono hidden sm:inline">
                {wordCount} מילים
              </span>
            </div>
          )}
        </div>

        {/* Deep Dive View OR Beats View OR Text View */}
        {deepDiveResult ? (
          <div className="flex-1 p-6 overflow-y-auto bg-slate-900/60 text-slate-200 text-sm leading-relaxed space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-bold text-indigo-400">ניתוח המנגנון הסמוי (M.S.A Breakdown):</span>
              <button
                onClick={() => setDeepDiveResult(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                חזור לתסריט
              </button>
            </div>
            <div className="whitespace-pre-wrap">{deepDiveResult}</div>
          </div>
        ) : editorViewMode === 'beats' && beats.length > 0 ? (
          
          /* Modular Beats List View */
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-950/40">
            {beats.map((beat, idx) => {
              const beatWords = beat.text.trim().split(/\s+/).filter(Boolean).length;
              const beatSec = Math.round((beatWords / 135) * 60);
              const isRefining = activeRefiningBeatId === beat.id;
              const isActionBeat = beat.title === activeScriptArchetype.stages[3].title || beat.title === 'בחירה שאפשר לבדוק' || (idx === beats.length - 1 && beat.title !== 'מה דורש תהליך');

              return (
                <div
                  key={beat.id}
                  className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all shadow-md space-y-2.5"
                >
                  {/* Beat Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-indigo-300">
                      <span>{beat.title}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({beatSec}s ~ {beatWords} מילים)
                      </span>
                    </div>

                    {/* Beat Action Refiners */}
                    <div className="flex items-center gap-1">
                      {isRefining ? (
                        <div className="flex items-center gap-1 text-[11px] text-indigo-400 font-bold">
                          <Loader className="w-3 h-3 animate-spin" />
                          <span>משכתב מקטע...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {isActionBeat && (
                            <button
                              onClick={handleOpenDiverseSolutions}
                              className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              title="הצע ארבע אפשרויות לצעד קטן שנובע מהתובנה בתסריט"
                            >
                              <Lightbulb className="w-2.5 h-2.5 text-amber-400" />
                              <span>גוון פתרון 💡</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleRefineSingleBeat(beat.id, 'קצר, חדד והפוך לקצבי יותר')}
                            title="קצר וחדד מקטע זה בלבד"
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer"
                          >
                            <Scissors className="w-2.5 h-2.5 text-indigo-400" /> קצר
                          </button>
                          <button
                            onClick={() => handleRefineSingleBeat(beat.id, 'הכר ברצון או בקושי לפני פרשנות; החלף קביעה מאשימה בהבחנה אפשרית, בלי לנחם בכוח ובלי להוסיף חזרה על מה שכבר נאמר')}
                            title="הפוך ליותר חומל ומחבר"
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer"
                          >
                            <Heart className="w-2.5 h-2.5 text-rose-400" /> חומל
                          </button>
                          <button
                            onClick={() => handleRefineSingleBeat(beat.id, 'דייק את ההבחנה ואת החיבור למקטע שלפני ואחרי; הוסף הבנה חדשה רק אם היא נובעת מהמקור. אין להמציא סיפור אישי או ניסיון מקצועי')}
                            title="דייק את התובנה ואת הקשר שלה לרצף"
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-0.5 cursor-pointer"
                          >
                            <Anchor className="w-2.5 h-2.5 text-emerald-400" /> דייק תובנה
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Beat Text Area */}
                  <textarea
                    value={beat.text}
                    onChange={(e) => handleUpdateBeatText(beat.id, e.target.value)}
                    rows={Math.max(2, Math.min(5, Math.ceil(beat.text.length / 70)))}
                    className="w-full bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs sm:text-sm text-slate-100 outline-none leading-relaxed resize-none font-sans"
                  />
                </div>
              );
            })}
          </div>

        ) : (
          
          /* Full Continuous Text View */
          <textarea
            value={currentScript}
            onChange={(e) => onScriptChange(e.target.value)}
            placeholder="התסריט שייווצר יופיע כאן... תוכל לערוך אותו, לדייק את הטון או לשלוח ישירות לטלפרומפטר."
            className="flex-1 p-6 bg-transparent text-white text-base leading-relaxed resize-none outline-none font-sans placeholder:text-slate-600"
          />

        )}

        {/* Footer Actions & Refiners */}
        {currentScript && !deepDiveResult && (
          <div className="p-3 bg-slate-800/90 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
            
            {/* Quick Refine Global Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <button
                onClick={handleOpenDiverseSolutions}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-xs font-bold text-amber-300 hover:bg-amber-500/30 flex items-center gap-1 whitespace-nowrap cursor-pointer shadow"
                title="הצע ארבע אפשרויות לצעד קטן שמתאים לנושא"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>מאגר פתרונות 💡</span>
              </button>

              <button
                onClick={() => handleRefineGlobal('תעשה את כל התסריט יותר קצר ומהיר, בלי לחזור על רעיונות')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-indigo-500 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Scissors className="w-3 h-3 text-indigo-400" /> קצר הכל
              </button>
              <button
                onClick={() => handleRefineGlobal('התאם לקול המעודכן: הכרה לפני פרשנות. תקן רצף לא מוסבר וחזרות רעיוניות; שמור על העובדות והמקור ובנה הבנה, פעולה אחת ופער אמיתי בין ידיעה לשינוי.')}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg bg-indigo-950 border border-indigo-700 text-xs text-indigo-200 whitespace-nowrap disabled:opacity-50 cursor-pointer"
              >עדכן קול ורצף</button>
              <button
                onClick={() => handleRefineGlobal('הפוך את כל הטון ליותר חומל, טבעי ובגובה העיניים')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-indigo-500 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Heart className="w-3 h-3 text-rose-400" /> חומל וטבעי
              </button>
              <button
                onClick={handleDeepDive}
                disabled={deepDiveLoading}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-indigo-500 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                {deepDiveLoading ? <Loader className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3 text-amber-400" />}
                <span>נתח מנגנון</span>
              </button>
              <button
                onClick={handleRepurposeToPosts}
                disabled={repurposeLoading}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-900 to-rose-900 border border-indigo-700/70 text-xs text-indigo-200 hover:text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
                title="צור פוסטים כתובים לפייסבוק ואינסטגרם מתוך התסריט"
              >
                {repurposeLoading ? <Loader className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3 text-rose-400" />}
                <span>המר לפוסטים 📲</span>
              </button>
            </div>

            {/* Transfer to Studio & Copy */}
            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                title="העתק תסריט מלא ללוח"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={onSendToStudio}
                className="px-4 py-2 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <span>שלח לאולפן</span>
                <Send className="w-3.5 h-3.5 transform -rotate-45" />
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Diverse Interventions & Solutions Modal */}
      {showSolutionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-white text-base">
                  <Lightbulb className="w-5 h-5 text-amber-400" />
                  <span>מאגר פתרונות מגוון (4 אפיקי התערבות שונים)</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  לא כל בעיה פותרים באותה אמירה. בחר את דרך הפעולה שהכי מתאימה לסיטואציה:
                </p>
              </div>
              <button
                onClick={() => setShowSolutionsModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                סגור
              </button>
            </div>

            {solutionsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 space-y-3">
                <Loader className="w-8 h-8 animate-spin text-amber-400" />
                <p className="text-sm font-bold">מנתח ומייצר 4 דרכי התערבות ייחודיות מתוך השיטה והרשת...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {solutionsList.map((sol) => (
                  <div
                    key={sol.id}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/60 transition-all space-y-2.5 shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {sol.badge}
                        </span>
                        <span className="text-sm font-bold text-white">{sol.title}</span>
                      </div>
                      <button
                        onClick={() => handleApplySolution(sol.actionText)}
                        className="px-3 py-1 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow cursor-pointer"
                      >
                        <span>השתמש בפתרון זה ↵</span>
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                      "{sol.actionText}"
                    </p>

                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span className="font-bold text-amber-400">💡 למה זה עובד:</span>
                      <span>{sol.reasoning}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Repurpose Posts Modal */}
      {showRepurposeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Share2 className="w-5 h-5 text-rose-400" />
                <span>פוסטים כתובים לסושיאל מתוך התסריט</span>
              </div>
              <button
                onClick={() => setShowRepurposeModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                סגור
              </button>
            </div>

            {repurposeLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 space-y-3">
                <Loader className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-sm font-bold">מייצר 3 פוסטים ויראליים לפייסבוק ולאינסטגרם...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-96 overflow-y-auto p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                  {repurposedPosts || 'לא נוצרו פוסטים.'}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(repurposedPosts);
                      setCopiedRepurposed(true);
                      setTimeout(() => setCopiedRepurposed(false), 2000);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    {copiedRepurposed ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedRepurposed ? 'הועתק ללוח!' : 'העתק את כל הפוסטים'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10 Neurochemical Hooks Modal */}
      {showNeuroHooksModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-white text-base">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <span>פתיחות שמזמינות הקשבה — הכרה, סקרנות ובחירה</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  בחר פתיחה מתוך מצב או שאלה שהקהל מכיר. אפשר להעתיק, להחליף או ליצור ממנה תסריט:
                </p>
              </div>
              <button
                onClick={() => setShowNeuroHooksModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                סגור
              </button>
            </div>

            {/* Filter & Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  value={neuroSearchTerm}
                  onChange={(e) => setNeuroSearchTerm(e.target.value)}
                  placeholder="חיפוש לפי נושא (שקרים, מסכים, כעס, בית ספר...)"
                  className="w-full pl-3 pr-9 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {['all', ...new Set(MASTER_NEUROCHEMICAL_HOOKS.map(item => item.category))].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedNeuroCategory(cat)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      selectedNeuroCategory === cat
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat === 'all' ? `הכל (${MASTER_NEUROCHEMICAL_HOOKS.length})` : cat.replace('על ', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Hooks List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {MASTER_NEUROCHEMICAL_HOOKS
                .filter(item => {
                  const matchesCat = selectedNeuroCategory === 'all' || item.category.includes(selectedNeuroCategory) || selectedNeuroCategory.includes(item.category);
                  const matchesSearch = !neuroSearchTerm.trim() || 
                    item.hook.includes(neuroSearchTerm) || 
                    item.category.includes(neuroSearchTerm) || 
                    item.analysis.includes(neuroSearchTerm);
                  return matchesCat && matchesSearch;
                })
                .map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/60 transition-all space-y-3 shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-700/60">
                          {item.category}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {item.neuroTrigger}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleApplyNeuroHook(item, 'copy')}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                        >
                          {copiedHookId === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedHookId === item.id ? 'הועתק!' : 'העתק'}</span>
                        </button>

                        <button
                          onClick={() => handleApplyNeuroHook(item, 'replace_hook')}
                          className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="החלף את ההוק של התסריט הקיים בהוק זה"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                          <span>החלף הוק בתסריט</span>
                        </button>

                        <button
                          onClick={() => handleApplyNeuroHook(item, 'use_as_idea')}
                          className="px-3 py-1 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow transition-all cursor-pointer"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>צור תסריט מהוק זה 🚀</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-sm font-bold text-amber-200 leading-relaxed">
                      "{item.hook}"
                    </div>

                    <div className="text-xs text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-850 space-y-1">
                      <div className="font-semibold text-indigo-300 flex items-center gap-1">
                        <span>🧠 הפירוק הפסיכולוגי של מ.ס.ע:</span>
                      </div>
                      <p className="leading-relaxed">{item.analysis}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
