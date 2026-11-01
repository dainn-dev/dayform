import type { Completion, ToolCall } from "./ai-stream";
import { withCallIds } from "./ai-stream";

/**
 * One turn of the conversation (framework-free, tested with fakes): ask the model, run the tools it calls, send the
 * results back, and repeat until it answers in words. The network call, the confirmation card and the writes are
 * injected, so the loop itself never touches the app.
 */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LoopDeps = {
  /** Sends the messages and returns the model's reply (streaming happens inside). */
  complete: (messages: ChatMessage[]) => Promise<Completion>;
  /** Runs one tool call (asking the user first when it changes something) and returns its result for the model. */
  runTool: (call: ToolCall) => Promise<unknown>;
  /** Stops the loop between steps, e.g. when the chat is closed. */
  cancelled?: () => boolean;
};

export const MAX_ROUNDS = 6;

export type TurnResult = { added: ChatMessage[]; reply: string; stopped: "answer" | "rounds" | "cancelled" };

export async function runTurn(history: readonly ChatMessage[], deps: LoopDeps, maxRounds = MAX_ROUNDS): Promise<TurnResult> {
  const added: ChatMessage[] = [];
  for (let round = 0; round < maxRounds; round++) {
    if (deps.cancelled?.()) return { added, reply: "", stopped: "cancelled" };
    const completion = await deps.complete([...history, ...added]);
    const calls = withCallIds(completion.toolCalls, `call-${round}`);
    added.push({ role: "assistant", content: completion.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (calls.length === 0) return { added, reply: completion.content.trim(), stopped: "answer" };
    // One at a time: each change waits for its own confirmation card.
    for (const call of calls) {
      if (deps.cancelled?.()) {
        added.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: "The user closed the chat." }) });
        continue;
      }
      let result: unknown;
      try {
        result = await deps.runTool(call);
      } catch {
        result = { ok: false, error: "The tool failed." };
      }
      added.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { added, reply: "", stopped: "rounds" };
}

/** Keeps the conversation sent to the model short: the last `max` user turns, never starting on a tool result. */
export function trimHistory(history: readonly ChatMessage[], max = 10): ChatMessage[] {
  let users = 0;
  let start = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      users++;
      start = i;
      if (users === max) break;
    }
  }
  return history.slice(start);
}
