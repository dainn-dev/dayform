import { describe, expect, test } from "bun:test";
import { liftAbove } from "./assistant-place";

describe("liftAbove", () => {
  const box = { height: 112, minY: 40, gap: 8 };

  test("an assistant the sheet would cover steps up to stand just above it", () => {
    expect(liftAbove(700, 600, box)).toBe(600 - 8 - 112);
  });

  test("an assistant already clear of the sheet stays where it is", () => {
    expect(liftAbove(300, 600, box)).toBeNull();
    // Exactly touching the gap counts as clear.
    expect(liftAbove(600 - 8 - 112, 600, box)).toBeNull();
  });

  test("never goes above the top edge, even when the sheet leaves no room", () => {
    expect(liftAbove(500, 100, box)).toBe(40);
  });
});
