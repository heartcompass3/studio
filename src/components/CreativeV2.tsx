import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  Check,
  Loader,
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
}: {
  onUseScript: (script: string, coverTitle?: string) => void;
  onError: (s: string) => void;
  onUseCover: (title: string) => void;
}) {
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
            מצפן הלב / CREATIVE DIRECTION <span>בטא</span>
          </div>
          <h1>שירגישו: זה בדיוק מה שקורה אצלי.</h1>
          <p>אמונה מוכרת. הבנה חדשה. בחירה קטנה שאפשר להתחיל היום.</p>
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
      <div className="sv-creative-grid">
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
                    טקסט מלא לעריכה, הקלטה והעתקה
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
