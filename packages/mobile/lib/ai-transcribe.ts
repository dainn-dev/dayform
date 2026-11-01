/**
 * Speech to text through the user's AI provider (framework-free, tested): when the phone's own recognizer cannot help
 * (the owner's vivo has no Vietnamese pack for it), holding the assistant or the chat's microphone records a short
 * clip and posts it to the OpenAI-compatible `POST {baseUrl}/audio/transcriptions` with the transcription model the
 * user set. The clip goes to that provider only; nothing is recorded unless the user holds or taps.
 */

export const DEFAULT_TRANSCRIBE_MODEL = "whisper-1";
/** A clip shorter than this is a slip of the finger, not a sentence: it is dropped. */
export const MIN_RECORD_MS = 400;
/** Recording stops by itself after this long. */
export const MAX_RECORD_MS = 20_000;

export function transcriptionUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  return `${base}/audio/transcriptions`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The text of a transcription answer (`{ text }` JSON, or a plain-text body), or null when it has none. */
export function transcriptionText(payload: unknown): string | null {
  if (typeof payload === "string") return payload.trim() || null;
  if (isRecord(payload) && typeof payload.text === "string") return payload.text.trim() || null;
  return null;
}

/** Whether transcription through the provider is set up (a model name is given). */
export function canTranscribe(model: string): boolean {
  return model.trim().length > 0;
}
