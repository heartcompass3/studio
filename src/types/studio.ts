export interface CaptionItem {
  id: number;
  start: number;
  end: number;
  text: string;
  needsReview?: boolean;
}

export interface ScriptBeat {
  id: string;
  type: 'hook' | 'mirror' | 'internal' | 'reversal' | 'action';
  title: string;
  text: string;
  durationSec?: number;
}

export interface HookArchetype {
  id: string;
  label: string;
  description: string;
  badge: string;
  prompt: string;
}

export interface HormoziOfferResult {
  bleedingNeck: string;
  dreamOutcome: string;
  perceivedLikelihood: string;
  timeAndEffort: string;
  thePitch: string;
}

export interface SmsResults {
  option1: { title: string; text: string };
  option2: { title: string; text: string };
  option3: { title: string; text: string };
}

export interface TranslationResult {
  hiddenTranslation: string;
  innerFear: string;
  lighthouseResponse: string;
}

export interface LoopResult {
  trigger: string;
  interpretation: string;
  body: string;
  emotion: string;
  autoThought: string;
  hiddenGain: string;
}

export interface PatternPersona {
  name: string;
  role: string;
  voice: string;
  icon: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type ActiveTab = 'brain' | 'offer' | 'sms' | 'translator' | 'coach' | 'loop' | 'studio' | 'editor' | 'editor-v2' | 'creative-v2';
export type VideoFormat = 'reel' | 'youtube';
export type SubtitleStyle = 
  | 'karaoke-yellow'          // צהוב ויראלי הורמוזי עם רקע שחור קומפקטי
  | 'karaoke-brand-cyan'      // תכלת מצפן הלב (צבע המותג) עם רקע אינדיגו עדין
  | 'karaoke-clean-floating'  // קריוקי צף נקי ללא רקע שחור כלל (צל וקו מתאר)
  | 'karaoke-brand-coral';    // קורל חם רגשי (צבע הלב של המותג)
export type VideoAspectRatio = '9:16' | '16:9' | 'original';

export interface VisualOverlayItem {
  id: string;
  type: 'hook-cover' | 'b-roll-full' | 'pip-corner';
  imageUrl: string;
  startTime: number;
  endTime: number;
  title?: string;
}

export type RecordingMode = 'camera' | 'voiceover';

export type BackgroundSourceType = 'camera' | 'broll-video' | 'slideshow' | 'gradient';

export interface BackgroundSlide {
  id: string;
  url: string;
  title?: string;
}

export interface BackgroundVisualConfig {
  type: BackgroundSourceType;
  videoUrl?: string;
  slides: BackgroundSlide[];
  slideDurationSec: number;
  gradientTheme?: string;
}
