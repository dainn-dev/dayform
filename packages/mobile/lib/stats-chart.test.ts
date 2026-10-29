import { describe, expect, test } from "bun:test";
import { barLayout, breakdownIds, maxPlannedMinutes, percentLabel, showMonthTick, categoryShare } from "./stats-chart";

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

describe("breakdownIds", () => {
  const stat = (plannedMinutes: number, count = plannedMinutes > 0 ? 1 : 0) => ({ plannedMinutes, doneMinutes: 0, count });
  const builtins = { Focus: stat(0), Work: stat(0), Personal: stat(0), Wellness: stat(0) };
  const visible = ["Focus", "Work", "Personal", "Wellness"];

  test("lists the built-ins in their fixed order whatever their minutes", () => {
    const per = { ...builtins, Focus: stat(10), Wellness: stat(300) };
    expect(breakdownIds(per, visible)).toEqual(["Focus", "Work", "Personal", "Wellness"]);
  });
  test("puts other ids after the built-ins, most planned minutes first", () => {
    const per = { ...builtins, c_a0000000: stat(30), c_b0000000: stat(90), c_gone0000: stat(60) };
    expect(breakdownIds(per, [...visible, "c_a0000000", "c_b0000000"])).toEqual(["Focus", "Work", "Personal", "Wellness", "c_b0000000", "c_gone0000", "c_a0000000"]);
  });
  test("a visible custom category with no time still gets a row, in visible order on a tie", () => {
    const per = { ...builtins, c_b0000000: stat(0) };
    expect(breakdownIds(per, [...visible, "c_a0000000", "c_b0000000"]).slice(4)).toEqual(["c_a0000000", "c_b0000000"]);
  });
  test("a hidden built-in only shows while it has tasks", () => {
    const per = { ...builtins, Work: stat(20) };
    expect(breakdownIds(per, ["Focus", "Personal", "Wellness"])).toEqual(["Focus", "Work", "Personal", "Wellness"]);
    expect(breakdownIds(builtins, ["Focus", "Personal", "Wellness"])).toEqual(["Focus", "Personal", "Wellness"]);
  });
  test("an id that is neither visible nor used is not listed", () => {
    expect(breakdownIds({ ...builtins, c_old00000: stat(0, 0) }, visible)).toEqual(visible);
  });
});
