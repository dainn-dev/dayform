import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { rankOf, realmStart } from "./realm";
import {
  claimTasks, DAILY_CAP, EMPTY_XP, isLateAdded, mergeXp, parseXpText, penaltyFor, restAvailable, restLeft, revokeTasks, settleDays,
  streakFactor, taskXp, todayXp, type XpState,
} from "./xp";

let counter = 0;
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`);
/** A task created on `created` (a day, at 08:00 local) for `date`. */
const task = (over: Partial<Task> & { created?: string }): Task => {
  const { created = "2026-10-01", ...rest } = over;
  return {
    id: `t${counter++}`, title: "Task", date: "2026-10-10", start: "09:00", duration: 30, status: "done", category: "Focus", notes: "",
    createdAt: at(created, 8).toISOString(), ...rest,
  };
};
const started = (day: string): XpState => settleDays(EMPTY_XP, at(day)).state;

describe("experience for a task", () => {
  const now = at("2026-10-10");
  test("is worth more for a longer task, up to a cap, and at least 10", () => {
    expect(taskXp(task({ duration: 5 }), now)).toBe(10);
    expect(taskXp(task({ duration: 30 }), now)).toBe(20);
    expect(taskXp(task({ duration: 60 }), now)).toBe(40);
    expect(taskXp(task({ duration: 600 }), now)).toBe(60);
  });

  test("depends on when it was planned for", () => {
    expect(taskXp(task({ date: null, start: null }), now)).toBe(16);
    expect(taskXp(task({ date: "2026-10-09" }), now)).toBe(12);
    expect(taskXp(task({ date: "2026-10-11" }), now)).toBe(10);
  });

  test("a task ticked within two minutes of being created earns a quarter", () => {
    const quick = task({ created: "2026-10-10" });
    quick.createdAt = new Date(now.getTime() - 60_000).toISOString();
    expect(taskXp(quick, now)).toBe(5);
  });

  test("a task added after the fact earns nothing: planned for a day that was already over when it was created", () => {
    const backfilled = task({ created: "2026-10-10", date: "2026-10-09" });
    expect(isLateAdded(backfilled)).toBe(true);
    expect(taskXp(backfilled, now)).toBe(0);
    expect(isLateAdded(task({ created: "2026-10-10", date: "2026-10-10" }))).toBe(false);
    expect(isLateAdded(task({ created: "2026-10-10", date: "2026-10-12" }))).toBe(false);
    expect(isLateAdded(task({ created: "2026-10-10", date: null, start: null }))).toBe(false);
    // A task planned ahead and finished late is only worth less, not nothing.
    expect(taskXp(task({ created: "2026-10-01", date: "2026-10-09" }), now)).toBe(12);
  });
});

describe("earning and taking back", () => {
  test("a finished task earns once, and finishing it again earns nothing more", () => {
    const done = task({});
    const first = claimTasks(started("2026-10-10"), [done], at("2026-10-10"));
    expect(first.gained).toBe(20);
    expect(first.state.total).toBe(20);
    expect(claimTasks(first.state, [done], at("2026-10-10")).gained).toBe(0);
    expect(claimTasks(first.state, [{ ...done, status: "todo" }], at("2026-10-10")).state).toBe(first.state);
  });

  test("undoing the completion takes back exactly what it gave", () => {
    const done = task({});
    const first = claimTasks(started("2026-10-10"), [done], at("2026-10-10"));
    const back = revokeTasks(first.state, [done.id]);
    expect(back.total).toBe(0);
    expect(back.claimed[done.id]).toBeUndefined();
    expect(todayXp(back, at("2026-10-10"))).toBe(0);
    expect(revokeTasks(back, [done.id])).toBe(back);
  });

  test("a day earns at most the daily cap", () => {
    const many = Array.from({ length: 30 }, () => task({ duration: 60 }));
    const result = claimTasks(started("2026-10-10"), many, at("2026-10-10"));
    expect(result.state.total).toBe(DAILY_CAP);
  });

  test("a task added after the fact earns nothing and is no day of work", () => {
    const backfilled = task({ created: "2026-10-10", date: "2026-10-09" });
    const result = claimTasks(started("2026-10-10"), [backfilled], at("2026-10-10"));
    expect(result.gained).toBe(0);
    expect(result.state.days["2026-10-10"]?.done ?? 0).toBe(0);
    expect(result.state.claimed[backfilled.id]).toEqual({ xp: 0, day: "2026-10-10" });
    // Moving its date to today afterwards cannot make it earn.
    expect(claimTasks(result.state, [{ ...backfilled, date: "2026-10-10" }], at("2026-10-10")).gained).toBe(0);
  });

  test("a rank up is reported", () => {
    const big = task({ duration: 60 });
    expect(claimTasks(started("2026-10-10"), [big], at("2026-10-10")).rankUp).toBe(true);
    expect(claimTasks(started("2026-10-10"), [task({ duration: 15 })], at("2026-10-10")).rankUp).toBe(false);
  });

  test("a streak raises the experience", () => {
    expect(streakFactor(2)).toBe(1);
    expect(streakFactor(3)).toBe(1.1);
    expect(streakFactor(7)).toBe(1.25);
    expect(streakFactor(30)).toBe(1.5);
    const state = { ...started("2026-10-10"), streak: 7 };
    expect(claimTasks(state, [task({})], at("2026-10-10")).gained).toBe(25);
  });
});

describe("judging the days", () => {
  const worked = (...days: string[]): XpState => ({
    ...started(days[0]),
    days: Object.fromEntries(days.map(day => [day, { xp: 20, done: 1 }])),
  });

  test("the first call only starts the clock", () => {
    const result = settleDays(EMPTY_XP, at("2026-10-10"));
    expect(result.state.startDay).toBe("2026-10-10");
    expect(result.events).toEqual([]);
  });

  test("days with a finished task grow the streak", () => {
    const state = worked("2026-10-10", "2026-10-11", "2026-10-12");
    const result = settleDays(state, at("2026-10-13"));
    expect(result.state.streak).toBe(3);
    expect(result.state.best).toBe(3);
    expect(result.state.settledDay).toBe("2026-10-12");
    expect(settleDays(result.state, at("2026-10-13")).state).toBe(result.state);
  });

  test("an empty day is a rest day while the week and the month allow it, and it keeps the streak", () => {
    const state = { ...worked("2026-10-12"), streak: 5 };
    const result = settleDays(state, at("2026-10-14"));
    expect(result.events).toEqual([{ type: "rest", day: "2026-10-13" }]);
    expect(result.state.streak).toBe(6);
    expect(result.state.total).toBe(0);
    expect(restLeft(result.state, at("2026-10-14"))).toEqual({ week: 0, month: 3 });
  });

  test("a second empty day in the same week costs experience and ends the streak", () => {
    const state: XpState = { ...worked("2026-10-12"), total: 500, streak: 4 };
    const result = settleDays(state, at("2026-10-15"));
    expect(result.events.map(event => event.type)).toEqual(["rest", "penalty"]);
    expect(result.state.total).toBe(460);
    expect(result.state.streak).toBe(0);
    expect(result.state.penaltyStreak).toBe(1);
  });

  test("a new week and a new month bring new rest days, up to four a month", () => {
    expect(restAvailable(["2026-10-05"], "2026-10-12")).toBe(true);
    expect(restAvailable(["2026-10-05"], "2026-10-07")).toBe(false);
    expect(restAvailable(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"], "2026-10-27")).toBe(false);
    expect(restAvailable(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"], "2026-11-02")).toBe(true);
  });

  test("a penalty grows with each day in a row, and a day of work resets it", () => {
    expect(penaltyFor(10_000, 1).amount).toBe(40);
    expect(penaltyFor(10_000, 3).amount).toBe(120);
    expect(penaltyFor(10_000, 50).amount).toBe(200);
    let state: XpState = { ...started("2026-10-01"), total: 1000, restDays: ["2026-10-01"] };
    state = settleDays(state, at("2026-10-04")).state;
    expect(state.penaltyStreak).toBe(3);
    state = { ...state, days: { "2026-10-04": { xp: 20, done: 1 } } };
    expect(settleDays(state, at("2026-10-05")).state.penaltyStreak).toBe(0);
  });

  test("a first or second penalty cannot drop below the start of the realm, but three in a row can demote", () => {
    const start = realmStart(1);
    expect(penaltyFor(start + 10, 1).floor).toBe(start);
    expect(penaltyFor(start + 10, 2).floor).toBe(start);
    expect(penaltyFor(start + 10, 3).floor).toBe(0);
    let state: XpState = { ...started("2026-10-01"), total: start + 50, restDays: ["2026-10-01"] };
    const result = settleDays(state, at("2026-10-05"));
    const penalties = result.events.filter(event => event.type === "penalty");
    expect(penalties).toHaveLength(4);
    expect(result.state.total).toBeLessThan(start);
    expect(rankOf(result.state.total).realm).toBe(0);
    expect(penalties.some(event => event.type === "penalty" && event.demoted)).toBe(true);
    state = result.state;
    expect(state.total).toBeGreaterThanOrEqual(0);
  });

  test("the total never goes below zero", () => {
    const state: XpState = { ...started("2026-10-01"), total: 30, restDays: ["2026-10-01"] };
    expect(settleDays(state, at("2026-10-12")).state.total).toBe(0);
  });

  test("after a long absence only the latest days are judged", () => {
    const state: XpState = { ...started("2026-08-01"), total: 100_000 };
    const result = settleDays(state, at("2026-10-12"));
    expect(result.events.length).toBeLessThanOrEqual(14);
    expect(result.state.settledDay).toBe("2026-10-11");
  });

  test("overdue tasks are never penalised: only empty days are", () => {
    const state: XpState = { ...worked("2026-10-12"), total: 500 };
    expect(settleDays(state, at("2026-10-13")).state.total).toBe(500);
  });
});

describe("stored value", () => {
  test("a bad value falls back to an empty state and a good one round-trips", () => {
    expect(parseXpText("not json").valid).toBe(false);
    expect(parseXpText("{}")).toEqual({ state: EMPTY_XP, valid: true });
    const state = claimTasks(started("2026-10-10"), [task({})], at("2026-10-10")).state;
    expect(parseXpText(JSON.stringify(state))).toEqual({ state, valid: true });
    expect(parseXpText(JSON.stringify({ total: "x", streak: -3 })).state.total).toBe(0);
  });

  test("merge keeps the bigger total; replace takes the file", () => {
    const a: XpState = { ...EMPTY_XP, total: 100, best: 3 };
    const b: XpState = { ...EMPTY_XP, total: 300, best: 2 };
    expect(mergeXp(a, b, "merge").total).toBe(300);
    expect(mergeXp(a, b, "merge").best).toBe(3);
    expect(mergeXp(a, b, "replace")).toBe(b);
  });
});
