/**
 * Speech helpers for the assistant (framework-free, tested); the expo-speech glue is in assistant-speech-expo.ts.
 * Leo reads its lines with the phone's own text-to-speech engine. Only a voice of the app's language is used, and an
 * on-device one is preferred over one that needs the network; with no voice for the language Leo stays silent rather
 * than reading Vietnamese with an English voice.
 *
 * The speech timeline is an estimate of when each syllable is said (the engine reports only start and end). It drives
 * the talking movement now and the mouth (`ParamMouthOpenY`) once the Live2D model exists. Vietnamese writes one
 * syllable per word, so the estimate is good there; English counts vowel groups.
 */
export type SpeechLanguage = "vi" | "en";

/** The fields of an expo-speech voice that matter here. */
export type VoiceInfo = { identifier: string; language: string; name?: string; quality?: string };

export function speechLocale(language: SpeechLanguage): string {
  return language === "vi" ? "vi-VN" : "en-US";
}

/** The voices of the language, the best first (on-device before network ones). */
export function voicesFor(voices: readonly VoiceInfo[], language: SpeechLanguage): VoiceInfo[] {
  const own = voices.filter(voice => voice.language.toLowerCase().replace("_", "-").startsWith(language));
  return [...own].sort((a, b) => voiceScore(b, language) - voiceScore(a, language));
}

/** Whether a voice needs the network, going by the id the engine gives it (null when the id does not say). */
export function voiceNeedsNetwork(voice: VoiceInfo): boolean | null {
  const id = voice.identifier.toLowerCase();
  if (id.includes("network")) return true;
  if (id.includes("local")) return false;
  return null;
}

/**
 * The voice to use: the one the user chose when the phone still has it for this language, otherwise the best one;
 * null when the phone has no voice for the language.
 */
export function pickVoice(voices: readonly VoiceInfo[], language: SpeechLanguage, preferred = ""): string | null {
  const own = voicesFor(voices, language);
  if (own.length === 0) return null;
  if (preferred && own.some(voice => voice.identifier === preferred)) return preferred;
  return own[0].identifier;
}

function voiceScore(voice: VoiceInfo, language: SpeechLanguage): number {
  const id = voice.identifier.toLowerCase();
  let value = 0;
  if (id.includes("network")) value -= 10;
  if (id.includes("local")) value += 5;
  if (voice.language.toLowerCase().replace("_", "-") === speechLocale(language).toLowerCase()) value += 2;
  if (voice.quality === "Enhanced") value += 1;
  return value;
}

/**
 * Pitch of Leo's voice. A raised pitch made the Vietnamese voices sound squeezed, so Vietnamese keeps the natural one
 * and only English is a little higher.
 */
export function voicePitch(language: SpeechLanguage): number {
  return language === "vi" ? 1.0 : 1.1;
}

/**
 * The text as it should be said, which is not always how it is shown: "3/5" becomes "3 trên 5" / "3 of 5", "09:45"
 * becomes "9 giờ 45" in Vietnamese, and ellipses become a plain pause, which some engines spelled out or skipped.
 */
export function speakableText(text: string, language: SpeechLanguage): string {
  let out = text.replace(/(\d+)\s*\/\s*(\d+)/g, (_, a: string, b: string) => `${a} ${language === "vi" ? "trên" : "of"} ${b}`);
  if (language === "vi") {
    out = out.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) => {
      const hour = Number(h);
      const minute = Number(m);
      return minute === 0 ? `${hour} giờ` : `${hour} giờ ${minute}`;
    });
  }
  return out.replace(/\s*(…|\.\.\.)\s*/g, ", ").replace(/,\s*$/, ".").replace(/\s{2,}/g, " ").trim();
}

export type Span = { start: number; end: number };

const SYLLABLE_MS: Record<SpeechLanguage, number> = { vi: 230, en: 190 };
const COMMA_PAUSE_MS = 220;
const STOP_PAUSE_MS = 380;

function syllablesOf(word: string, language: SpeechLanguage): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (!letters) return 0;
  if (language === "vi") return 1;
  const groups = letters.toLowerCase().match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, groups - (letters.length > 3 && /e$/i.test(letters) ? 1 : 0));
}

/** When each syllable is said, in ms from the start of the line. */
export function speechTimeline(text: string, language: SpeechLanguage): Span[] {
  const spans: Span[] = [];
  let at = 0;
  const step = SYLLABLE_MS[language];
  for (const word of text.split(/\s+/)) {
    const count = syllablesOf(word, language);
    for (let i = 0; i < count; i++) {
      spans.push({ start: at, end: at + step * 0.8 });
      at += step;
    }
    if (/[.!?…]$/.test(word)) at += STOP_PAUSE_MS;
    else if (/[,;:]$/.test(word)) at += COMMA_PAUSE_MS;
  }
  return spans;
}

export function speechMs(spans: readonly Span[]): number {
  return spans.length === 0 ? 0 : spans[spans.length - 1].end;
}

/** How open the mouth is at `ms` (0..1): a quick open and close inside each syllable, shut between them. */
export function mouthAt(spans: readonly Span[], ms: number): number {
  for (const span of spans) {
    if (ms < span.start) return 0;
    if (ms <= span.end) return Math.sin((Math.PI * (ms - span.start)) / (span.end - span.start));
  }
  return 0;
}
