import React, { useState, useEffect } from 'react';
import { X, Key, Check, Sparkles, ExternalLink, CheckCircle2, AlertCircle, Loader, RefreshCw, Zap } from 'lucide-react';
import { 
  getStoredApiKey, 
  setStoredApiKey, 
  getStoredModel, 
  setStoredModel, 
  getAvailableModelsForApiKey,
  ModelInfo,
  testGeminiApiKey,
  FEATURED_MODELS
} from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [availableGeminiModels, setAvailableGeminiModels] = useState<ModelInfo[]>([]);
  const [isLoadingGeminiModels, setIsLoadingGeminiModels] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const gKey = getStoredApiKey();
      setGeminiKey(gKey);
      setGeminiModel(getStoredModel());
      setSaved(false);
      setGeminiTestResult(null);

      if (gKey) {
        loadGeminiModels(gKey);
      }
    }
  }, [isOpen]);

  const loadGeminiModels = async (key: string, forceRefresh = false) => {
    const cleanKey = key.trim().replace(/^["']|["']$/g, '');
    if (!cleanKey) return;
    setIsLoadingGeminiModels(true);
    try {
      const models = await getAvailableModelsForApiKey(cleanKey, forceRefresh);
      setAvailableGeminiModels(models);
      setGeminiModel((current) =>
        models.some((item) => item.id === current)
          ? current
          : models[0]?.id || current,
      );
    } catch (e) {
      console.warn(e);
    } finally {
      setIsLoadingGeminiModels(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanGKey = geminiKey.trim().replace(/^["']|["']$/g, '');
    setStoredApiKey(cleanGKey);
    setStoredModel(geminiModel);

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleTestGemini = async () => {
    const cleanKey = geminiKey.trim().replace(/^["']|["']$/g, '');
    if (!cleanKey) {
      setGeminiTestResult({ success: false, message: 'נא להזין מפתח Gemini API לפני הבדיקה.' });
      return;
    }
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      setStoredApiKey(cleanKey);
      setStoredModel(geminiModel);
      const models = await getAvailableModelsForApiKey(cleanKey, true);
      setAvailableGeminiModels(models);
      const modelToTest = models.some((item) => item.id === geminiModel)
        ? geminiModel
        : models[0]?.id || geminiModel;
      setGeminiModel(modelToTest);
      setStoredModel(modelToTest);
      const res = await testGeminiApiKey(cleanKey, modelToTest);
      setGeminiTestResult(res);
      if (res.modelUsed) setGeminiModel(res.modelUsed);
    } catch (err: any) {
      setGeminiTestResult({ success: false, message: err.message || 'החיבור נכשל.' });
    } finally {
      setIsTestingGemini(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative text-slate-100">
        
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">הגדרות Google Gemini</h2>
            <p className="text-xs text-slate-400">מפתח אחד ורק מודלי Flash ש-Google מציגה למפתח שלך</p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-blue-800/60 bg-blue-950/30 p-3 text-xs text-blue-200 flex gap-2">
          <Zap className="w-4 h-4 shrink-0 mt-0.5" />
          <span>חיבור OpenAI הוסר. הסטודיו משתמש ב-Gemini בלבד ועובר אוטומטית למודל Flash זמין.</span>
        </div>

        <div className="space-y-5">
          
          {/* Gemini Section - PRIMARY */}
          <div className="p-4 rounded-xl border border-blue-500/40 bg-slate-800/40 shadow-lg shadow-blue-950/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold">⚡ Google Gemini</span>
                <span className="text-xs font-bold text-slate-200">Google AI Studio (חינם)</span>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>השג מפתח חינם ב-Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-mono">Gemini API Key (AIzaSy...):</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    if (e.target.value.length > 20) {
                      loadGeminiModels(e.target.value);
                    }
                  }}
                  placeholder="AIzaSy..."
                  className="w-full p-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white font-mono text-xs focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-slate-300">מודל Gemini פעיל:</label>
                  <button
                    onClick={() => loadGeminiModels(geminiKey, true)}
                    disabled={isLoadingGeminiModels || !geminiKey}
                    className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingGeminiModels ? 'animate-spin' : ''}`} />
                    <span>רענן מודלים</span>
                  </button>
                </div>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:border-blue-500 outline-none"
                >
                  {(availableGeminiModels.length > 0 ? availableGeminiModels : FEATURED_MODELS).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  הרשימה נטענת ישירות מ-Google. דגמי 1.5, 2.0 ו-2.5 אינם מוצגים למפתחות חדשים.
                </p>
              </div>

              <div className="pt-1">
                <button
                  onClick={handleTestGemini}
                  disabled={isTestingGemini || !geminiKey.trim()}
                  className="w-full py-2 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-700/50 text-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  {isTestingGemini ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isTestingGemini ? 'בודק חיבור מול Google...' : 'בדוק חיבור Gemini'}</span>
                </button>

                {geminiTestResult && (
                  <div className={`mt-2 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    geminiTestResult.success ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                  }`}>
                    {geminiTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{geminiTestResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Legacy duplicate kept non-rendered to preserve the surrounding component safely. */}
          <div className="hidden" aria-hidden="true">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold">⚡ Gemini</span>
                <span className="text-xs font-bold text-slate-200">Google Gemini Flash / Pro</span>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>מפתח חינם ב-Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-mono">Gemini API Key (AIzaSy...):</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    if (e.target.value.length > 20) {
                      loadGeminiModels(e.target.value);
                    }
                  }}
                  placeholder="AIzaSy..."
                  className="w-full p-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white font-mono text-xs focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-slate-300">מודל Gemini פעיל:</label>
                  <button
                    onClick={() => loadGeminiModels(geminiKey)}
                    disabled={isLoadingGeminiModels || !geminiKey}
                    className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingGeminiModels ? 'animate-spin' : ''}`} />
                    <span>רענן מודלים</span>
                  </button>
                </div>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:border-blue-500 outline-none"
                >
                  {(availableGeminiModels.length > 0 ? availableGeminiModels : FEATURED_MODELS).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-1">
                <button
                  onClick={handleTestGemini}
                  disabled={isTestingGemini || !geminiKey.trim()}
                  className="w-full py-2 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-700/50 text-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  {isTestingGemini ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isTestingGemini ? 'בודק חיבור מול Google...' : 'בדוק חיבור Gemini'}</span>
                </button>

                {geminiTestResult && (
                  <div className={`mt-2 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    geminiTestResult.success ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                  }`}>
                    {geminiTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{geminiTestResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              💡 אם מודל Flash אחד אינו זמין, המערכת תנסה אוטומטית מודל Flash אחר שהמפתח שלך תומך בו.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
              >
                {saved ? <Check className="w-3.5 h-3.5 text-green-300" /> : null}
                {saved ? 'נשמר בהצלחה!' : 'שמור הגדרות'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
