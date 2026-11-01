import { describe, expect, test } from "bun:test";
import { applyChunk, completionFromJson, emptyCompletion, errorOf, sseData, takeLines, Utf8Stream, withCallIds } from "./ai-stream";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("utf-8 across chunks", () => {
  test("a Vietnamese character split between two chunks is not broken", () => {
    const all = bytes("Hôm nay có gì?");
    const decoder = new Utf8Stream();
    let out = "";
    for (let i = 0; i < all.length; i += 3) out += decoder.decode(all.slice(i, i + 3));
    expect(out).toBe("Hôm nay có gì?");
  });

  test("emoji (4 bytes) survive one byte at a time", () => {
    const all = bytes("ok 🐆");
    const decoder = new Utf8Stream();
    let out = "";
    for (const b of all) out += decoder.decode(new Uint8Array([b]));
    expect(out).toBe("ok 🐆");
  });
});

describe("server-sent events", () => {
  test("lines are split and the unfinished one is kept", () => {
    expect(takeLines("data: a\ndata: b\ndata: c")).toEqual({ lines: ["data: a", "data: b"], rest: "data: c" });
    expect(takeLines("x\r\ny\r\n")).toEqual({ lines: ["x", "y"], rest: "" });
  });

  test("data lines are parsed, the end marker is recognised, the rest ignored", () => {
    expect(sseData('data: {"a":1}')).toEqual({ a: 1 });
    expect(sseData("data: [DONE]")).toBe("done");
    expect(sseData(": keep-alive")).toBeNull();
    expect(sseData("data: {broken")).toBeNull();
  });

  test("text deltas and split tool-call arguments add up", () => {
    const acc = emptyCompletion();
    expect(applyChunk(acc, { choices: [{ delta: { content: "Xin " } }] })).toBe("Xin ");
    applyChunk(acc, { choices: [{ delta: { content: "chào" } }] });
    applyChunk(acc, { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "list_", arguments: '{"from":' } }] } }] });
    applyChunk(acc, { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "tasks", arguments: '"2026-11-01"}' } }] }, finish_reason: "tool_calls" }] });
    expect(acc.content).toBe("Xin chào");
    expect(acc.toolCalls).toEqual([{ id: "c1", type: "function", function: { name: "list_tasks", arguments: '{"from":"2026-11-01"}' } }]);
    expect(acc.finishReason).toBe("tool_calls");
  });

  test("a whole JSON answer (no streaming) reads the same way", () => {
    const done = completionFromJson({ choices: [{ message: { content: "Hi", tool_calls: [{ id: "x", type: "function", function: { name: "get_settings", arguments: "{}" } }] }, finish_reason: "tool_calls" }] });
    expect(done).toEqual({ content: "Hi", toolCalls: [{ id: "x", type: "function", function: { name: "get_settings", arguments: "{}" } }], finishReason: "tool_calls" });
    expect(completionFromJson({ nope: 1 })).toBeNull();
  });

  test("provider errors are reported", () => {
    expect(errorOf({ error: { message: "Invalid API key" } })).toBe("Invalid API key");
    expect(errorOf({ choices: [] })).toBeNull();
  });

  test("calls without an id get one", () => {
    const calls = withCallIds([{ id: "", type: "function", function: { name: "a", arguments: "" } }], "r0");
    expect(calls[0].id).toBe("r0-0");
  });
});
