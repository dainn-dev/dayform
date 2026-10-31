import { describe, expect, test } from "bun:test";
import { mouthAt, pickVoice, speakableText, speechLocale, speechMs, speechTimeline, voiceNeedsNetwork, voicePitch, voicesFor } from "./assistant-speech";

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

  test("the user's choice wins while the phone still has it for this language", () => {
    expect(pickVoice(voices, "vi", "vi-vn-x-gft-network")).toBe("vi-vn-x-gft-network");
    expect(pickVoice(voices, "vi", "gone-voice")).toBe("vi-vn-x-gft-local");
    expect(pickVoice(voices, "en", "vi-vn-x-gft-local")).toBe("en-us-x-sfg-local");
  });

  test("the voices of a language are listed best first, and their ids tell on-device from network", () => {
    expect(voicesFor(voices, "vi").map(voice => voice.identifier)).toEqual(["vi-vn-x-gft-local", "vi-VN-language", "vi-vn-x-gft-network"]);
    expect(voiceNeedsNetwork({ identifier: "vi-vn-x-gft-network", language: "vi-VN" })).toBe(true);
    expect(voiceNeedsNetwork({ identifier: "vi-vn-x-gft-local", language: "vi-VN" })).toBe(false);
    expect(voiceNeedsNetwork({ identifier: "vivo-vi", language: "vi-VN" })).toBeNull();
  });

  test("Vietnamese keeps the natural pitch", () => {
    expect(voicePitch("vi")).toBe(1);
    expect(voicePitch("en")).toBeGreaterThan(1);
  });

  test("locales", () => {
    expect(speechLocale("vi")).toBe("vi-VN");
    expect(speechLocale("en")).toBe("en-US");
  });
});

describe("speakable text", () => {
  test("fractions are said as words", () => {
    expect(speakableText("Đã xong 1/3 việc.", "vi")).toBe("Đã xong 1 trên 3 việc.");
    expect(speakableText("2/5 done.", "en")).toBe("2 of 5 done.");
  });

  test("Vietnamese times are said as hours and minutes; English ones are left to the engine", () => {
    expect(speakableText("Tiếp theo: Họp lúc 09:45.", "vi")).toBe("Tiếp theo: Họp lúc 9 giờ 45.");
    expect(speakableText("lúc 14:00.", "vi")).toBe("lúc 14 giờ.");
    expect(speakableText("at 9:45 AM.", "en")).toBe("at 9:45 AM.");
  });

  test("ellipses become a plain pause", () => {
    expect(speakableText("Buồn ngủ quá… chạm để gọi mình dậy nhé.", "vi")).toBe("Buồn ngủ quá, chạm để gọi mình dậy nhé.");
    expect(speakableText("Để mình xem nào…", "vi")).toBe("Để mình xem nào.");
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
