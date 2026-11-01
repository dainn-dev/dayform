import { describe, expect, test } from "bun:test";
import { runTurn, trimHistory, type ChatMessage } from "./ai-loop";
import type { Completion } from "./ai-stream";
import { systemPrompt, todayContext } from "./ai-prompt";
import type { Task } from "./planner";

const answer = (content: string): Completion => ({ content, toolCalls: [], finishReason: "stop" });
const toolCall = (name: string, args: unknown, id = "c1"): Completion => ({
  content: "", finishReason: "tool_calls", toolCalls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

describe("conversation loop", () => {
  test("a plain answer ends the turn at once", async () => {
    const result = await runTurn([{ role: "user", content: "Chào" }], { complete: async () => answer("Chào bạn!"), runTool: async () => ({}) });
    expect(result).toEqual({ added: [{ role: "assistant", content: "Chào bạn!" }], reply: "Chào bạn!", stopped: "answer" });
  });

  test("tool results go back to the model before it answers", async () => {
    const seen: ChatMessage[][] = [];
    const replies = [toolCall("list_tasks", { from: "2026-11-01", to: "2026-11-01" }), answer("Hôm nay có 2 việc.")];
    const result = await runTurn([{ role: "user", content: "Hôm nay có gì?" }], {
      complete: async messages => { seen.push(messages); return replies.shift()!; },
      runTool: async () => ({ tasks: [1, 2] }),
    });
    expect(result.reply).toBe("Hôm nay có 2 việc.");
    expect(seen[1].at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: '{"tasks":[1,2]}' });
  });

  test("a tool that throws becomes an error result, not a crash", async () => {
    const replies = [toolCall("complete_task", { id: "x" }), answer("Không được rồi.")];
    const result = await runTurn([{ role: "user", content: "xong" }], { complete: async () => replies.shift()!, runTool: async () => { throw new Error("boom"); } });
    expect(result.added[1]).toEqual({ role: "tool", tool_call_id: "c1", content: '{"ok":false,"error":"The tool failed."}' });
  });

  test("a model that never stops calling tools is cut off", async () => {
    const result = await runTurn([{ role: "user", content: "loop" }], { complete: async () => toolCall("get_settings", {}), runTool: async () => ({}) }, 3);
    expect(result.stopped).toBe("rounds");
  });

  test("closing the chat stops the loop", async () => {
    const result = await runTurn([{ role: "user", content: "x" }], { complete: async () => answer("y"), runTool: async () => ({}), cancelled: () => true });
    expect(result.stopped).toBe("cancelled");
  });

  test("history keeps the last turns and starts on a user message", () => {
    const history: ChatMessage[] = [];
    for (let i = 0; i < 15; i++) history.push({ role: "user", content: `q${i}` }, { role: "assistant", content: `a${i}` });
    const kept = trimHistory(history, 10);
    expect(kept[0]).toEqual({ role: "user", content: "q5" });
    expect(kept).toHaveLength(20);
  });
});

describe("prompt", () => {
  const now = new Date(2026, 10, 1, 8, 5);

  test("names the assistant, the reply language and today", () => {
    const prompt = systemPrompt({ name: "Mây", language: "vi", now, weekStart: "mon" });
    expect(prompt).toContain("You are Mây");
    expect(prompt).toContain("reply in Vietnamese");
    expect(prompt).toContain("2026-11-01");
  });

  test("today's tasks are listed compactly, titles only when shared", () => {
    const tasks: Task[] = [{ id: "a", title: "Họp", date: "2026-11-01", start: "09:00", duration: 30, status: "todo", category: "Work", notes: "", createdAt: "" }];
    expect(todayContext(tasks, now, true)).toContain('"Họp"');
    expect(todayContext(tasks, now, false)).not.toContain("Họp");
    expect(todayContext([], now, true)).toContain("no tasks");
  });
});
