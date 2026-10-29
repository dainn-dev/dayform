import { describe, expect, test } from "bun:test";
import {
  FAB_GAP, FAB_MARGIN, FAB_SIZE, TAB_BAR_BASE_HEIGHT, UNDO_TIMEOUT_MS, UNDO_TIMEOUT_SCREEN_READER_MS,
  tabBarHeight, undoBarBottom, undoTimeout,
} from "./shell-layout";

describe("tabBarHeight", () => {
  test("is the base height with no inset", () => {
    expect(tabBarHeight(0)).toBe(TAB_BAR_BASE_HEIGHT);
  });

  test("grows with the bottom inset (gesture nav ~24, 3-button ~48)", () => {
    expect(tabBarHeight(24)).toBe(TAB_BAR_BASE_HEIGHT + 24);
    expect(tabBarHeight(48)).toBe(TAB_BAR_BASE_HEIGHT + 48);
  });

  test("ignores negative or non-finite insets", () => {
    expect(tabBarHeight(-5)).toBe(TAB_BAR_BASE_HEIGHT);
    expect(tabBarHeight(Number.NaN)).toBe(TAB_BAR_BASE_HEIGHT);
  });
});

describe("undoBarBottom", () => {
  test("sits above the tab bar and the floating action button row", () => {
    expect(undoBarBottom(48)).toBe(tabBarHeight(48) + FAB_MARGIN + FAB_SIZE + FAB_GAP);
    expect(undoBarBottom(48)).toBeGreaterThan(tabBarHeight(48) + FAB_MARGIN + FAB_SIZE);
  });
});

describe("undoTimeout", () => {
  test("uses the default window without a screen reader", () => {
    expect(undoTimeout(false)).toBe(UNDO_TIMEOUT_MS);
  });

  test("is longer with a screen reader", () => {
    expect(undoTimeout(true)).toBe(UNDO_TIMEOUT_SCREEN_READER_MS);
    expect(UNDO_TIMEOUT_SCREEN_READER_MS).toBeGreaterThan(UNDO_TIMEOUT_MS);
  });
});
