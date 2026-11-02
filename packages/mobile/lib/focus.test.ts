import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FOCUS_STATE, LONG_BREAK_MINUTES, elapsedFocusMinutes, endsAt, focusMinutesFor, focusMinutesIn, formatClock, isDue, nextRound,
  parseFocusText, pauseFocus, remainingMs, resumeFocus, setFocusPrefs, settleFocus, skipBreak, startFocus, stopFocus,
  type FocusLogEntry, type FocusState,
} from "./focus";

const MIN = 60_000;
// 2026-03-02 09:00 local.
const T0 = new Date(2026, 2, 2, 9, 0, 0).getTime();
const started = (taskId: string | null = "t1", minutes = 25): FocusState => startFocus(DEFAULT_FOCUS_STATE, T0, taskId, minutes);
const session = (state: FocusState) => {
  if (state.session === null) throw new Error("no session");
  return state.session;
};

describe("running", () => {
  test("starts a focus round of the chosen length and remembers the length", () => {
    const state = started("t1", 45);
    expect(session(state)).toMatchObject({ taskId: "t1", phase: "focus", durationMs: 45 * MIN, pausedAt: null, round: 0 });
    expect(state.prefs.focusMinutes).toBe(45);
  });

  test("remaining time counts down from the clock and never goes below zero", () => {
    const s = session(started());
    expect(remainingMs(s, T0)).toBe(25 * MIN);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(s, T0 + 99 * MIN)).toBe(0);
    expect(isDue(s, T0 + 24 * MIN)).toBe(false);
    expect(isDue(s, T0 + 25 * MIN)).toBe(true);
  });

  test("pausing freezes the remaining time and resuming pushes the end back by the pause", () => {
    const paused = pauseFocus(started(), T0 + 10 * MIN);
    expect(remainingMs(session(paused), T0 + 60 * MIN)).toBe(15 * MIN);
    expect(isDue(session(paused), T0 + 60 * MIN)).toBe(false);
    const resumed = resumeFocus(paused, T0 + 30 * MIN);
    expect(session(resumed).pausedAt).toBeNull();
    expect(endsAt(session(resumed))).toBe(T0 + 45 * MIN);
    expect(remainingMs(session(resumed), T0 + 30 * MIN)).toBe(15 * MIN);
  });

  test("pause and resume are no-ops in the wrong state", () => {
    const state = started();
    expect(resumeFocus(state, T0 + MIN)).toBe(state);
    const paused = pauseFocus(state, T0 + MIN);
    expect(pauseFocus(paused, T0 + 2 * MIN)).toBe(paused);
    expect(pauseFocus(DEFAULT_FOCUS_STATE, T0)).toBe(DEFAULT_FOCUS_STATE);
    expect(pauseFocus(state, T0 + 26 * MIN)).toBe(state);
  });
});

describe("settleFocus", () => {
  test("nothing happens before the end", () => {
    const state = started();
    expect(settleFocus(state, T0 + 24 * MIN)).toBe(state);
  });

  test("a finished round is logged in full and a break starts where the round ended", () => {
    const settled = settleFocus(started(), T0 + 26 * MIN);
    expect(settled.log).toEqual([{ date: "2026-03-02", taskId: "t1", minutes: 25, at: T0 + 25 * MIN }]);
    expect(session(settled)).toMatchObject({ phase: "break", startedAt: T0 + 25 * MIN, durationMs: 5 * MIN, round: 1, taskId: "t1" });
  });

  test("after a long absence the break is over too, and the log has one entry", () => {
    const settled = settleFocus(started(), T0 + 10 * 60 * MIN);
    expect(settled.session).toBeNull();
    expect(settled.log).toHaveLength(1);
  });

  test("a paused session is never settled", () => {
    const paused = pauseFocus(started(), T0 + 5 * MIN);
    expect(settleFocus(paused, T0 + 500 * MIN)).toBe(paused);
  });

  test("every fourth round is followed by a long break", () => {
    let state = started("t1", 25);
    let clock = T0;
    for (let round = 1; round <= 4; round += 1) {
      clock += 25 * MIN + 1;
      state = settleFocus(state, clock);
      const wanted = round === 4 ? LONG_BREAK_MINUTES : 5;
      expect(session(state)).toMatchObject({ phase: "break", round, durationMs: wanted * MIN });
      state = nextRound(state, clock);
      expect(session(state)).toMatchObject({ phase: "focus", round });
    }
  });

  test("the day of a log entry is the day the round ended", () => {
    const lateStart = new Date(2026, 2, 2, 23, 50).getTime();
    const settled = settleFocus(startFocus(DEFAULT_FOCUS_STATE, lateStart, null, 25), lateStart + 30 * MIN);
    expect(settled.log[0].date).toBe("2026-03-03");
    expect(settled.log[0].taskId).toBeNull();
  });
});

describe("stopFocus", () => {
  test("stopping early logs the whole minutes spent", () => {
    const stopped = stopFocus(started(), T0 + 12 * MIN + 40_000);
    expect(stopped.session).toBeNull();
    expect(stopped.log).toMatchObject([{ minutes: 12, taskId: "t1" }]);
  });

  test("under a minute logs nothing; time spent paused does not count", () => {
    expect(stopFocus(started(), T0 + 50_000).log).toEqual([]);
    const paused = pauseFocus(started(), T0 + 3 * MIN);
    expect(stopFocus(paused, T0 + 90 * MIN).log).toMatchObject([{ minutes: 3 }]);
  });

  test("stopping a break logs nothing", () => {
    const onBreak = settleFocus(started(), T0 + 26 * MIN);
    const stopped = stopFocus(onBreak, T0 + 27 * MIN);
    expect(stopped.session).toBeNull();
    expect(stopped.log).toHaveLength(1);
    expect(elapsedFocusMinutes(session(onBreak), T0 + 27 * MIN)).toBe(0);
  });

  test("skipBreak ends only a break", () => {
    const state = started();
    expect(skipBreak(state)).toBe(state);
    expect(skipBreak(settleFocus(state, T0 + 26 * MIN)).session).toBeNull();
  });
});

describe("log helpers", () => {
  const log: FocusLogEntry[] = [
    { date: "2026-03-01", taskId: "a", minutes: 25, at: 1 },
    { date: "2026-03-02", taskId: "a", minutes: 25, at: 2 },
    { date: "2026-03-02", taskId: null, minutes: 10, at: 3 },
    { date: "2026-03-09", taskId: "b", minutes: 50, at: 4 },
  ];

  test("minutes in a range, per day", () => {
    expect(focusMinutesIn(log, "2026-03-02", "2026-03-08")).toEqual({ total: 35, perDay: { "2026-03-02": 35 } });
    expect(focusMinutesIn(log, "2026-04-01", "2026-04-30")).toEqual({ total: 0, perDay: {} });
  });

  test("minutes for a task", () => {
    expect(focusMinutesFor(log, "a")).toBe(50);
    expect(focusMinutesFor(log, "zzz")).toBe(0);
  });

  test("the log keeps only the newest entries", () => {
    let state: FocusState = DEFAULT_FOCUS_STATE;
    for (let i = 0; i < 620; i += 1) state = settleFocus(startFocus(state, T0 + i * 60 * MIN, null, 1), T0 + i * 60 * MIN + 2 * MIN);
    expect(state.log).toHaveLength(600);
  });
});

test("prefs are clamped to a sensible range", () => {
  expect(setFocusPrefs(DEFAULT_FOCUS_STATE, { focusMinutes: 9999, breakMinutes: 0 }).prefs).toEqual({ focusMinutes: 240, breakMinutes: 1 });
});

test("formatClock rounds a partial second up", () => {
  expect(formatClock(25 * MIN)).toBe("25:00");
  expect(formatClock(59_001)).toBe("01:00");
  expect(formatClock(1)).toBe("00:01");
  expect(formatClock(0)).toBe("00:00");
  expect(formatClock(-5)).toBe("00:00");
});

describe("parseFocusText", () => {
  test("round-trips a state", () => {
    const state = pauseFocus(started(), T0 + MIN);
    expect(parseFocusText(JSON.stringify(state))).toEqual({ state, valid: true, lossy: false });
  });

  test("drops a broken session or log entry and says so", () => {
    const result = parseFocusText(JSON.stringify({ session: { phase: "nap" }, log: [{ date: "x" }, { date: "2026-03-02", taskId: null, minutes: 5, at: 1 }], prefs: { focusMinutes: "no" } }));
    expect(result.state.session).toBeNull();
    expect(result.state.log).toHaveLength(1);
    expect(result.state.prefs.focusMinutes).toBe(25);
    expect(result.lossy).toBe(true);
  });

  test("not JSON or not an object is invalid", () => {
    expect(parseFocusText("{").valid).toBe(false);
    expect(parseFocusText("[]").valid).toBe(false);
  });
});
