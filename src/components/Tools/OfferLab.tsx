import React, { useState } from 'react';
import { Target, TrendingUp, Zap, Loader, AlertCircle, Heart, Anchor, RefreshCw, Brain, Copy, Check } from 'lucide-react';
import { HormoziOfferResult } from '../../types/studio';
import { analyzeHormoziOffer } from '../../services/geminiService';

interface OfferLabProps {
  onUsePitchAsIdea: (pitch: string) => void;
  onError: (msg: string) => void;
}

export const OfferLab: React.FC<OfferLabProps> = ({ onUsePitchAsIdea, onError }) => {
  const [crisisInput, setCrisisInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HormoziOfferResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    if (!crisisInput.trim()) {
      onError('נא להזין את המשבר הקריטי');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await analyzeHormoziOffer(crisisInput);
      setResult(res);
    } catch (err: any) {
      onError(err.message || 'שגיאה בניתוח ההצעה');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPitch = () => {
    if (!result?.thePitch) return;
    navigator.clipboard.writeText(result.thePitch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 rounded-2xl p-6 shadow-xl text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-black mb-2 flex items-center gap-2">
            <Target className="w-6 h-6" /> מעבדת "הצעת הזהב" (Hormozi Value Equation)
          </h2>
          <p className="text-amber-100 text-xs md:text-sm max-w-2xl leading-relaxed">
            הפיכת הפתרון שלך מ"מותרות" ל"הכרח קריטי" (Bleeding Neck) עבור ההורים. המערכת מפרקת את הכאב החריף, תוצאת החלום ומיצוב ההצעה המנצחת.
          </p>
        </div>
        <TrendingUp className="w-12 h-12 text-amber-300/40 hidden sm:block" />
      </div>

      {/* Input Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <label className="block text-xs font-bold text-slate-300">
          מה המשבר הקריטי או הדימום בצוואר שההורה חווה כרגע?
        </label>
        <textarea
          value={crisisInput}
          onChange={(e) => setCrisisInput(e.target.value)}
          placeholder="לדוגמה: הילד מוחרם ומתבודד, ואני רץ לחפש לו חוגים ומסגרות לפתור את הבעיה בחוץ, אבל הפחד האמיתי שלי הוא איזו זהות פגועה הוא בונה..."
          className="w-full h-28 p-4 bg-slate-800/70 border border-slate-700 rounded-xl text-white text-sm focus:border-amber-500 outline-none resize-none leading-relaxed placeholder:text-slate-500"
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !crisisInput.trim()}
          className="px-6 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          <span>{loading ? 'מפצח את משוואת הערך...' : 'פצח את משוואת הערך (Hormozi)'}</span>
        </button>
      </div>

      {/* Results View */}
      {result && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Bleeding Neck */}
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-rose-400 mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> 1. הכאב הקריטי (Bleeding Neck)
              </h3>
              <p className="text-xs md:text-sm text-slate-200 leading-relaxed">{result.bleedingNeck}</p>
            </div>

            {/* Dream Outcome */}
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                <Heart className="w-4 h-4" /> 2. החלום האמיתי (Dream Outcome)
              </h3>
              <p className="text-xs md:text-sm text-slate-200 leading-relaxed">{result.dreamOutcome}</p>
            </div>

            {/* Perceived Likelihood */}
            <div className="bg-blue-950/40 border border-blue-800/60 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1.5">
                <Anchor className="w-4 h-4" /> 3. ביטחון בהצלחה (Perceived Likelihood)
              </h3>
              <p className="text-xs md:text-sm text-slate-200 leading-relaxed">{result.perceivedLikelihood}</p>
            </div>

            {/* Time & Effort */}
            <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-purple-400 mb-2 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> 4. מינימום מאמץ וחיכוך (Time & Effort)
              </h3>
              <p className="text-xs md:text-sm text-slate-200 leading-relaxed">{result.timeAndEffort}</p>
            </div>

          </div>

          {/* Golden Pitch */}
          <div className="bg-amber-950/50 border-2 border-amber-500/80 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <Target className="w-4 h-4" /> הצעת הזהב המדויקת (The Pitch)
              </h3>
              <button
                onClick={handleCopyPitch}
                className="text-xs text-amber-300 hover:text-white flex items-center gap-1 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'הועתק!' : 'העתק'}</span>
              </button>
            </div>
            
            <p className="text-base md:text-lg font-bold text-white leading-relaxed italic">
              "{result.thePitch}"
            </p>

            <button
              onClick={() => onUsePitchAsIdea(result.thePitch)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>השתמש כרעיון לתסריט וידאו ←</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
