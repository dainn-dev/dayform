import { describe, test, expect } from "bun:test";
import {
  CYCLE_KEY,
  DEFAULT_CYCLE_STATE,
  MAX_PERIODS,
  acknowledge,
  addPeriod,
  hasCycleData,
  mergeCycleState,
  removePeriod,
  setEnabled,
  setPaused,
  setShowOnTimeline,
  updateDefaults,
  updateLock,
  updatePeriod,
  updateReminders,
  validatePeriod,
  type CycleResult,
  type CycleState,
  type Period,
} from "./cycle";
import { addDays } from "./planner";

const TODAY = "2026-06-15";
const stateOf = (periods: Period[], patch: Partial<CycleState> = {}): CycleState => ({ ...DEFAULT_CYCLE_STATE, ...patch, periods });
function mustOk(result: CycleResult): CycleState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}
const reason = (result: CycleResult) => (result.ok ? "ok" : result.reason);

describe("defaults", () => {
  test("are off, unacknowledged, with the documented values", () => {
    expect(CYCLE_KEY).toBe("dayform.cycle.v1");
    expect(DEFAULT_CYCLE_STATE).toEqual({
      enabled: false, acknowledged: false, paused: false, periods: [],
      defaults: { cycleLength: 28, periodLength: 5 },
      reminders: { daysBefore: 1, time: "09:00", notifyLate: true, notifyFertile: false, neutralText: true },
      lock: { enabled: true, timeoutSec: 60 },
      showOnTimeline: false,
    });
    expect(MAX_PERIODS).toBe(240);
  });
});

describe("validatePeriod", () => {
  test("accepts a start today, a start in the past and a closed period", () => {
    expect(validatePeriod({ start: TODAY }, TODAY)).toBeNull();
    expect(validatePeriod({ start: "2026-06-01", end: "2026-06-05" }, TODAY)).toBeNull();
    expect(validatePeriod({ start: "2026-06-01", end: "2026-06-15" }, TODAY)).toBeNull();
  });

  test("refuses impossible dates, including a bad end or a null end", () => {
    expect(validatePeriod({ start: "2026-02-30" }, TODAY)).toBe("invalid-date");
    expect(validatePeriod({ start: "nope" }, TODAY)).toBe("invalid-date");
    expect(validatePeriod({ start: "2026-06-01", end: "2026-06-31" }, TODAY)).toBe("invalid-date");
    expect(validatePeriod({ start: "2026-06-01", end: null as unknown as string }, TODAY)).toBe("invalid-date");
  });

  test("accepts leap days only in leap years", () => {
    expect(validatePeriod({ start: "2024-02-29" }, "2024-03-10")).toBeNull();
    expect(validatePeriod({ start: "2026-02-29" }, TODAY)).toBe("invalid-date");
  });

  test("refuses a start after today", () => {
    expect(validatePeriod({ start: "2026-06-16" }, TODAY)).toBe("future");
  });

  test("refuses a start more than 10 years back, exactly 10 years is fine", () => {
    expect(validatePeriod({ start: "2016-06-15" }, TODAY)).toBeNull();
    expect(validatePeriod({ start: "2016-06-14" }, TODAY)).toBe("too-old");
  });

  test("refuses an end before the start and a span over 14 days", () => {
    expect(validatePeriod({ start: "2026-06-10", end: "2026-06-09" }, TODAY)).toBe("invalid-range");
    expect(validatePeriod({ start: "2026-05-01", end: "2026-05-15" }, TODAY)).toBeNull();
    expect(validatePeriod({ start: "2026-05-01", end: "2026-05-16" }, TODAY)).toBe("too-long");
  });
});

describe("addPeriod", () => {
  test("adds a period and keeps the list ordered by start, newest last", () => {
    let state = mustOk(addPeriod(DEFAULT_CYCLE_STATE, { start: "2026-05-20" }, TODAY));
    state = mustOk(addPeriod(state, { start: "2026-04-22", end: "2026-04-26" }, TODAY));
    state = mustOk(addPeriod(state, { start: "2026-06-10" }, TODAY));
    expect(state.periods).toEqual([
      { start: "2026-04-22", end: "2026-04-26" }, { start: "2026-05-20" }, { start: "2026-06-10" },
    ]);
  });

  test("never mutates the previous state or the input period", () => {
    const period: Period = { start: "2026-05-20", end: "2026-05-24" };
    const before = stateOf([{ start: "2026-04-22" }]);
    const snapshot = JSON.stringify(before);
    const next = mustOk(addPeriod(before, period, TODAY));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(next.periods[1]).not.toBe(period);
    expect(next.periods[1]).toEqual(period);
  });

  test("returns the validation failure", () => {
    expect(reason(addPeriod(DEFAULT_CYCLE_STATE, { start: "2026-06-16" }, TODAY))).toBe("future");
  });

  test("refuses duplicates and overlaps, adjacent days are fine", () => {
    const base = stateOf([{ start: "2026-05-20", end: "2026-05-24" }]);
    expect(reason(addPeriod(base, { start: "2026-05-20" }, TODAY))).toBe("overlap");
    expect(reason(addPeriod(base, { start: "2026-05-22", end: "2026-05-23" }, TODAY))).toBe("overlap");
    expect(reason(addPeriod(base, { start: "2026-05-18", end: "2026-05-20" }, TODAY))).toBe("overlap");
    expect(reason(addPeriod(base, { start: "2026-05-24" }, TODAY))).toBe("overlap");
    expect(reason(addPeriod(base, { start: "2026-05-25" }, TODAY))).toBe("ok");
    expect(reason(addPeriod(base, { start: "2026-05-19" }, TODAY))).toBe("ok");
  });

  test("an open period occupies only its start day", () => {
    const base = stateOf([{ start: "2026-05-20" }]);
    expect(reason(addPeriod(base, { start: "2026-05-21" }, TODAY))).toBe("ok");
    expect(reason(addPeriod(base, { start: "2026-05-18", end: "2026-05-20" }, TODAY))).toBe("overlap");
  });

  test("stops at MAX_PERIODS", () => {
    const periods = Array.from({ length: MAX_PERIODS }, (_, i) => ({ start: addDays("2018-01-01", i * 10) }));
    expect(reason(addPeriod(stateOf(periods), { start: "2026-06-15" }, TODAY))).toBe("limit");
    expect(reason(addPeriod(stateOf(periods.slice(1)), { start: "2026-06-15" }, TODAY))).toBe("ok");
  });
});

describe("updatePeriod", () => {
  const base = stateOf([{ start: "2026-04-22", end: "2026-04-26" }, { start: "2026-05-20" }]);

  test("replaces a period found by its start and re-sorts", () => {
    const state = mustOk(updatePeriod(base, "2026-05-20", { start: "2026-05-21", end: "2026-05-25" }, TODAY));
    expect(state.periods).toEqual([{ start: "2026-04-22", end: "2026-04-26" }, { start: "2026-05-21", end: "2026-05-25" }]);
    const moved = mustOk(updatePeriod(base, "2026-05-20", { start: "2026-03-01" }, TODAY));
    expect(moved.periods.map(p => p.start)).toEqual(["2026-03-01", "2026-04-22"]);
  });

  test("an unchanged period may keep its own days (no self-overlap)", () => {
    expect(reason(updatePeriod(base, "2026-04-22", { start: "2026-04-22", end: "2026-04-27" }, TODAY))).toBe("ok");
  });

  test("refuses an unknown start, an invalid result and an overlap with another period", () => {
    expect(reason(updatePeriod(base, "2026-01-01", { start: "2026-01-02" }, TODAY))).toBe("unknown-period");
    expect(reason(updatePeriod(base, "2026-05-20", { start: "2026-05-20", end: "2026-05-19" }, TODAY))).toBe("invalid-range");
    expect(reason(updatePeriod(base, "2026-05-20", { start: "2026-04-25" }, TODAY))).toBe("overlap");
  });
});

describe("removePeriod", () => {
  test("removes by start", () => {
    const state = mustOk(removePeriod(stateOf([{ start: "2026-04-22" }, { start: "2026-05-20" }]), "2026-04-22"));
    expect(state.periods).toEqual([{ start: "2026-05-20" }]);
  });

  test("an unknown start is refused", () => {
    expect(reason(removePeriod(DEFAULT_CYCLE_STATE, "2026-04-22"))).toBe("unknown-period");
  });
});

describe("switches", () => {
  test("setEnabled, acknowledge, setPaused and setShowOnTimeline set one field", () => {
    expect(mustOk(setEnabled(DEFAULT_CYCLE_STATE, true)).enabled).toBe(true);
    expect(mustOk(acknowledge(DEFAULT_CYCLE_STATE)).acknowledged).toBe(true);
    expect(mustOk(setPaused(DEFAULT_CYCLE_STATE, true)).paused).toBe(true);
    expect(mustOk(setShowOnTimeline(DEFAULT_CYCLE_STATE, true)).showOnTimeline).toBe(true);
  });

  test("switching to the current value returns the same state object", () => {
    expect(mustOk(setEnabled(DEFAULT_CYCLE_STATE, false))).toBe(DEFAULT_CYCLE_STATE);
    expect(mustOk(setPaused(DEFAULT_CYCLE_STATE, false))).toBe(DEFAULT_CYCLE_STATE);
    expect(mustOk(setShowOnTimeline(DEFAULT_CYCLE_STATE, false))).toBe(DEFAULT_CYCLE_STATE);
    const acked = mustOk(acknowledge(DEFAULT_CYCLE_STATE));
    expect(mustOk(acknowledge(acked))).toBe(acked);
  });

  test("a non-boolean is refused", () => {
    expect(reason(setEnabled(DEFAULT_CYCLE_STATE, "yes" as unknown as boolean))).toBe("invalid-value");
    expect(reason(setPaused(DEFAULT_CYCLE_STATE, 1 as unknown as boolean))).toBe("invalid-value");
    expect(reason(setShowOnTimeline(DEFAULT_CYCLE_STATE, null as unknown as boolean))).toBe("invalid-value");
  });

  test("keeps the periods and every other setting", () => {
    const base = stateOf([{ start: "2026-05-20" }], { paused: true });
    const next = mustOk(setEnabled(base, true));
    expect(next.periods).toEqual(base.periods);
    expect(next.paused).toBe(true);
    expect(next.reminders).toEqual(base.reminders);
  });
});

describe("updateDefaults", () => {
  test("changes only the given fields", () => {
    const state = mustOk(updateDefaults(DEFAULT_CYCLE_STATE, { cycleLength: 30 }));
    expect(state.defaults).toEqual({ cycleLength: 30, periodLength: 5 });
    expect(mustOk(updateDefaults(state, { periodLength: 7 })).defaults).toEqual({ cycleLength: 30, periodLength: 7 });
  });

  test("accepts the range edges and refuses outside values, fractions and NaN", () => {
    for (const cycleLength of [21, 45]) expect(reason(updateDefaults(DEFAULT_CYCLE_STATE, { cycleLength }))).toBe("ok");
    for (const periodLength of [1, 10]) expect(reason(updateDefaults(DEFAULT_CYCLE_STATE, { periodLength }))).toBe("ok");
    for (const cycleLength of [20, 46, 28.5, Number.NaN, "28" as unknown as number]) {
      expect(reason(updateDefaults(DEFAULT_CYCLE_STATE, { cycleLength }))).toBe("invalid-value");
    }
    for (const periodLength of [0, 11, 2.5]) expect(reason(updateDefaults(DEFAULT_CYCLE_STATE, { periodLength }))).toBe("invalid-value");
  });

  test("an empty or unchanged patch returns the same state", () => {
    expect(mustOk(updateDefaults(DEFAULT_CYCLE_STATE, {}))).toBe(DEFAULT_CYCLE_STATE);
    expect(mustOk(updateDefaults(DEFAULT_CYCLE_STATE, { cycleLength: 28 }))).toBe(DEFAULT_CYCLE_STATE);
  });
});

describe("updateReminders", () => {
  test("changes fields and keeps the rest", () => {
    const state = mustOk(updateReminders(DEFAULT_CYCLE_STATE, { daysBefore: 3, time: "21:30", notifyFertile: true }));
    expect(state.reminders).toEqual({ daysBefore: 3, time: "21:30", notifyLate: true, notifyFertile: true, neutralText: true });
    expect(mustOk(updateReminders(state, { notifyLate: false, neutralText: false })).reminders)
      .toEqual({ daysBefore: 3, time: "21:30", notifyLate: false, notifyFertile: true, neutralText: false });
  });

  test("validates days before, time and booleans", () => {
    for (const daysBefore of [0, 3]) expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { daysBefore }))).toBe("ok");
    for (const daysBefore of [-1, 4, 1.5]) expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { daysBefore }))).toBe("invalid-value");
    for (const time of ["00:00", "23:59"]) expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { time }))).toBe("ok");
    for (const time of ["24:00", "9:00", "09:60", "", "09:00:00"]) {
      expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { time }))).toBe("invalid-value");
    }
    expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { notifyLate: "no" as unknown as boolean }))).toBe("invalid-value");
    expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { notifyFertile: 0 as unknown as boolean }))).toBe("invalid-value");
    expect(reason(updateReminders(DEFAULT_CYCLE_STATE, { neutralText: undefined, time: 5 as unknown as string }))).toBe("invalid-value");
  });

  test("an unchanged patch returns the same state", () => {
    expect(mustOk(updateReminders(DEFAULT_CYCLE_STATE, {}))).toBe(DEFAULT_CYCLE_STATE);
    expect(mustOk(updateReminders(DEFAULT_CYCLE_STATE, { time: "09:00", daysBefore: 1 }))).toBe(DEFAULT_CYCLE_STATE);
  });
});

describe("updateLock", () => {
  test("accepts the four timeouts and the enabled switch", () => {
    for (const timeoutSec of [0, 30, 60, 300]) expect(mustOk(updateLock(DEFAULT_CYCLE_STATE, { timeoutSec })).lock.timeoutSec).toBe(timeoutSec);
    expect(mustOk(updateLock(DEFAULT_CYCLE_STATE, { enabled: false })).lock).toEqual({ enabled: false, timeoutSec: 60 });
  });

  test("refuses other timeouts and non-booleans", () => {
    for (const timeoutSec of [10, -1, 600, Number.NaN]) expect(reason(updateLock(DEFAULT_CYCLE_STATE, { timeoutSec }))).toBe("invalid-value");
    expect(reason(updateLock(DEFAULT_CYCLE_STATE, { enabled: "x" as unknown as boolean }))).toBe("invalid-value");
  });

  test("an unchanged patch returns the same state", () => {
    expect(mustOk(updateLock(DEFAULT_CYCLE_STATE, {}))).toBe(DEFAULT_CYCLE_STATE);
    expect(mustOk(updateLock(DEFAULT_CYCLE_STATE, { enabled: true, timeoutSec: 60 }))).toBe(DEFAULT_CYCLE_STATE);
  });
});

describe("hasCycleData", () => {
  test("is false for the defaults and true when enabled or any period exists", () => {
    expect(hasCycleData(DEFAULT_CYCLE_STATE)).toBe(false);
    expect(hasCycleData(stateOf([], { enabled: true }))).toBe(true);
    expect(hasCycleData(stateOf([{ start: "2026-05-20" }]))).toBe(true);
    expect(hasCycleData(stateOf([], { paused: true, acknowledged: true, showOnTimeline: true }))).toBe(false);
  });
});

describe("mergeCycleState", () => {
  const current = stateOf([{ start: "2026-04-22" }, { start: "2026-05-20" }], { enabled: true, defaults: { cycleLength: 30, periodLength: 4 } });
  const incoming = stateOf([{ start: "2026-03-25" }, { start: "2026-05-21" }, { start: "2026-04-22", end: "2026-04-26" }], {
    enabled: false, defaults: { cycleLength: 24, periodLength: 6 }, paused: true,
  });

  test("replace takes the incoming state as it is", () => {
    expect(mergeCycleState(current, incoming, "replace")).toBe(incoming);
  });

  test("merge unions periods, skipping duplicates and overlaps, and keeps the current settings", () => {
    const merged = mergeCycleState(current, incoming, "merge");
    expect(merged.periods).toEqual([{ start: "2026-03-25" }, { start: "2026-04-22" }, { start: "2026-05-20" }, { start: "2026-05-21" }]);
    expect(merged.enabled).toBe(true);
    expect(merged.paused).toBe(false);
    expect(merged.defaults).toEqual({ cycleLength: 30, periodLength: 4 });
    expect(current.periods).toHaveLength(2);
  });

  test("merge with nothing new returns the current state object", () => {
    expect(mergeCycleState(current, stateOf([{ start: "2026-04-22" }]), "merge")).toBe(current);
    expect(mergeCycleState(current, DEFAULT_CYCLE_STATE, "merge")).toBe(current);
  });

  test("merge keeps at most MAX_PERIODS, dropping the oldest", () => {
    const many = Array.from({ length: MAX_PERIODS }, (_, i) => ({ start: addDays("2020-01-01", i * 10) }));
    const extra = [{ start: "2019-01-01" }, { start: "2019-02-01" }];
    const merged = mergeCycleState(stateOf(many), stateOf(extra), "merge");
    expect(merged.periods).toHaveLength(MAX_PERIODS);
    expect(merged.periods[0]).toEqual(many[0]);
    const newer = mergeCycleState(stateOf(many), stateOf([{ start: addDays("2020-01-01", MAX_PERIODS * 10) }]), "merge");
    expect(newer.periods).toHaveLength(MAX_PERIODS);
    expect(newer.periods[0]).toEqual(many[1]);
  });
});
