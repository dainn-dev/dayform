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

/** The best voice for the language, or null when the phone has none. */
export function pickVoice(voices: readonly VoiceInfo[], language: SpeechLanguage): string | null {
  const own = voices.filter(voice => voice.language.toLowerCase().replace("_", "-").startsWith(language));
  if (own.length === 0) return null;
  const score = (voice: VoiceInfo) => {
    const id = voice.identifier.toLowerCase();
    let value = 0;
    if (id.includes("network")) value -= 10;
    if (id.includes("local")) value += 5;
    if (voice.language.toLowerCase().replace("_", "-") === speechLocale(language).toLowerCase()) value += 2;
    if (voice.quality === "Enhanced") value += 1;
    return value;
  };
  return [...own].sort((a, b) => score(b) - score(a))[0].identifier;
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
