import { describe, expect, test } from "bun:test";
import { HIDDEN_KEYBOARD, contentBottomPadding, footerLift, keyboardFromMetrics, nextScrollY, revealDelta } from "./keyboard-inset";

describe("keyboardFromMetrics", () => {
  test("reports the height and the top edge of a visible keyboard", () => {
    expect(keyboardFromMetrics({ screenY: 500, height: 300 }, 800)).toEqual({ height: 300, top: 500 });
  });

  test("derives the top edge from the window height when the platform gives no screenY", () => {
    expect(keyboardFromMetrics({ screenY: 0, height: 300 }, 800)).toEqual({ height: 300, top: 500 });
  });

  test("treats a keyboard whose top is at or below the window as hidden (iOS frame change)", () => {
    expect(keyboardFromMetrics({ screenY: 800, height: 300 }, 800)).toEqual(HIDDEN_KEYBOARD);
    expect(keyboardFromMetrics({ screenY: 900, height: 300 }, 800)).toEqual(HIDDEN_KEYBOARD);
  });

  test("treats an empty frame as hidden", () => {
    expect(keyboardFromMetrics({ screenY: 500, height: 0 }, 800)).toEqual(HIDDEN_KEYBOARD);
    expect(keyboardFromMetrics({ screenY: 500, height: -4 }, 800)).toEqual(HIDDEN_KEYBOARD);
  });
});

describe("footerLift", () => {
  test("the bar rises by the part of the keyboard above the navigation-bar inset", () => {
    expect(footerLift(300, 48)).toBe(252);
    expect(footerLift(300, 0)).toBe(300);
  });

  test("never negative: a short keyboard or a large inset gives no lift, and a hidden keyboard gives none", () => {
    expect(footerLift(40, 48)).toBe(0);
    expect(footerLift(0, 48)).toBe(0);
    expect(footerLift(-5, 0)).toBe(0);
  });

  test("a negative inset is treated as none", () => {
    expect(footerLift(300, -10)).toBe(300);
  });
});

describe("contentBottomPadding", () => {
  test("keeps the base padding while the keyboard is hidden", () => {
    expect(contentBottomPadding(32, 0)).toBe(32);
  });

  test("adds the keyboard height to the base padding", () => {
    expect(contentBottomPadding(32, 300)).toBe(332);
  });

  test("ignores a negative height", () => {
    expect(contentBottomPadding(32, -10)).toBe(32);
  });
});

describe("revealDelta", () => {
  const view = { viewportTop: 100, visibleBottom: 500, margin: 16 };

  test("is 0 when the field is fully visible with its margin", () => {
    expect(revealDelta({ fieldTop: 200, fieldBottom: 260, ...view })).toBe(0);
  });

  test("scrolls down by the amount the field (plus margin) is covered", () => {
    expect(revealDelta({ fieldTop: 480, fieldBottom: 560, ...view })).toBe(76);
  });

  test("scrolls up when the field is above the viewport", () => {
    expect(revealDelta({ fieldTop: 90, fieldBottom: 150, ...view })).toBe(-26);
  });

  test("prefers the bottom of a field taller than the visible area (where the user types)", () => {
    expect(revealDelta({ fieldTop: 150, fieldBottom: 700, ...view })).toBe(216);
  });

  test("is 0 for a field that exactly fits with its margins", () => {
    expect(revealDelta({ fieldTop: 116, fieldBottom: 484, ...view })).toBe(0);
  });
});

describe("nextScrollY", () => {
  test("adds the delta", () => {
    expect(nextScrollY(40, 76)).toBe(116);
  });

  test("never goes above the top", () => {
    expect(nextScrollY(10, -50)).toBe(0);
  });
});
