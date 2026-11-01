import { describe, expect, test } from "bun:test";
import { aiReadiness, chatUrl, checkBaseUrl, maskKey } from "./ai-config";

describe("AI provider settings", () => {
  test("https base URLs are accepted and trimmed", () => {
    expect(checkBaseUrl(" https://api.openai.com/v1/ ")).toEqual({ ok: true, url: "https://api.openai.com/v1" });
    expect(checkBaseUrl("https://openrouter.ai/api/v1")).toEqual({ ok: true, url: "https://openrouter.ai/api/v1" });
  });

  test("plain http only for a server on the user's own network", () => {
    expect(checkBaseUrl("http://192.168.0.10:11434/v1").ok).toBe(true);
    expect(checkBaseUrl("http://localhost:1234/v1").ok).toBe(true);
    expect(checkBaseUrl("http://api.example.com/v1")).toEqual({ ok: false, reason: "insecure" });
    expect(checkBaseUrl("")).toEqual({ ok: false, reason: "empty" });
    expect(checkBaseUrl("ftp://x")).toEqual({ ok: false, reason: "invalid" });
  });

  test("the chat endpoint is added once", () => {
    expect(chatUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/chat/completions");
    expect(chatUrl("https://x.dev/v1/chat/completions/")).toBe("https://x.dev/v1/chat/completions");
  });

  test("readiness names what is missing", () => {
    const ai = { enabled: true, baseUrl: "https://api.openai.com/v1", model: "m" };
    expect(aiReadiness({ ...ai, enabled: false }, true)).toBe("off");
    expect(aiReadiness({ ...ai, baseUrl: "nope" }, true)).toBe("no-url");
    expect(aiReadiness({ ...ai, model: " " }, true)).toBe("no-model");
    expect(aiReadiness(ai, false)).toBe("no-key");
    expect(aiReadiness(ai, true)).toBe("ready");
  });

  test("a key is shown only by its end", () => {
    expect(maskKey("sk-abcdefgh1234")).toBe("••••1234");
    expect(maskKey("short")).toBe("••••");
  });
});
