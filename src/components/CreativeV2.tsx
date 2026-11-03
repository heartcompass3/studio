import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  Check,
  Loader,
  Clipboard,
  FileText,
  Trash2,
  Send,
  Wand2,
} from "lucide-react";
import {
  archetypes,
  voiceSources,
  contentVoices,
  getContentVoice,
  productionStyles,
  CreativeBrief,
  CreativePack,
  generateCreative,
  generateLineAlternatives,
  getAvailableArchetypes,
  getSpokenScript,
  getTargetWordRange,
  describeArchetypeStructure,
  countWords,
  RewriteAlternative,
  samplePack,
  validatePack,
  PROMPT_VERSION,
} from "../v2/creative";
import { downloadBlob } from "../v2/project";
import "./studio-v2.css";
export function CreativeV2({
  onUseScript,
  onError,
  onUseCover,
  currentScript,
  onScriptChange,
}: {
  onUseScript: (script: string, coverTitle?: string) => void;
  onError: (s: string) => void;
  onUseCover: (title: string) => void;
  currentScript?: string;
  onScriptChange?: (script: string) => void;
}) {
  const [inputMode, setInputMode] = useState<"ai" | "paste">("ai");
  const [pastedScript, setPastedScript] = useState<string>(currentScript || "");

  useEffect(() => {
    if (currentScript && !pastedScript) {
      setPastedScript(currentScript);
    }
  }, [currentScript]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPastedScript(text);
        if (onScriptChange) onScriptChange(text);
      } else {
        onError("לוח ההעתקה ריק");
      }
    } catch {
      onError("לא ניתן לגשת ללוח ההעתקה בדפדפן. הדבק ישירות לתוך תיבת הטקסט");
    }
  };

  const handleUsePastedScript = () => {
    if (!pastedScript.trim()) {
      onError("אנא הדבק או הקלד תסריט לפני השליחה לאולפן");
      return;
    }
    if (onScriptChange) onScriptChange(pastedScript);
    const firstLine = pastedScript.trim().split("\n")[0].slice(0, 35);
    onUseScript(pastedScript, firstLine);
  };

  const handleUpgradePastedWithAI = () => {
    if (!pastedScript.trim()) {
      onError("אנא הדבק תסריט לשדרוג");
      return;
    }
    setBrief((prev) => ({
      ...prev,
      topic: pastedScript,
    }));
    setInputMode("ai");
  };

  const pastedWordCount = pastedScript.trim().split(/\s+/).filter(Boolean).length;
  const pastedEstSeconds = Math.round(pastedWordCount / 2.25);
  const [brief, setBrief] = useState<CreativeBrief>({
    topic: "",
    audience: "הורים למתבגרים",
    duration: 60,
    format: "reel",
    archetype: "belief_choice",
    intensity: "חד ומסקרן",
    voiceSource: "brand_insight",
    productionStyle: "direct",
    contentVoice: "heartcompass",
  });
  const [pack, setPack] = useState<CreativePack | null>(null);
  const [chosen, setChosen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"beats" | "full">("beats");
  const [fullScriptOverride, setFullScriptOverride] = useState<string | null>(null);
  const [rewriteResult, setRewriteResult] = useState<{
    key: string;
    items: RewriteAlternative[];
  } | null>(null);
  const [rewritingKey, setRewritingKey] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("studio-v2-creative");
      if (raw) {
        const p = JSON.parse(raw);
        const restoredFormat = p.brief?.format || "reel";
        const restoredArchetypes = getAvailableArchetypes(restoredFormat);
        const restoredArchetype = restoredArchetypes.some((item) => item.id === p.brief?.archetype)
          ? p.brief.archetype
          : restoredArchetypes[0]?.id || "contradiction";
        setBrief({
          ...p.brief,
          format: restoredFormat,
          archetype: restoredArchetype,
          voiceSource: p.brief?.voiceSource || "brand_insight",
          productionStyle: p.brief?.productionStyle || "direct",
          contentVoice: getContentVoice(p.brief?.contentVoice).id,
        });
        setPack(validatePack(p.pack));
        setChosen(Number.isInteger(p.chosen) ? Math.max(0, Math.min(2, p.chosen)) : 0);
        setDemo(!!p.demo);
        setViewMode(p.viewMode === "full" ? "full" : "beats");
        setFullScriptOverride(typeof p.fullScriptOverride === "string" ? p.fullScriptOverride : null);
      }
    } catch {}
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (pack)
      try {
        localStorage.setItem(
          "studio-v2-creative",
          JSON.stringify({ brief, pack, chosen, demo, viewMode, fullScriptOverride, version: PROMPT_VERSION }),
        );
      } catch {}
  }, [pack, brief, chosen, demo, viewMode, fullScriptOverride]);
  const generatedScript = pack ? getSpokenScript(pack, chosen) : "";
  const script = fullScriptOverride ?? generatedScript;
  const count = countWords(script);
  const format = brief.format || "reel";
  const isFixedParentFear = format === "reel" && brief.archetype === "parent_fear_60";
  const durationOptions = isFixedParentFear
    ? [60]
    : format === "reel"
    ? [30, 60, 90]
    : format === "youtube"
      ? [480, 720, 1200]
      : [1200, 1800, 2700];
  const availableArchetypes = getAvailableArchetypes(format);
  const selectedArchetype = archetypes.find((item) => item.id === brief.archetype) || availableArchetypes[0];
  const currentTarget = getTargetWordRange(format, brief.duration);
  const generatedMeta = pack?.meta;
  const isStale = !!pack && !demo && (
    !generatedMeta ||
    generatedMeta.format !== format ||
    generatedMeta.duration !== brief.duration ||
    generatedMeta.archetype !== brief.archetype ||
    (generatedMeta.voiceSource || "brand_insight") !== (brief.voiceSource || "brand_insight") ||
    (generatedMeta.productionStyle || "direct") !== (brief.productionStyle || "direct") ||
    (generatedMeta.contentVoice || "heartcompass") !== (brief.contentVoice || "heartcompass")
  );
  const generatedRate = generatedMeta
    ? ((generatedMeta.targetWordsMin + generatedMeta.targetWordsMax) / 2) / generatedMeta.duration
    : 1.7;
  const estimatedSeconds = Math.round(count / generatedRate);
  const lengthState = !generatedMeta
    ? "unknown"
    : count < generatedMeta.targetWordsMin
      ? "short"
      : count > generatedMeta.targetWordsMax
        ? "long"
        : "good";
  const generate = async () => {
    if (!brief.topic.trim()) {
      onError("תאר רגע, התנהגות או מסר שרוצים לצלם");
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      setPack(await generateCreative(brief, controller.signal));
      setChosen(0);
      setDemo(false);
      setFullScriptOverride(null);
      setRewriteResult(null);
    } catch (e) {
      onError(
        e instanceof DOMException && e.name === "AbortError"
          ? "היצירה נעצרה. הטיוטה הקודמת נשמרת."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };
  const editBeat = (i: number, text: string) => {
    setFullScriptOverride(null);
    setPack((p) =>
      p
        ? { ...p, beats: p.beats.map((b, j) => (j === i ? { ...b, text } : b)) }
        : p,
    );
  };
  const requestAlternatives = async (key: string, text: string) => {
    if (!text.trim()) return;
    setRewritingKey(key);
    setRewriteResult(null);
    try {
      const items = await generateLineAlternatives(text, script, pack?.meta?.format || format, pack?.meta?.contentVoice || "heartcompass");
      if (!items.length) throw new Error("לא התקבלו ניסוחים חלופיים");
      setRewriteResult({ key, items });
    } catch (error) {
      onError(error instanceof Error ? error.message : "יצירת הניסוחים נכשלה");
    } finally {
      setRewritingKey(null);
    }
  };
  const applyAlternative = (key: string, text: string) => {
    setFullScriptOverride(null);
    if (key === "hook" && pack) {
      setPack({
        ...pack,
        hooks: pack.hooks.map((hook, index) =>
          index === chosen ? { ...hook, spoken: text } : hook,
        ),
      });
    } else if (key.startsWith("beat-")) {
      editBeat(Number(key.replace("beat-", "")), text);
    }
    setRewriteResult(null);
  };
  const renderRewriteControls = (key: string, text: string) => (
    <div className="sv-rewrite-tools">
      <button
        className="sv-button sv-rewrite-button"
        disabled={rewritingKey !== null}
        onClick={() => requestAlternatives(key, text)}
      >
        {rewritingKey === key ? <Loader className="animate-spin" size={14} /> : <Sparkles size={14} />}
        {rewritingKey === key ? "מנסח…" : "הצע 3 ניסוחים"}
      </button>
      {rewriteResult?.key === key && (
        <div className="sv-rewrite-options">
          {rewriteResult.items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              onClick={() => applyAlternative(key, item.text)}
            >
              <strong>{item.label}</strong>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="sv-root sv-creative" dir="rtl">
      <div className="sv-heading">
        <div>
          <div className="sv-eyebrow">
            מצפן הלב / SCRIPT & HOOK MASTER <span>ויראלי</span>
          </div>
          <h1>מחולל תסריטים והוקים ויראליים</h1>
          <p>הנדסה הפוכה של רובינס, גודין, רון וטרייסי בשילוב שיטת מ.ס.ע — אפס קלישאות בוטים.</p>
        </div>
        <button
          className="sv-button"
          disabled={loading}
          onClick={() => {
            setPack(samplePack);
            setChosen(0);
            setDemo(true);
            setBrief({ ...brief, format: "reel", duration: 60, archetype: "contradiction" });
            setFullScriptOverride(null);
          }}
        >
          פתח תסריט לדוגמה
        </button>
      </div>
      {/* Mode Switcher: AI Generator vs Direct Script Paste */}
      <div className="flex items-center gap-2 mb-4 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 w-fit">
        <button
          onClick={() => setInputMode("ai")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            inputMode === "ai"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Sparkles size={15} />
          <span>מחולל AI (הוקים ופעימות)</span>
        </button>
        <button
          onClick={() => setInputMode("paste")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            inputMode === "paste"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Clipboard size={15} />
          <span>הדבקת תסריט קיים</span>
          {pastedScript.trim() && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>

      <div className="sv-creative-grid">
        {inputMode === "paste" ? (
          <section className="sv-panel sv-brief">
            <div className="sv-panel-title">
              <Clipboard size={17} />
              הדבקת תסריט קיים לצילום
            </div>
            <p className="sv-hint mb-3">
              יש לך כבר תסריט מוכן? הדבק אותו כאן, צפה בזמן הדיבור המשוער ושלח אותו ישירות לטלפרומפטר באולפן ההקלטות.
            </p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">טקסט התסריט</span>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="sv-button sv-rewrite-button text-xs text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                <Clipboard size={14} />
                <span>הדבק מהלוח</span>
              </button>
            </div>
            <label className="sv-field">
              <textarea
                aria-label="טקסט התסריט"
                rows={10}
                value={pastedScript}
                placeholder="הדבק כאן את התסריט שכתבת (מוורד, גוגל דוקס, וואטסאפ או פתקים)..."
                onChange={(e) => {
                  setPastedScript(e.target.value);
                  if (onScriptChange) onScriptChange(e.target.value);
                }}
                className="w-full font-sans text-sm leading-relaxed"
              />
            </label>
            <div className="p-3 my-3 rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-300">
                📊 {pastedWordCount} מילים
              </span>
              <span className="font-bold text-indigo-400">
                ⏱️ כ־{pastedEstSeconds} שניות דיבור
              </span>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <button
                className="sv-primary sv-wide flex items-center justify-center gap-2"
                onClick={handleUsePastedScript}
                disabled={!pastedScript.trim()}
              >
                <Send size={16} />
                <span>🚀 שלח ישירות לאולפן ההקלטות (לטלפרומפטר)</span>
              </button>
              <div className="flex items-center gap-2 mt-1">
                <button
                  className="sv-button flex-1"
                  onClick={handleUpgradePastedWithAI}
                  disabled={!pastedScript.trim()}
                >
                  <Wand2 size={14} />
                  <span>שדרג ל־3 הוקים עם AI</span>
                </button>
                {pastedScript.trim() && (
                  <button
                    className="sv-button text-rose-400 hover:text-rose-300"
                    onClick={() => {
                      setPastedScript("");
                      if (onScriptChange) onScriptChange("");
                    }}
                  >
                    <Trash2 size={14} />
                    <span>נקה</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : (
        <section className="sv-panel sv-brief">
          <div className="sv-panel-title">
            <Clapperboard size={17} />
            מה הסיפור?
          </div>
          <label className="sv-field">
            הרגע או המסר
            <textarea
              aria-label="הרגע או המסר"
              value={brief.topic}
              rows={4}
              maxLength={4000}
              placeholder="איזו אמונה או הבחנה רוצים לפתוח? למשל: התרגלנו לומר ״ככה אני״, עד ששכחנו לבדוק איפה עדיין יש לנו בחירה. למי מדברים ומה הוא יוכל לבדוק כבר היום?"
              onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
            />
          </label>
          <div className="sv-row">
            <label className="sv-field">
              פורמט
              <select
                aria-label="פורמט התוכן"
                value={format}
                onChange={(e) => {
                  const nextFormat = e.target.value as CreativeBrief["format"];
                  setBrief({
                    ...brief,
                    format: nextFormat,
                    duration: nextFormat === "reel" ? 60 : nextFormat === "youtube" ? 720 : 1800,
                    archetype: "belief_choice",
                  });
                }}
              >
                <option value="reel">ריל / שורט</option>
                <option value="youtube">יוטיוב</option>
                <option value="podcast">פודקאסט</option>
              </select>
            </label>
            <label className="sv-field">
              למי מדברים?
              <input
                value={brief.audience}
                maxLength={150}
                onChange={(e) =>
                  setBrief({ ...brief, audience: e.target.value })
                }
              />
            </label>
            <label className="sv-field">
              משך רצוי
              <select
                value={brief.duration}
                disabled={isFixedParentFear}
                onChange={(e) =>
                  setBrief({ ...brief, duration: +e.target.value })
                }
              >
                {durationOptions.map((n) => (
                  <option key={n} value={n}>
                    {format === "reel" ? `${n} שניות` : `${Math.round(n / 60)} דקות`}
                  </option>
                ))}
              </select>
              {isFixedParentFear && <span className="sv-field-note">מבנה זה נעול ל־60 שניות.</span>}
            </label>
          </div>
          <label className="sv-field">
            עוצמת הבימוי
            <select
              value={brief.intensity}
              onChange={(e) =>
                setBrief({ ...brief, intensity: e.target.value as any })
              }
            >
              <option>מדויק ושקט</option>
              <option>חד ומסקרן</option>
              <option>דרמטי וקולנועי</option>
            </select>
          </label>
          <div className="sv-row">
            <label className="sv-field">
              מקור החומר
              <select
                aria-label="מקור החומר"
                value={brief.voiceSource || "brand_insight"}
                onChange={(event) => setBrief({
                  ...brief,
                  voiceSource: event.target.value as CreativeBrief["voiceSource"],
                })}
              >
                {voiceSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.title}</option>
                ))}
              </select>
              <span className="sv-field-note">
                {voiceSources.find((source) => source.id === (brief.voiceSource || "brand_insight"))?.help}
              </span>
            </label>
            <label className="sv-field">
              סגנון הפקה
              <select
                aria-label="סגנון הפקה"
                value={brief.productionStyle || "direct"}
                onChange={(event) => setBrief({
                  ...brief,
                  productionStyle: event.target.value as CreativeBrief["productionStyle"],
                })}
              >
                {productionStyles.map((style) => (
                  <option key={style.id} value={style.id}>{style.title}</option>
                ))}
              </select>
              <span className="sv-field-note">
                {productionStyles.find((style) => style.id === (brief.productionStyle || "direct"))?.help}
              </span>
            </label>
          </div>
          <label className="sv-field">
            קול התוכן וההגשה
            <select
              aria-label="קול התוכן וההגשה"
              value={brief.contentVoice || "heartcompass"}
              onChange={(event) => setBrief({
                ...brief,
                contentVoice: getContentVoice(event.target.value).id,
              })}
            >
              {contentVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>{voice.title}</option>
              ))}
            </select>
            <span className="sv-field-note">
              {getContentVoice(brief.contentVoice).help}
            </span>
            <span className="sv-field-note">
              {getContentVoice(brief.contentVoice).fit}
            </span>
          </label>
          <p className="sv-kicker">בחר את מנגנון הסיפור</p>
          <div className="sv-archetypes">
            {availableArchetypes
              .map((a, i) => (
              <button
                key={a.id}
                className={`sv-archetype ${brief.archetype === a.id ? "active" : ""}`}
                onClick={() =>
                  setBrief({
                    ...brief,
                    archetype: a.id,
                    duration: a.id === "parent_fear_60" ? 60 : brief.duration,
                  })
                }
              >
                <span>0{i + 1}</span>
                <strong>{a.title}</strong>
                <small>{a.hook}</small>
              </button>
              ))}
          </div>
          {selectedArchetype && (
            <div className="sv-archetype-contract">
              <strong>כך התסריט ייבנה</strong>
              <span>{selectedArchetype.mechanism}</span>
              {format === "reel" && (
                <div>{describeArchetypeStructure(selectedArchetype.id, brief.duration).join(" ← ")}</div>
              )}
              <small>התמורה: {selectedArchetype.payoff}</small>
            </div>
          )}
          <p className="sv-duration-target">
            יעד נוכחי: {format === "reel" ? `${brief.duration} שניות` : `${Math.round(brief.duration / 60)} דקות`} · {currentTarget.min}–{currentTarget.max} מילים
          </p>
          <button
            className="sv-primary sv-wide"
            disabled={loading}
            onClick={generate}
          >
            {loading ? (
              <Loader className="animate-spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}{" "}
            {loading
              ? "בונה כיוון קריאייטיבי…"
              : pack && isStale
                ? `צור מחדש ל־${format === "reel" ? `${brief.duration} שניות` : `${Math.round(brief.duration / 60)} דקות`}`
                : "כתוב לי תסריט ותכנית צילום"}
          </button>
          {loading && (
            <button
              className="sv-button"
              onClick={() => abort.current?.abort()}
            >
              בטל יצירה
            </button>
          )}
          <p className="sv-hint">
            יצירת AI משתמשת במפתח ובמודל שבחרת בהגדרות. הטיוטה נשמרת בדפדפן.
          </p>
        </section>
        )}
        <section className="sv-creative-results">
          {!pack ? (
            <div className="sv-panel sv-creative-empty">
              <Sparkles size={32} />
              <h2>מסר אחד. שלוש דרכים לפתוח אותו.</h2>
              <p>
                תקבל הוקים, קאברים, תסריט פעימות והנחיות צילום — כולם משרתים את
                אותו גילוי.
              </p>
              <div className="sv-story-flow">
                {(format === "reel"
                  ? describeArchetypeStructure(selectedArchetype?.id || "contradiction", brief.duration)
                  : ["פתיחה", "סצנה", "העמקה", "עדשת מצפן הלב", "יישום", "סגירה"]
                ).map((stage) => <span key={stage}>{stage}</span>)}
              </div>

              {/* Quick direct paste invite card */}
              <div className="mt-8 p-6 rounded-2xl bg-slate-900/90 border border-white/15 max-w-md w-full text-center shadow-2xl animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 mx-auto mb-3 text-xl shadow-lg">
                  📋
                </div>
                <h3 className="text-white font-bold text-sm mb-1.5">יש לך כבר תסריט מוכן?</h3>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  אפשר לדלג על מחולל ה-AI ולהדביק את התסריט שלך ישירות לטלפרומפטר באולפן ההקלטות.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    className="sv-primary"
                    onClick={() => {
                      setInputMode("paste");
                      handlePasteFromClipboard();
                    }}
                  >
                    <Clipboard size={15} />
                    <span>הדבק מהלוח עכשיו</span>
                  </button>
                  <button
                    className="sv-button"
                    onClick={() => setInputMode("paste")}
                  >
                    <span>עבור למצב הדבקה</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {generatedMeta?.editorialStatus === "draft" && (
                <div className="sv-stale-notice" role="status">
                  <strong>זו טיוטה: שלב העריכה לא הושלם.</strong>
                  <span>אפשר לנסות ליצור מחדש כדי לבדוק גם את הקול והרצף.</span>
                </div>
              )}
              {isStale && (
                <div className="sv-stale-notice" role="status">
                  <strong>ההגדרות השתנו, אבל התסריט עדיין מהגרסה הקודמת.</strong>
                  <span>
                    {generatedMeta
                      ? `מוצג: ${generatedMeta.duration} שניות · ${archetypes.find((item) => item.id === generatedMeta.archetype)?.title || generatedMeta.archetype}. `
                      : "לא ניתן לזהות לאילו הגדרות נוצרה הטיוטה הישנה. "}
                    לחצו “צור מחדש” כדי להחיל את הבחירה החדשה.
                  </span>
                </div>
              )}
              <div className="sv-panel sv-message">
                <div className="sv-eyebrow">
                  {demo
                    ? "דוגמה כתובה — אינה תוצאה של יצירת AI"
                    : "המסר שמחזיק את הסרטון"}
                </div>
                <h2>{pack.message}</h2>
                <p className={`sv-length-check ${lengthState}`}>
                  {count} מילים · כ־{estimatedSeconds} שניות דיבור
                  {generatedMeta && ` · יעד: ${generatedMeta.targetWordsMin}–${generatedMeta.targetWordsMax} מילים ל־${generatedMeta.duration} שניות`}
                  {lengthState === "short" && " · קצר מהיעד"}
                  {lengthState === "long" && " · ארוך מהיעד"}
                  {lengthState === "good" && " · בטווח"}
                </p>
              </div>
              <div className="sv-hooks">
                {pack.hooks.map((h, i) => (
                  <button
                    key={i}
                    className={`sv-hook ${chosen === i ? "active" : ""}`}
                    onClick={() => {
                      setChosen(i);
                      setFullScriptOverride(null);
                      setRewriteResult(null);
                    }}
                  >
                    <div className="sv-eyebrow">
                      פתיחה 0{i + 1}
                      {chosen === i && <Check size={14} />}
                    </div>
                    <h3>{h.cover}</h3>
                    <p>{h.spoken}</p>
                    <small>{h.reason}</small>
                  </button>
                ))}
              </div>
              <div className="sv-panel sv-beats">
                <div className="sv-script-tabs" role="tablist" aria-label="תצוגת תסריט">
                  <button
                    className={viewMode === "beats" ? "active" : ""}
                    onClick={() => setViewMode("beats")}
                    role="tab"
                    aria-selected={viewMode === "beats"}
                  >
                    תחנות מפתח
                  </button>
                  <button
                    className={viewMode === "full" ? "active" : ""}
                    onClick={() => setViewMode("full")}
                    role="tab"
                    aria-selected={viewMode === "full"}
                  >
                    טקסט מלא
                  </button>
                </div>
                {viewMode === "beats" ? (
                  <>
                <div className="sv-row">
                  <label className="sv-field">
                    קאבר נבחר · 3–7 מילים
                    <input
                      value={pack.hooks[chosen].cover}
                      onChange={(e) =>
                        setPack({
                          ...pack,
                          hooks: pack.hooks.map((h, i) =>
                            i === chosen ? { ...h, cover: e.target.value } : h,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="sv-button"
                    onClick={() => onUseCover(pack.hooks[chosen].cover)}
                  >
                    לעיצוב הקאבר
                    <ArrowLeft size={15} />
                  </button>
                </div>
                <label className="sv-field">
                  ההוק המדובר
                  <textarea
                    aria-label="ההוק המדובר"
                    rows={2}
                    value={pack.hooks[chosen].spoken}
                    onChange={(e) => {
                      setFullScriptOverride(null);
                      setPack({
                        ...pack,
                        hooks: pack.hooks.map((h, i) =>
                          i === chosen ? { ...h, spoken: e.target.value } : h,
                        ),
                      });
                    }}
                  />
                </label>
                {renderRewriteControls("hook", pack.hooks[chosen].spoken)}
                {pack.beats.slice(1).map((b, i) => (
                  <div className="sv-beat" key={i}>
                    <div className="sv-eyebrow">
                      0{i + 2} / {b.stage}
                      <span>כ־{b.seconds} שניות</span>
                    </div>
                    <textarea
                      aria-label={`פעימה ${i + 2}`}
                      value={b.text}
                      rows={3}
                      onChange={(e) => editBeat(i + 1, e.target.value)}
                    />
                    {renderRewriteControls(`beat-${i + 1}`, b.text)}
                    <p className="sv-shot">
                      <FilmIcon />
                      {b.visual}
                    </p>
                  </div>
                ))}
                {brief.archetype === "parent_fear_60" ? (
                  <p className="sv-payoff">
                    <strong>סיום:</strong> משפט הזהב הוא השורה האחרונה. אחריו שתיקה — בלי CTA.
                  </p>
                ) : (
                  <label className="sv-field">
                    משפט סיום
                    <textarea
                      aria-label="משפט סיום"
                      value={pack.cta}
                      rows={2}
                      onChange={(e) => {
                        setFullScriptOverride(null);
                        setPack({ ...pack, cta: e.target.value });
                      }}
                    />
                  </label>
                )}
                  </>
                ) : (
                  <label className="sv-field sv-full-script">
                    <div className="flex items-center justify-between mb-1">
                      <span>טקסט מלא לעריכה, הקלטה והעתקה</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text && text.trim()) setFullScriptOverride(text);
                          } catch {
                            onError("לא ניתן לגשת ללוח ההעתקה בדפדפן");
                          }
                        }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold cursor-pointer"
                      >
                        <Clipboard size={13} />
                        <span>הדבק מהלוח לטקסט המלא</span>
                      </button>
                    </div>
                    <textarea
                      aria-label="טקסט מלא"
                      value={script}
                      rows={format === "reel" ? 16 : 32}
                      onChange={(event) => setFullScriptOverride(event.target.value)}
                    />
                    <span className="sv-hint">
                      עריכה כאן נשמרת כגרסה המלאה. מעבר לניסוח חלופי בתחנות יעדכן אותה מחדש.
                    </span>
                  </label>
                )}
                <p className="sv-payoff">
                  <strong>התמורה לצופה:</strong> {pack.payoff}
                </p>
                <div className="sv-row">
                  <button
                    className="sv-primary"
                    disabled={isStale}
                    onClick={() =>
                      onUseScript(script, pack.hooks[chosen].cover)
                    }
                  >
                    שלח להקלטה
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    className="sv-button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(script)
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        })
                        .catch(() => onError("ההעתקה נחסמה בדפדפן"));
                    }}
                  >
                    <Copy size={15} />
                    {copied ? "הועתק" : "העתק"}
                  </button>
                  <button
                    className="sv-button"
                    onClick={() =>
                      downloadBlob(
                        new Blob(
                          [
                            `${pack.hooks[chosen].cover}\n\n${script}\n\nתכנית צילום\n${pack.beats.map((b) => `${b.stage}: ${b.visual}`).join("\n")}\n\n${pack.payoff}`,
                          ],
                          { type: "text/plain;charset=utf-8" },
                        ),
                        "תסריט-ותכנית-צילום.txt",
                      )
                    }
                  >
                    <Download size={15} />
                    הורד טיוטה
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
const FilmIcon = () => <Clapperboard size={14} />;
