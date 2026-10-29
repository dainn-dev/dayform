import { describe, expect, test } from "bun:test";
import { DEFAULT_CYCLE_STATE, type CycleState, type Period } from "./cycle";
import { dayActions, failureText, openPeriod, periodAt, periodRows, quickActions, shiftMonth, suggestedEnd } from "./cycle-ui-actions";

const stateOf = (periods: Period[]): CycleState => ({ ...DEFAULT_CYCLE_STATE, enabled: true, periods });
const TODAY = "2026-03-10";

describe("periodAt and openPeriod", () => {
  const state = stateOf([{ start: "2026-02-01", end: "2026-02-05" }, { start: "2026-03-08" }]);

  test("finds the period containing a day", () => {
    expect(periodAt(state, "2026-02-03", TODAY)?.start).toBe("2026-02-01");
    expect(periodAt(state, "2026-02-06", TODAY)).toBeNull();
    expect(periodAt(state, "2026-03-08", TODAY)?.start).toBe("2026-03-08");
  });

  test("an open period covers the days up to today, but not forever", () => {
    expect(periodAt(state, "2026-03-10", TODAY)?.start).toBe("2026-03-08");
    expect(periodAt(stateOf([{ start: "2026-01-01" }]), "2026-02-20", TODAY)).toBeNull();
  });

  test("an open period is one without an end that has begun", () => {
    expect(openPeriod(state, TODAY)?.start).toBe("2026-03-08");
    expect(openPeriod(stateOf([{ start: "2026-02-01", end: "2026-02-05" }]), TODAY)).toBeNull();
    expect(openPeriod(stateOf([{ start: "2026-01-01" }]), TODAY)).toBeNull();
  });
});

describe("quickActions", () => {
  test("offers Start when today is free and End while a period is open", () => {
    expect(quickActions(stateOf([]), TODAY)).toEqual({ canStart: true, open: null });
    const open = quickActions(stateOf([{ start: "2026-03-08" }]), TODAY);
    expect(open.canStart).toBe(false);
    expect(open.open?.start).toBe("2026-03-08");
  });

  test("a finished period that does not include today still allows Start", () => {
    expect(quickActions(stateOf([{ start: "2026-03-01", end: "2026-03-05" }]), TODAY).canStart).toBe(true);
  });
});

describe("dayActions", () => {
  const state = stateOf([{ start: "2026-02-01", end: "2026-02-05" }, { start: "2026-03-08" }]);

  test("a free past day can start a period", () => {
    expect(dayActions(state, "2026-02-20", TODAY)).toEqual(["start-here"]);
  });

  test("a logged day can be edited or deleted", () => {
    expect(dayActions(state, "2026-02-03", TODAY)).toEqual(["edit-period", "remove-period"]);
  });

  test("a later day of an open period can end it", () => {
    expect(dayActions(state, "2026-03-10", TODAY)).toEqual(["end-here", "edit-period", "remove-period"]);
    expect(dayActions(state, "2026-03-08", TODAY)).toEqual(["edit-period", "remove-period"]);
  });

  test("future days offer nothing", () => {
    expect(dayActions(state, "2026-03-11", TODAY)).toEqual([]);
  });
});

describe("periodRows", () => {
  test("lists newest first with inclusive lengths; an open one counts to today", () => {
    const rows = periodRows(stateOf([{ start: "2026-02-01", end: "2026-02-05" }, { start: "2026-03-08" }]), TODAY);
    expect(rows.map(row => row.period.start)).toEqual(["2026-03-08", "2026-02-01"]);
    expect(rows.map(row => row.days)).toEqual([3, 5]);
    expect(rows.map(row => row.ongoing)).toEqual([true, false]);
  });
});

describe("suggestedEnd", () => {
  test("is the usual length after the start, never after today", () => {
    expect(suggestedEnd("2026-03-01", 5, TODAY)).toBe("2026-03-05");
    expect(suggestedEnd("2026-03-08", 5, TODAY)).toBe(TODAY);
  });
});

describe("failureText", () => {
  test("has a sentence for every failure", () => {
    for (const reason of ["invalid-date", "future", "too-old", "invalid-range", "too-long", "overlap", "limit", "unknown-period", "invalid-value", "write-failed", "locked"] as const) {
      expect(failureText(reason).length).toBeGreaterThan(5);
    }
  });
});

describe("shiftMonth", () => {
  test("moves across year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 3 }, 0)).toEqual({ year: 2026, month: 3 });
  });

  test("stays inside the supported years", () => {
    expect(shiftMonth({ year: 1900, month: 1 }, -1)).toEqual({ year: 1900, month: 1 });
    expect(shiftMonth({ year: 2199, month: 12 }, 1)).toEqual({ year: 2199, month: 12 });
  });
});
