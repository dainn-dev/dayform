import { AiError } from "./ai-client";
import { idOf, pollDelay, SONIOX_BASE, sonioxError, statusOf, TRANSCRIBE_TIMEOUT_MS, transcriptionRequest, transcriptText } from "./soniox";

/**
 * Soniox network calls (untested glue; the choices are in soniox.ts). React Native's own fetch is used: it uploads a
 * file from its `uri` in multipart form data, and every answer is small.
 */

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function call(apiKey: string, path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${SONIOX_BASE}${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${apiKey}` } });
  } catch {
    throw new AiError("Could not reach Soniox.", null);
  }
  if (response.status === 204) return null;
  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AiError("Soniox did not accept the API key.", response.status);
    throw new AiError(sonioxError(payload) ?? `Soniox answered ${response.status}.`, response.status);
  }
  return payload;
}

/** Best effort: the recording and its text should not stay on Soniox. */
async function cleanUp(apiKey: string, transcriptionId: string | null, fileId: string | null) {
  if (transcriptionId) await call(apiKey, `/transcriptions/${transcriptionId}`, { method: "DELETE" }).catch(() => undefined);
  if (fileId) await call(apiKey, `/files/${fileId}`, { method: "DELETE" }).catch(() => undefined);
}

/** Turns a recorded clip into text; the clip and the transcription are deleted from Soniox afterwards. */
export async function transcribeWithSoniox(apiKey: string, uri: string, language: "vi" | "en"): Promise<string> {
  let fileId: string | null = null;
  let transcriptionId: string | null = null;
  try {
    const form = new FormData();
    // React Native reads the file from the uri; the object shape is RN's own, not the web's Blob.
    form.append("file", { uri, name: "speech.m4a", type: "audio/mp4" } as unknown as Blob);
    fileId = idOf(await call(apiKey, "/files", { method: "POST", body: form }));
    if (!fileId) throw new AiError("Soniox sent an answer this app cannot read.", null);

    transcriptionId = idOf(await call(apiKey, "/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transcriptionRequest(fileId, language)),
    }));
    if (!transcriptionId) throw new AiError("Soniox sent an answer this app cannot read.", null);

    const deadline = Date.now() + TRANSCRIBE_TIMEOUT_MS;
    for (let attempt = 0; ; attempt++) {
      const state = statusOf(await call(apiKey, `/transcriptions/${transcriptionId}`));
      if (!state) throw new AiError("Soniox sent an answer this app cannot read.", null);
      if (state.status === "completed") break;
      if (state.status === "error") throw new AiError(state.error ?? "Soniox could not transcribe the recording.", null);
      if (Date.now() > deadline) throw new AiError("Soniox took too long to answer.", null);
      await wait(pollDelay(attempt));
    }

    const text = transcriptText(await call(apiKey, `/transcriptions/${transcriptionId}/transcript`));
    if (text === null) throw new AiError("I didn't hear anything.", null);
    return text;
  } finally {
    void cleanUp(apiKey, transcriptionId, fileId);
  }
}

/** Checks the key with a request that costs nothing (the model list). Resolves an error message, or null when it works. */
export async function testSoniox(apiKey: string): Promise<string | null> {
  try {
    await call(apiKey, "/models");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not reach Soniox.";
  }
}
