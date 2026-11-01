import { describe, expect, test } from "bun:test";
import { idOf, MAX_RECORD_MS, MIN_RECORD_MS, pollDelay, SONIOX_ASYNC_MODEL, sonioxError, statusOf, transcriptionRequest, transcriptText } from "./soniox";

describe("Soniox speech to text", () => {
  test("a transcription asks for the async model and the app's language", () => {
    expect(transcriptionRequest("f-1", "vi")).toEqual({ model: SONIOX_ASYNC_MODEL, file_id: "f-1", language_hints: ["vi"] });
  });

  test("ids, statuses and the transcript text are read defensively", () => {
    expect(idOf({ id: "abc" })).toBe("abc");
    expect(idOf({ id: "" })).toBeNull();
    expect(idOf(null)).toBeNull();
    expect(statusOf({ status: "completed" })).toEqual({ status: "completed", error: null });
    expect(statusOf({ status: "error", error_message: "bad audio" })).toEqual({ status: "error", error: "bad audio" });
    expect(statusOf({ status: "weird" })).toBeNull();
    expect(transcriptText({ id: "t", text: " Leo ơi, hôm nay có gì? " })).toBe("Leo ơi, hôm nay có gì?");
    expect(transcriptText({ text: "  " })).toBeNull();
  });

  test("errors are read from either field", () => {
    expect(sonioxError({ message: "Invalid API key" })).toBe("Invalid API key");
    expect(sonioxError({ error_message: "Quota" })).toBe("Quota");
    expect(sonioxError({ ok: true })).toBeNull();
  });

  test("status checks start quick and slow down to two seconds", () => {
    expect(pollDelay(0)).toBe(300);
    expect(pollDelay(1)).toBeGreaterThan(pollDelay(0));
    expect(pollDelay(100)).toBe(2000);
    expect(MIN_RECORD_MS).toBeLessThan(MAX_RECORD_MS);
  });
});
