import { describe, expect, test } from "bun:test";
import { CAPTURE_DISTANCE, FLING_VELOCITY, OPEN_RATIO, settleSwipe, shouldCaptureSwipe, swipeOffset } from "./swipe-row";

const WIDTH = 80;

describe("swipeOffset", () => {
  test("follows the finger from a closed row, to the left only", () => {
    expect(swipeOffset(0, -30, WIDTH)).toBe(-30);
    expect(swipeOffset(0, 25, WIDTH)).toBe(0);
  });

  test("stops at the action width", () => {
    expect(swipeOffset(0, -300, WIDTH)).toBe(-WIDTH);
    expect(swipeOffset(-WIDTH, -20, WIDTH)).toBe(-WIDTH);
  });

  test("an open row follows a drag back to the right, up to closed", () => {
    expect(swipeOffset(-WIDTH, 30, WIDTH)).toBe(-50);
    expect(swipeOffset(-WIDTH, 200, WIDTH)).toBe(0);
  });
});

describe("settleSwipe", () => {
  test("a fast fling to the left opens, to the right closes, whatever the offset", () => {
    expect(settleSwipe(-5, -FLING_VELOCITY, WIDTH)).toBe("open");
    expect(settleSwipe(-WIDTH, FLING_VELOCITY, WIDTH)).toBe("closed");
  });

  test("a slow release opens past the ratio and closes before it", () => {
    expect(settleSwipe(-WIDTH * OPEN_RATIO, 0, WIDTH)).toBe("open");
    expect(settleSwipe(-WIDTH * OPEN_RATIO + 1, 0, WIDTH)).toBe("closed");
    expect(settleSwipe(0, 0.1, WIDTH)).toBe("closed");
    expect(settleSwipe(-WIDTH, -0.1, WIDTH)).toBe("open");
  });
});

describe("shouldCaptureSwipe", () => {
  test("a clearly horizontal leftward move is taken over", () => {
    expect(shouldCaptureSwipe(-20, 3, false)).toBe(true);
  });

  test("small movement, vertical scrolling and diagonal moves are left to the page", () => {
    expect(shouldCaptureSwipe(-CAPTURE_DISTANCE, 0, false)).toBe(false);
    expect(shouldCaptureSwipe(-4, 0, false)).toBe(false);
    expect(shouldCaptureSwipe(-20, 40, false)).toBe(false);
    expect(shouldCaptureSwipe(-20, 15, false)).toBe(false);
  });

  test("a rightward move is ignored on a closed row but captured on an open one", () => {
    expect(shouldCaptureSwipe(30, 2, false)).toBe(false);
    expect(shouldCaptureSwipe(30, 2, true)).toBe(true);
  });
});
