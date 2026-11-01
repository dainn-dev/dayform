/**
 * Reading an OpenAI-style chat completion (framework-free, tested). The assistant talks to any provider with an
 * OpenAI-compatible `POST {baseUrl}/chat/completions`; the answer arrives either as server-sent events (`stream: true`)
 * or, from providers that ignore streaming, as one JSON body. Both end up as one `Completion`.
 */

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Completion = { content: string; toolCalls: ToolCall[]; finishReason: string | null };

export function emptyCompletion(): Completion {
  return { content: "", toolCalls: [], finishReason: null };
}

/**
 * UTF-8 bytes to text across chunk boundaries: a character split between two network chunks waits for the rest
 * instead of turning into replacement characters (Vietnamese is mostly multi-byte).
 */
export class Utf8Stream {
  private pending: number[] = [];

  decode(chunk: Uint8Array): string {
    const bytes = this.pending.concat(Array.from(chunk));
    let out = "";
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      const size = b < 0x80 ? 1 : b >> 5 === 0b110 ? 2 : b >> 4 === 0b1110 ? 3 : b >> 3 === 0b11110 ? 4 : 1;
      if (i + size > bytes.length) break;
      if (size === 1) {
        out += b < 0x80 ? String.fromCharCode(b) : "�";
      } else {
        let code = b & (0xff >> (size + 1));
        for (let k = 1; k < size; k++) code = (code << 6) | (bytes[i + k] & 0x3f);
        out += String.fromCodePoint(code);
      }
      i += size;
    }
    this.pending = bytes.slice(i);
    return out;
  }
}

/** Splits buffered text into complete lines; the unfinished last line is kept for the next chunk. */
export function takeLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

/** The JSON payload of one SSE line, "done" for the end marker, or null for anything else (comments, blank lines). */
export function sseData(line: string): unknown | "done" | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return "done";
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

type DeltaToolCall = { index?: number; id?: string; function?: { name?: string; arguments?: string } };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The provider's error message when a payload is an error, else null. */
export function errorOf(payload: unknown): string | null {
  if (!isRecord(payload) || !("error" in payload)) return null;
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return typeof error === "string" ? error : "The AI provider returned an error.";
}

/** Adds one streamed chunk to the completion; returns the new text it carried (for live display). */
export function applyChunk(acc: Completion, payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return "";
  const choice = payload.choices[0] as Record<string, unknown> | undefined;
  if (!isRecord(choice)) return "";
  if (typeof choice.finish_reason === "string") acc.finishReason = choice.finish_reason;
  const delta = choice.delta;
  if (!isRecord(delta)) return "";
  let text = "";
  if (typeof delta.content === "string") {
    acc.content += delta.content;
    text = delta.content;
  }
  if (Array.isArray(delta.tool_calls)) {
    for (const raw of delta.tool_calls as DeltaToolCall[]) {
      const index = typeof raw.index === "number" ? raw.index : acc.toolCalls.length;
      const call = acc.toolCalls[index] ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
      if (raw.id) call.id = raw.id;
      if (raw.function?.name) call.function.name += raw.function.name;
      if (raw.function?.arguments) call.function.arguments += raw.function.arguments;
      acc.toolCalls[index] = call;
    }
  }
  return text;
}

/** A complete (non-streamed) response body as a completion, or null when it is not one. */
export function completionFromJson(payload: unknown): Completion | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return null;
  const message = choice.message;
  const toolCalls: ToolCall[] = Array.isArray(message.tool_calls)
    ? (message.tool_calls as ToolCall[]).filter(call => call && call.function && typeof call.function.name === "string")
      .map(call => ({ id: String(call.id ?? ""), type: "function", function: { name: call.function.name, arguments: String(call.function.arguments ?? "") } }))
    : [];
  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
  };
}

/** Calls without an id get one, so every tool result can be matched to its call. */
export function withCallIds(calls: ToolCall[], prefix: string): ToolCall[] {
  return calls.filter(Boolean).map((call, index) => (call.id ? call : { ...call, id: `${prefix}-${index}` }));
}
