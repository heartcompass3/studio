import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, Swords, Send, User, Anchor, Sparkles, 
  Loader, AlertCircle, Wand2 
} from 'lucide-react';
import { ChatMessage } from '../../types/studio';
import { sendCoachMessage } from '../../services/geminiService';

interface CoachRoomProps {
  onConvertToScriptIdea: (text: string) => void;
  onError: (msg: string) => void;
}

export const CoachRoom: React.FC<CoachRoomProps> = ({ onConvertToScriptIdea, onError }) => {
  const [mode, setMode] = useState<'therapist' | 'teen'>('therapist');
  const [phase, setPhase] = useState<'mapping' | 'elimination' | 'independence'>('mapping');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const defaultTherapistMsg = 'אהלן. אני כאן איתך. בוא נניח רגע לתיאוריות בצד. מתי בפעם האחרונה אמרת לעצמך "אני כבר לא יודע איך לעזור לילד שלי"?';
  const defaultTeenMsg = 'אוף, מה אתם רוצים ממני עכשיו? עזבו אותי בשקט כבר... (אני משחק את המתבגר שלך. נסה להגיב אליי עכשיו מתוך נוכחות בטוחה, בלי לתקן אותי)';

  const [history, setHistory] = useState<ChatMessage[]>([
    { role: 'model', text: defaultTherapistMsg }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  const handleModeChange = (newMode: 'therapist' | 'teen') => {
    setMode(newMode);
    setHistory([{ role: 'model', text: newMode === 'therapist' ? defaultTherapistMsg : defaultTeenMsg }]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', text: input };
    const newHist = [...history, userMsg];
    setHistory(newHist);
    setInput('');
    setLoading(true);

    try {
      const reply = await sendCoachMessage(newHist, mode, phase);
      setHistory([...newHist, { role: 'model', text: reply }]);
    } catch (err: any) {
      onError(err.message || 'שגיאה בתקשורת עם ה-AI');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-300">
      
      {/* Top Header & Mode Switcher */}
      <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Modes Toggle */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
          <button
            onClick={() => handleModeChange('therapist')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              mode === 'therapist'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" /> מאמן אישי (מ.ס.ע)
          </button>
          <button
            onClick={() => handleModeChange('teen')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              mode === 'teen'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Swords className="w-4 h-4" /> סימולטור מתבגר בסערה ✨
          </button>
        </div>

        {/* Phase Buttons for Therapist mode */}
        {mode === 'therapist' && (
          <div className="flex bg-slate-900/60 p-1 rounded-lg gap-1">
            <button
              onClick={() => setPhase('mapping')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                phase === 'mapping' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1. מיפוי הסערה
            </button>
            <button
              onClick={() => setPhase('elimination')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                phase === 'elimination' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2. זיהוי הצורך
            </button>
            <button
              onClick={() => setPhase('independence')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                phase === 'independence' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3. נוכחות בטוחה
            </button>
          </div>
        )}
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-950/60 custom-scrollbar">
        {history.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md ${
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : mode === 'therapist'
                    ? 'bg-teal-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : mode === 'therapist' ? <Anchor className="w-4 h-4" /> : <Swords className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[80%] p-4 rounded-2xl text-xs md:text-sm leading-relaxed whitespace-pre-wrap shadow-lg ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tl-none'
                    : 'bg-slate-800 text-slate-100 border border-slate-700/80 rounded-tr-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse">
            <Loader className="w-3.5 h-3.5 animate-spin text-teal-400" />
            <span>מקליד תגובה...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={
            mode === 'therapist'
              ? 'תאר מה קרה בבית, מה הרגשת או מה הפחיד אותך...'
              : "דבר אל המתבגר (לדוגמה: 'אני רואה שקשה לך, אני פה לידך')..."
          }
          className="flex-1 p-3.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:border-teal-500 outline-none placeholder:text-slate-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className={`p-3.5 rounded-xl text-white shadow-lg transition-colors ${
            mode === 'therapist' ? 'bg-teal-600 hover:bg-teal-500' : 'bg-rose-600 hover:bg-rose-500'
          } disabled:opacity-50`}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
