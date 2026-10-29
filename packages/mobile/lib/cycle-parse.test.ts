import { describe, test, expect } from "bun:test";
import {
  DEFAULT_CYCLE_STATE,
  MAX_PERIODS,
  cycleStateSchema,
  parseCycleState,
  parseCycleText,
  type CycleState,
} from "./cycle";
import { addDays } from "./planner";

const FULL: CycleState = {
  enabled: true, acknowledged: true, paused: false,
  periods: [{ start: "2026-04-22", end: "2026-04-26" }, { start: "2026-05-20" }],
  defaults: { cycleLength: 30, periodLength: 4 },
  reminders: { daysBefore: 2, time: "20:15", notifyLate: false, notifyFertile: true, neutralText: false },
  lock: { enabled: false, timeoutSec: 300 },
  showOnTimeline: true,
};

describe("parseCycleState", () => {
  test("an empty or non-object input resolves to the defaults", () => {
    expect(parseCycleState({})).toEqual(DEFAULT_CYCLE_STATE);
    expect(cycleStateSchema.parse({})).toEqual(DEFAULT_CYCLE_STATE);
    for (const raw of [null, undefined, 5, "text", [], true]) expect(parseCycleState(raw)).toEqual(DEFAULT_CYCLE_STATE);
  });

  test("a complete state is read back unchanged", () => {
    expect(parseCycleState(FULL)).toEqual(FULL);
  });

  test("every field falls back on its own", () => {
    const state = parseCycleState({
      enabled: "yes", acknowledged: 1, paused: null, showOnTimeline: {},
      defaults: { cycleLength: 99, periodLength: 3 },
      reminders: { daysBefore: 9, time: "25:00", notifyLate: "x", notifyFertile: true, neutralText: 0 },
      lock: { enabled: false, timeoutSec: 45 },
    });
    expect(state).toEqual({
      ...DEFAULT_CYCLE_STATE,
      defaults: { cycleLength: 28, periodLength: 3 },
      reminders: { daysBefore: 1, time: "09:00", notifyLate: true, notifyFertile: true, neutralText: true },
      lock: { enabled: false, timeoutSec: 60 },
    });
  });

  test("a group that is missing or not an object gets its own defaults", () => {
    const state = parseCycleState({ enabled: true, defaults: "bad", reminders: [], lock: 5 });
    expect(state).toEqual({ ...DEFAULT_CYCLE_STATE, enabled: true });
  });

  test("a non-array periods value is ignored", () => {
    expect(parseCycleState({ periods: "x" }).periods).toEqual([]);
    expect(parseCycleState({ periods: { 0: { start: "2026-05-20" } } }).periods).toEqual([]);
  });

  test("periods are sorted, canonical (start then end) and unknown fields are stripped", () => {
    const state = parseCycleState({
      periods: [{ end: "2026-05-24", start: "2026-05-20", note: "hi" }, { start: "2026-04-22" }],
    });
    expect(state.periods).toEqual([{ start: "2026-04-22" }, { start: "2026-05-20", end: "2026-05-24" }]);
    expect(JSON.stringify(state.periods[1])).toBe('{"start":"2026-05-20","end":"2026-05-24"}');
  });

  test("invalid, oversized, impossible-date and non-object periods are dropped one by one", () => {
    const state = parseCycleState({
      periods: [
        { start: "2026-02-30" },
        { start: "2026-05-20", end: "2026-05-19" },
        { start: "2026-05-20", end: "2026-06-10" },
        { start: "2026-06-01", end: 5 },
        { start: 5 },
        null, "2026-06-01", [], 7,
        { start: "2026-01-10", end: "2026-01-12" },
      ],
    });
    expect(state.periods).toEqual([{ start: "2026-01-10", end: "2026-01-12" }]);
  });

  test("duplicate and overlapping periods keep the earliest and drop the rest", () => {
    const state = parseCycleState({
      periods: [
        { start: "2026-05-20", end: "2026-05-24" },
        { start: "2026-05-20" },
        { start: "2026-05-22", end: "2026-05-23" },
        { start: "2026-05-24" },
        { start: "2026-05-25" },
      ],
    });
    expect(state.periods).toEqual([{ start: "2026-05-20", end: "2026-05-24" }, { start: "2026-05-25" }]);
  });

  test("keeps the newest MAX_PERIODS", () => {
    const periods = Array.from({ length: MAX_PERIODS + 5 }, (_, i) => ({ start: addDays("2018-01-01", i * 10) }));
    const state = parseCycleState({ periods });
    expect(state.periods).toHaveLength(MAX_PERIODS);
    expect(state.periods[0]).toEqual(periods[5]);
    expect(state.periods.at(-1)).toEqual(periods.at(-1));
  });

  test("a huge array is bounded before it is judged", () => {
    const periods = Array.from({ length: 5000 }, () => ({ start: "2026-05-20" }));
    expect(parseCycleState({ periods }).periods).toEqual([{ start: "2026-05-20" }]);
  });
});

describe("parseCycleText", () => {
  test("text that is not a JSON object is invalid and not lossy", () => {
    for (const text of ["{oops", "", "5", "null", "[]", '"x"']) {
      expect(parseCycleText(text)).toEqual({ valid: false, lossy: false, state: DEFAULT_CYCLE_STATE });
    }
  });

  test("a re-saved state never reads back as lossy", () => {
    const parsed = parseCycleText(JSON.stringify(FULL));
    expect(parsed).toEqual({ valid: true, lossy: false, state: FULL });
    expect(parseCycleText(JSON.stringify(parsed.state)).lossy).toBe(false);
    expect(parseCycleText(JSON.stringify(DEFAULT_CYCLE_STATE))).toEqual({ valid: true, lossy: false, state: DEFAULT_CYCLE_STATE });
  });

  test("an unsorted or repaired file is lossy so a copy is kept", () => {
    const unsorted = { ...FULL, periods: [...FULL.periods].reverse() };
    const parsed = parseCycleText(JSON.stringify(unsorted));
    expect(parsed.lossy).toBe(true);
    expect(parsed.state.periods).toEqual(FULL.periods);
    expect(parseCycleText(JSON.stringify({ ...FULL, periods: [...FULL.periods, { start: "2026-02-30" }] })).lossy).toBe(true);
    expect(parseCycleText(JSON.stringify({ ...FULL, extra: 1 })).lossy).toBe(true);
    expect(parseCycleText(JSON.stringify({ ...FULL, lock: { enabled: false, timeoutSec: 45 } })).lossy).toBe(true);
  });

  test("an empty object is valid and lossy (fields were filled in)", () => {
    expect(parseCycleText("{}")).toEqual({ valid: true, lossy: true, state: DEFAULT_CYCLE_STATE });
  });

  test("prototype-pollution keys have no effect and are flagged", () => {
    const text = '{"__proto__":{"enabled":true},"constructor":{"prototype":{"polluted":true}},"periods":[{"__proto__":{"x":1},"start":"2026-05-20"}],"defaults":{"__proto__":{"cycleLength":40}}}';
    const parsed = parseCycleText(text);
    expect(parsed.valid).toBe(true);
    expect(parsed.lossy).toBe(true);
    expect(parsed.state.enabled).toBe(false);
    expect(parsed.state.defaults.cycleLength).toBe(28);
    expect(parsed.state.periods).toEqual([{ start: "2026-05-20" }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).enabled).toBeUndefined();
  });
});
