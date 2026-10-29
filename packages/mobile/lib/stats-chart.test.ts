import { describe, expect, test } from "bun:test";
import { barLayout, maxPlannedMinutes, percentLabel, showMonthTick, categoryShare } from "./stats-chart";

describe("maxPlannedMinutes", () => {
  test("is 0 for no days and the largest planned value otherwise", () => {
    expect(maxPlannedMinutes([])).toBe(0);
    expect(maxPlannedMinutes([{ plannedMinutes: 30 }, { plannedMinutes: 90 }, { plannedMinutes: 0 }])).toBe(90);
  });
});

describe("barLayout", () => {
  test("empty days have no bar", () => {
    expect(barLayout(0, 0, 90, 100)).toEqual({ plannedPx: 0, donePx: 0 });
    expect(barLayout(0, 0, 0, 100)).toEqual({ plannedPx: 0, donePx: 0 });
  });
  test("scales planned against the busiest day and done against planned", () => {
    expect(barLayout(90, 45, 90, 100)).toEqual({ plannedPx: 100, donePx: 50 });
    expect(barLayout(45, 45, 90, 100)).toEqual({ plannedPx: 50, donePx: 50 });
  });
  test("keeps a visible minimum height and clamps done to planned", () => {
    expect(barLayout(1, 0, 600, 100)).toEqual({ plannedPx: 4, donePx: 0 });
    expect(barLayout(1, 1, 600, 100)).toEqual({ plannedPx: 4, donePx: 4 });
    expect(barLayout(30, 60, 30, 100)).toEqual({ plannedPx: 100, donePx: 100 });
  });
});

describe("categoryShare", () => {
  test("is the fraction of the largest category, 0 when nothing is planned", () => {
    expect(categoryShare(30, 60)).toBe(0.5);
    expect(categoryShare(0, 0)).toBe(0);
  });
});

describe("percentLabel", () => {
  test("rounds to a whole percent and dashes a null rate", () => {
    expect(percentLabel(null)).toBe("–");
    expect(percentLabel(0)).toBe("0%");
    expect(percentLabel(2 / 3)).toBe("67%");
    expect(percentLabel(1)).toBe("100%");
  });
});

describe("showMonthTick", () => {
  test("labels the 1st and every 5th day", () => {
    expect([1, 2, 5, 10, 15, 20, 25, 30, 31].map(showMonthTick)).toEqual([true, false, true, true, true, true, true, true, false]);
  });
});
