import { describe, expect, test } from "bun:test";
import { canTranscribe, MAX_RECORD_MS, MIN_RECORD_MS, transcriptionText, transcriptionUrl } from "./ai-transcribe";

describe("transcription through the provider", () => {
  test("the endpoint sits next to chat completions", () => {
    expect(transcriptionUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(transcriptionUrl("https://api.groq.com/openai/v1/")).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(transcriptionUrl("https://x.dev/v1/chat/completions")).toBe("https://x.dev/v1/audio/transcriptions");
  });

  test("the text is read from JSON or plain text, and empty answers count as nothing", () => {
    expect(transcriptionText({ text: " Hôm nay có gì? " })).toBe("Hôm nay có gì?");
    expect(transcriptionText("Leo ơi")).toBe("Leo ơi");
    expect(transcriptionText({ text: "   " })).toBeNull();
    expect(transcriptionText({ error: "x" })).toBeNull();
  });

  test("it is set up only with a model name", () => {
    expect(canTranscribe("whisper-1")).toBe(true);
    expect(canTranscribe("  ")).toBe(false);
  });

  test("limits make sense", () => {
    expect(MIN_RECORD_MS).toBeLessThan(MAX_RECORD_MS);
  });
});
