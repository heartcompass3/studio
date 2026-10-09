import React, { useState } from 'react';
import { Layers, Activity, Loader, Shield, Map } from 'lucide-react';
import { LoopResult, PatternPersona } from '../../types/studio';
import { analyzeLoop, generatePatternPersona } from '../../services/geminiService';

interface LoopMapperProps {
  onError: (msg: string) => void;
}

export const LoopMapper: React.FC<LoopMapperProps> = ({ onError }) => {
  const [situation, setSituation] = useState('');
  const [loading, setLoading] = useState(false);
  const [loopResult, setLoopResult] = useState<LoopResult | null>(null);
  const [persona, setPersona] = useState<PatternPersona | null>(null);

  const handleAnalyze = async () => {
    if (!situation.trim()) {
      onError('נא להזין את תיאור המצב או הפיצוץ');
      return;
    }
    setLoading(true);
    setLoopResult(null);
    setPersona(null);
    try {
      const loop = await analyzeLoop(situation);
      setLoopResult(loop);
      const p = await generatePatternPersona(loop);
      setPersona(p);
    } catch (err: any) {
      onError(err.message || 'שגיאה במיפוי הלופ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div className="bg-gradient-to-r from-purple-700 to-rose-700 rounded-2xl p-6 shadow-xl text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-black mb-2 flex items-center gap-2">
            <Map className="w-6 h-6" /> מיפוי הלופ המשפחתי (שיטת מ.ס.ע)
          </h2>
          <p className="text-purple-100 text-xs md:text-sm max-w-2xl leading-relaxed">
            פירוק הפיצוץ ל-6 מרכיבי הלופ (טריגר, פרשנות, גוף, רגש, תגובה אוטומטית והיגיון ההישרדות) וזיהוי "החלק השומר" של ההורה.
          </p>
        </div>
        <Layers className="w-12 h-12 text-purple-300/40 hidden sm:block" />
      </div>

      {/* Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <label className="block text-xs font-bold text-slate-300">
          תאר את הפיצוץ, העימות או הדינמיקה שחוזרת על עצמה:
        </label>
        <textarea
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="לדוגמה: הילד ענה לי בחוצפה מול כולם, נבהלתי שהוא מזלזל בי והתחלתי להטיף לו שיכבד אותי, ואז הוא יצא בסערה מהבית..."
          className="w-full h-28 p-4 bg-slate-800/70 border border-slate-700 rounded-xl text-white text-sm focus:border-purple-500 outline-none resize-none leading-relaxed placeholder:text-slate-500"
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !situation.trim()}
          className="px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          <span>{loading ? 'ממפה את הלופ...' : 'מפה את הלופ המשפחתי (מ.ס.ע)'}</span>
        </button>
      </div>

      {/* 6 Components Grid */}
      {loopResult && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 block mb-1">1. טריגר עובדתי (האירוע היבש):</span>
              <p className="text-sm font-bold text-white">{loopResult.trigger}</p>
            </div>

            <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-rose-400 block mb-1">2. פרשנות הפחד (מה שהראש מספר):</span>
              <p className="text-sm font-bold text-slate-200">{loopResult.interpretation}</p>
            </div>

            <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-amber-400 block mb-1">3. תחושה גופנית:</span>
              <p className="text-sm font-bold text-slate-200">{loopResult.body}</p>
            </div>

            <div className="bg-red-950/40 border border-red-800/60 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-red-400 block mb-1">4. רגש מציף:</span>
              <p className="text-sm font-bold text-slate-200">{loopResult.emotion}</p>
            </div>

            <div className="bg-purple-950/40 border border-purple-800/60 p-4 rounded-xl md:col-span-2">
              <span className="text-[11px] font-bold text-purple-400 block mb-1">5. תגובה אוטומטית (ניסיון התיקון שהפעיל את הלופ):</span>
              <p className="text-sm font-bold text-slate-100">{loopResult.autoThought}</p>
            </div>

            <div className="bg-indigo-950/50 border-2 border-indigo-500/80 p-5 rounded-xl md:col-span-2 shadow-lg">
              <span className="text-xs font-bold text-indigo-400 block mb-1 flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> 6. היגיון ההישרדות (איך זה קשור לאהבה ופחד?):
              </span>
              <p className="text-sm md:text-base font-bold text-white leading-relaxed">{loopResult.hiddenGain}</p>
            </div>

          </div>

          {/* Pattern Persona Card */}
          {persona && (
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 border border-indigo-700/80 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row items-center gap-6 animate-in zoom-in-95">
              <div className="text-6xl p-4 bg-white/10 rounded-2xl border border-white/10">{persona.icon}</div>
              <div className="flex-1 text-center md:text-right space-y-2">
                <div className="text-xs text-indigo-300 font-mono uppercase tracking-wider">שלב ההפרדה וההכרה</div>
                <h3 className="text-xl font-black text-white">
                  זיהוי החלק השומר: <span className="text-indigo-300">{persona.name}</span>
                </h3>
                <p className="text-xs md:text-sm text-slate-300">{persona.role}</p>
                <div className="bg-black/40 p-3 rounded-xl border border-white/10 text-xs md:text-sm italic text-indigo-200">
                  "{persona.voice}"
                </div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
