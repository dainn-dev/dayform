import { describe, expect, test } from "bun:test";
import { mouthAt, pickVoice, speechLocale, speechMs, speechTimeline } from "./assistant-speech";

describe("voice choice", () => {
  const voices = [
    { identifier: "en-us-x-sfg-local", language: "en-US" },
    { identifier: "vi-vn-x-gft-network", language: "vi-VN" },
    { identifier: "vi-vn-x-gft-local", language: "vi-VN" },
    { identifier: "vi-VN-language", language: "vi_VN" },
  ];

  test("prefers an on-device voice of the app's language", () => {
    expect(pickVoice(voices, "vi")).toBe("vi-vn-x-gft-local");
    expect(pickVoice(voices, "en")).toBe("en-us-x-sfg-local");
  });

  test("a network voice is only taken when it is the only one", () => {
    expect(pickVoice([{ identifier: "vi-vn-x-gft-network", language: "vi-VN" }], "vi")).toBe("vi-vn-x-gft-network");
  });

  test("no voice for the language means silence, never a voice of another language", () => {
    expect(pickVoice([{ identifier: "en-us-x-sfg-local", language: "en-US" }], "vi")).toBeNull();
    expect(pickVoice([], "en")).toBeNull();
  });

  test("locales", () => {
    expect(speechLocale("vi")).toBe("vi-VN");
    expect(speechLocale("en")).toBe("en-US");
  });
});

describe("speech timeline", () => {
  test("Vietnamese has one syllable per word, with longer pauses at punctuation", () => {
    const plain = speechTimeline("Hôm nay có gì", "vi");
    expect(plain).toHaveLength(4);
    const paused = speechTimeline("Hôm nay. Có gì", "vi");
    expect(paused[2].start - paused[1].start).toBeGreaterThan(plain[2].start - plain[1].start);
  });

  test("English counts vowel groups", () => {
    expect(speechTimeline("hello", "en")).toHaveLength(2);
    expect(speechTimeline("make", "en")).toHaveLength(1);
  });

  test("punctuation alone says nothing and an empty line lasts no time", () => {
    expect(speechTimeline("… !", "vi")).toHaveLength(0);
    expect(speechMs(speechTimeline("", "vi"))).toBe(0);
  });

  test("the mouth opens inside a syllable and is shut between and after them", () => {
    const spans = speechTimeline("Ồ chào", "vi");
    const first = spans[0];
    expect(mouthAt(spans, (first.start + first.end) / 2)).toBeCloseTo(1, 5);
    expect(mouthAt(spans, first.end + 1)).toBe(0);
    expect(mouthAt(spans, speechMs(spans) + 100)).toBe(0);
  });
});
