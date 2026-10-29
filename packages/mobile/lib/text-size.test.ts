import { describe, test, expect } from "bun:test";
import { utf8Length } from "./text-size";

const encoded = (text: string): number => new TextEncoder().encode(text).length;

describe("utf8Length", () => {
  test("counts ASCII, 2-, 3- and 4-byte characters", () => {
    expect(utf8Length("")).toBe(0);
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("ế")).toBe(3);
    expect(utf8Length("€")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
    expect(utf8Length("aé€😀")).toBe(10);
  });

  test("counts a lone surrogate as 3 bytes, like TextEncoder's replacement character", () => {
    expect(utf8Length("\ud83d")).toBe(3);
    expect(utf8Length("\ude00")).toBe(3);
    expect(utf8Length("\ud83dx")).toBe(4);
    expect(utf8Length("\ud83d\ud83d")).toBe(6);
    expect(utf8Length("\ud83d\ud83d\ude00")).toBe(7);
    expect(utf8Length("\ude00\ud83d")).toBe(6);
  });

  test("matches TextEncoder on a mix of tricky strings", () => {
    const samples = [
      "", "plain", "Tiếng Việt có dấu", "😀😀😀", "a\ud83d", "\ud83d", "\ude00", "\ud83d\ude00\ud83d",
      "x\ude00y", "\u0000\u007f\u0080\u07ff\u0800\uffff", "\ud7ff\ue000", "👨‍👩‍👧‍👦", "🇻🇳",
      "\ud83d\ud83d\ud83d\ude00\ude00",
    ];
    for (const sample of samples) expect(utf8Length(sample)).toBe(encoded(sample));
  });

  test("matches TextEncoder for every single UTF-16 code unit", () => {
    for (let code = 0; code <= 0xffff; code += 1) {
      const text = String.fromCharCode(code);
      expect(utf8Length(text)).toBe(encoded(text));
    }
  });
});
