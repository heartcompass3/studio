import React, { useState } from 'react';
import { Ear, Sparkles, Loader, MessageCircle, Shield, Anchor, Wand2 } from 'lucide-react';
import { TranslationResult } from '../../types/studio';
import { translateTeenBehavior } from '../../services/geminiService';

interface BehaviorTranslatorProps {
  onError: (msg: string) => void;
}

export const BehaviorTranslator: React.FC<BehaviorTranslatorProps> = ({ onError }) => {
  const [behavior, setBehavior] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);

  const handleTranslate = async () => {
    if (!behavior.trim()) {
      onError('נא להזין את התנהגות או מילות המתבגר');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await translateTeenBehavior(behavior);
      setResult(res);
    } catch (err: any) {
      onError(err.message || 'שגיאה בתרגום ההתנהגות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-cyan-700 rounded-2xl p-6 shadow-xl text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-black mb-2 flex items-center gap-2">
            <Ear className="w-6 h-6" /> מתורגמן הסערה הפנימית
          </h2>
          <p className="text-emerald-100 text-xs md:text-sm max-w-2xl leading-relaxed">
            המתבגר צועק? טורק דלתות? אומר "אתם לא מבינים כלום"? המערכת מתרגמת את המילים לסערה הפנימית שממנה הוא פועל, ומציעה את התגובה המקרבת שעוצרת את הלופ.
          </p>
        </div>
        <Sparkles className="w-12 h-12 text-emerald-300/40 hidden sm:block" />
      </div>

      {/* Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <label className="block text-xs font-bold text-slate-300">
          מה המתבגר אמר או עשה בפועל?
        </label>
        <textarea
          value={behavior}
          onChange={(e) => setBehavior(e.target.value)}
          placeholder="לדוגמה: הוא חזר מבית ספר, זרק את התיק ואמר 'שונא את כולם, אל תדברו איתי' ונעל את הדלת."
          className="w-full h-28 p-4 bg-slate-800/70 border border-slate-700 rounded-xl text-white text-sm focus:border-emerald-500 outline-none resize-none leading-relaxed placeholder:text-slate-500"
        />
        <button
          onClick={handleTranslate}
          disabled={loading || !behavior.trim()}
          className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          <span>{loading ? 'מתרגם את הסערה...' : 'תרגם שפת מתבגר לעומק רגשי ✨'}</span>
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          
          <div className="bg-blue-950/40 border border-blue-800/60 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-blue-400 mb-1 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> מה הוא באמת מרגיש ורוצה לומר (התרגום הסמוי):
            </h3>
            <p className="text-base font-bold text-slate-100 italic leading-relaxed">
              "{result.hiddenTranslation}"
            </p>
          </div>

          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-rose-400 mb-1 flex items-center gap-2">
              <Shield className="w-4 h-4" /> מפני מה הילד הפנימי שלו מגן עליו כאן?
            </h3>
            <p className="text-xs md:text-sm text-slate-200 leading-relaxed">
              {result.innerFear}
            </p>
          </div>

          <div className="bg-emerald-950/50 border-2 border-emerald-500/80 rounded-2xl p-5 shadow-md">
            <h3 className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-2">
              <Anchor className="w-4 h-4" /> התגובה המקרבת של ההורה (נוכחות בטוחה שמשחררת את הלופ):
            </h3>
            <p className="text-sm md:text-base font-bold text-white leading-relaxed">
              {result.lighthouseResponse}
            </p>
          </div>

        </div>
      )}

    </div>
  );
};
