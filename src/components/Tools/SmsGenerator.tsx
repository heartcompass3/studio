import React, { useState } from 'react';
import { Smartphone, Sparkles, Loader, Copy, Check, Wand2 } from 'lucide-react';
import { SmsResults } from '../../types/studio';
import { generateSmsOptions } from '../../services/geminiService';

interface SmsGeneratorProps {
  onError: (msg: string) => void;
}

export const SmsGenerator: React.FC<SmsGeneratorProps> = ({ onError }) => {
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SmsResults | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!context.trim()) {
      onError('נא להזין את פרטי הפיצוץ או הנתק');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const res = await generateSmsOptions(context);
      setResults(res);
    } catch (err: any) {
      onError(err.message || 'שגיאה בניסוח הודעות');
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 shadow-xl text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-black mb-2 flex items-center gap-2">
            <Smartphone className="w-6 h-6" /> מחולל הודעות חיבור מחדש (WhatsApp)
          </h2>
          <p className="text-emerald-100 text-xs md:text-sm max-w-2xl leading-relaxed">
            היה לכם פיצוץ בבית? הילד סגר את הדלת ולא מדבר? ה-AI ינסח 3 הודעות מקרבות לפי עקרונות נוכחות בטוחה, 0 הטפה ו-0 אשמה.
          </p>
        </div>
        <Sparkles className="w-12 h-12 text-emerald-300/40 hidden sm:block" />
      </div>

      {/* Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <label className="block text-xs font-bold text-slate-300">
          מה קרה? על מה רבתם או מה גורם למרחק כרגע?
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="לדוגמה: הוא שוב לא קם לבית ספר, בלחץ צעקתי עליו שהוא מזלזל בעתיד שלו והוא טרק לי את הדלת בפנים..."
          className="w-full h-28 p-4 bg-slate-800/70 border border-slate-700 rounded-xl text-white text-sm focus:border-emerald-500 outline-none resize-none leading-relaxed placeholder:text-slate-500"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !context.trim()}
          className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          <span>{loading ? 'מנסח הודעות...' : 'נסח 3 הודעות חיבור עכשיו ✨'}</span>
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <h3 className="text-xs font-bold text-slate-400 text-center">בחר את ההודעה שהכי מדויקת עבורך:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[results.option1, results.option2, results.option3].map((opt, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                <div className="space-y-3">
                  <span className="text-xs font-bold text-emerald-400 block pb-2 border-b border-slate-800">
                    {opt.title}
                  </span>
                  <div className="bg-emerald-950/40 border border-emerald-900/60 p-4 rounded-xl text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                    "{opt.text}"
                  </div>
                </div>

                <button
                  onClick={() => copyText(opt.text, idx)}
                  className="mt-4 w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedIdx === idx ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedIdx === idx ? 'הועתק ל-WhatsApp!' : 'העתק להודעה'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
