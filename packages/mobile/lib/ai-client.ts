import { fetch } from "expo/fetch";
import { chatUrl } from "./ai-config";
import type { ChatMessage } from "./ai-loop";
import { applyChunk, completionFromJson, emptyCompletion, errorOf, sseData, takeLines, Utf8Stream, type Completion } from "./ai-stream";
import { TOOL_DEFINITIONS, type toolsFor } from "./ai-tools";

/**
 * The network call of the AI chat (untested glue): one OpenAI-compatible `POST {baseUrl}/chat/completions`, streamed
 * with `expo/fetch` (React Native's own fetch cannot read a body as it arrives). The parsing is in ai-stream.ts.
 */
export type ProviderConfig = {
  baseUrl: string; model: string; apiKey: string;
  /** The tools of this request (see `toolsFor`); omitted = the general tools without SSH. */
  tools?: ReturnType<typeof toolsFor>;
};

export class AiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

const TIMEOUT_MS = 60_000;

export async function streamCompletion(
  config: ProviderConfig,
  messages: ChatMessage[],
  onText: (delta: string) => void,
  signal?: AbortSignal,
  withTools = true,
): Promise<Completion> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort);
  try {
    const response = await fetch(chatUrl(config.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`, Accept: "text/event-stream" },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        ...(withTools ? { tools: config.tools ?? TOOL_DEFINITIONS, tool_choice: "auto" } : {}),
      }),
      signal: timeout.signal,
    });
    if (!response.ok) {
      let message = `The AI provider answered ${response.status}.`;
      try {
        message = errorOf(await response.json()) ?? message;
      } catch {
        // Not JSON: keep the status line.
      }
      throw new AiError(message, response.status);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream") || !response.body) {
      // A provider that ignores `stream: true` sends the whole answer at once.
      const payload: unknown = await response.json();
      const error = errorOf(payload);
      if (error) throw new AiError(error, response.status);
      const done = completionFromJson(payload);
      if (!done) throw new AiError("The AI provider sent an answer this app cannot read.", response.status);
      if (done.content) onText(done.content);
      return done;
    }
    const acc = emptyCompletion();
    const decoder = new Utf8Stream();
    const reader = response.body.getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      const { lines, rest } = takeLines(buffer);
      buffer = rest;
      for (const line of lines) {
        const data = sseData(line);
        if (data === null || data === "done") continue;
        const error = errorOf(data);
        if (error) throw new AiError(error, null);
        const text = applyChunk(acc, data);
        if (text) onText(text);
      }
    }
    return acc;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (timeout.signal.aborted && !signal?.aborted) throw new AiError("The AI provider took too long to answer.", null);
    throw new AiError(signal?.aborted ? "Stopped." : "Could not reach the AI provider.", null);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** A tiny request to check the URL, key and model, without tools. Resolves an error message, or null when it works. */
export async function testConnection(config: ProviderConfig): Promise<string | null> {
  try {
    await streamCompletion(config, [{ role: "user", content: "Reply with the single word: ok" }], () => {}, undefined, false);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not reach the AI provider.";
  }
}
