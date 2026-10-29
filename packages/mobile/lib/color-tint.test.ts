import { describe, expect, test } from "bun:test";
import { withAlpha } from "./color-tint";

describe("withAlpha", () => {
  test("converts a 6-digit hex", () => {
    expect(withAlpha("#5A78DD", 0.5)).toBe("rgba(90, 120, 221, 0.5)");
  });

  test("converts a 3-digit hex", () => {
    expect(withAlpha("#0af", 0.2)).toBe("rgba(0, 170, 255, 0.2)");
  });

  test("replaces the alpha of an 8-digit hex", () => {
    expect(withAlpha("#5A78DD80", 0.25)).toBe("rgba(90, 120, 221, 0.25)");
  });

  test("replaces the alpha of a 4-digit hex", () => {
    expect(withAlpha("#0af8", 1)).toBe("rgba(0, 170, 255, 1)");
  });

  test("accepts rgb() and rgba()", () => {
    expect(withAlpha("rgb(1, 2, 3)", 0.1)).toBe("rgba(1, 2, 3, 0.1)");
    expect(withAlpha("rgba(1, 2, 3, 0.9)", 0.1)).toBe("rgba(1, 2, 3, 0.1)");
  });

  test("clamps alpha into 0..1", () => {
    expect(withAlpha("#000000", 3)).toBe("rgba(0, 0, 0, 1)");
    expect(withAlpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });

  test("returns the input unchanged when it cannot be parsed", () => {
    expect(withAlpha("transparent", 0.5)).toBe("transparent");
    expect(withAlpha("#12", 0.5)).toBe("#12");
  });
});
