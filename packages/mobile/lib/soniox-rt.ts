/**
 * Soniox real-time speech to text (framework-free, tested; the WebSocket and the microphone are in
 * components/assistant/use-soniox.ts). The microphone's raw 16-bit PCM is streamed to Soniox as it is spoken; Soniox
 * answers with tokens: provisional ones (`is_final: false`, replaced by every answer), final ones (sent once), and a
 * final `<end>` token when the speaker stops (endpoint detection), which closes an utterance.
 * Docs: https://docs.soniox.com/api-reference/stt/websocket-api, /stt/rt/endpoint-detection.
 */

export const SONIOX_RT_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
export const SONIOX_RT_MODEL = "stt-rt-v5";
/** The utterance ends at most this long after the speaker stops (Soniox allows 500..3000). */
export const ENDPOINT_DELAY_MS = 1000;
/** A held or tapped microphone stops by itself after this long. */
export const MAX_ONCE_MS = 30_000;

export function rtConfig(language: "vi" | "en", sampleRate: number) {
  return {
    model: SONIOX_RT_MODEL,
    audio_format: "pcm_s16le",
    sample_rate: Math.round(sampleRate),
    num_channels: 1,
    language_hints: [language],
    enable_endpoint_detection: true,
    max_endpoint_delay_ms: ENDPOINT_DELAY_MS,
  };
}

/** What has been said so far in the current utterance: the final part, and the provisional rest. */
export type RtState = { finalText: string; partial: string };

export function emptyRt(): RtState {
  return { finalText: "", partial: "" };
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** The text to show while the user speaks. */
export function liveText(state: RtState): string {
  return clean(state.finalText + state.partial);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export type RtUpdate = { state: RtState; utterances: string[]; finished: boolean; error: string | null };

/** Folds one Soniox answer into the state; utterances are the sentences that ended with this answer. */
export function applyRt(state: RtState, payload: unknown): RtUpdate {
  if (!isRecord(payload)) return { state, utterances: [], finished: false, error: null };
  if (typeof payload.error_message === "string" || typeof payload.error_code === "number") {
    return { state, utterances: [], finished: true, error: typeof payload.error_message === "string" ? payload.error_message : "Soniox reported an error." };
  }
  let finalText = state.finalText;
  let partial = "";
  const utterances: string[] = [];
  const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  for (const token of tokens) {
    if (!isRecord(token) || typeof token.text !== "string") continue;
    if (token.text === "<end>") {
      const said = clean(finalText);
      if (said) utterances.push(said);
      finalText = "";
      continue;
    }
    if (token.is_final === true) finalText += token.text;
    else partial += token.text;
  }
  return { state: { finalText, partial }, utterances, finished: payload.finished === true, error: null };
}
