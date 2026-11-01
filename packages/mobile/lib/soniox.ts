/**
 * Speech to text with Soniox (framework-free, tested; the network calls are in soniox-client.ts). Holding the assistant
 * or the chat's microphone records a short clip; it is uploaded to Soniox's async API, transcribed with the language
 * hint of the app, and the file and the transcription are deleted from Soniox right after the text comes back.
 * Docs: https://docs.soniox.com (Files, Transcriptions; `Authorization: Bearer <key>`).
 */

export const SONIOX_BASE = "https://api.soniox.com/v1";
export const SONIOX_ASYNC_MODEL = "stt-async-v5";

/** A clip shorter than this is a slip of the finger, not a sentence: it is dropped. */
export const MIN_RECORD_MS = 400;
/** Recording stops by itself after this long. */
export const MAX_RECORD_MS = 20_000;
/** How long to wait for a transcription before giving up. */
export const TRANSCRIBE_TIMEOUT_MS = 40_000;

export type SonioxStatus = "queued" | "processing" | "completed" | "error";

export function transcriptionRequest(fileId: string, language: "vi" | "en") {
  return { model: SONIOX_ASYNC_MODEL, file_id: fileId, language_hints: [language] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The id in a created file or transcription, or null. */
export function idOf(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.id === "string" && payload.id ? payload.id : null;
}

/** The status of a transcription and its error message, or null when the answer is not one. */
export function statusOf(payload: unknown): { status: SonioxStatus; error: string | null } | null {
  if (!isRecord(payload)) return null;
  const status = payload.status;
  if (status !== "queued" && status !== "processing" && status !== "completed" && status !== "error") return null;
  return { status, error: typeof payload.error_message === "string" ? payload.error_message : null };
}

/** The full text of a transcript answer, or null when it is empty or not one. */
export function transcriptText(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.text !== "string") return null;
  return payload.text.trim() || null;
}

/** Soniox's error message in an error answer, or null. */
export function sonioxError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error_message === "string") return payload.error_message;
  return null;
}

/** Waits between status checks: quick at first (a sentence is done in about a second), then slower. */
export function pollDelay(attempt: number): number {
  return Math.min(2000, 300 + attempt * 200);
}
