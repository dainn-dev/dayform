import { AiError } from "./ai-client";
import { errorOf } from "./ai-stream";
import { transcriptionText, transcriptionUrl } from "./ai-transcribe";

/**
 * Uploads a recorded clip to the provider's `/audio/transcriptions` (untested glue). React Native's own fetch is used
 * here (not expo/fetch): it sends a file from its `uri` in multipart form data, and the answer is small, so nothing
 * needs streaming.
 */
export type TranscribeConfig = { baseUrl: string; apiKey: string; model: string };

const TIMEOUT_MS = 45_000;

export async function transcribeClip(config: TranscribeConfig, uri: string, language: "vi" | "en"): Promise<string> {
  const form = new FormData();
  // React Native reads the file from the uri; the object shape is RN's own, not the web's Blob.
  form.append("file", { uri, name: "speech.m4a", type: "audio/mp4" } as unknown as Blob);
  form.append("model", config.model.trim());
  form.append("language", language);
  form.append("response_format", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(transcriptionUrl(config.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
      body: form,
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: unknown = raw;
    try {
      payload = JSON.parse(raw);
    } catch {
      // A plain-text answer.
    }
    if (!response.ok) throw new AiError(errorOf(payload) ?? `The AI provider answered ${response.status}.`, response.status);
    const text = transcriptionText(payload);
    if (text === null) throw new AiError("The AI provider sent an answer this app cannot read.", response.status);
    return text;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (controller.signal.aborted) throw new AiError("The AI provider took too long to answer.", null);
    throw new AiError("Could not reach the AI provider.", null);
  } finally {
    clearTimeout(timer);
  }
}
