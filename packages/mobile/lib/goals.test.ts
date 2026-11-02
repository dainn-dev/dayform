import { describe, expect, test } from "bun:test";
import { createJsonStore } from "./json-store";
import { DEFAULT_GOALS_STATE, MAX_GOALS, goalsProgress, parseGoalsText, removeGoal, setGoal, type GoalsState } from "./goals";

describe("setGoal and removeGoal", () => {
  test("adds a goal, and setting the same category again changes its target instead of adding a second", () => {
    const first = setGoal(DEFAULT_GOALS_STATE, "Wellness", 300, "g_aaaaaaaa");
    expect(first).toEqual({ ok: true, state: { items: [{ id: "g_aaaaaaaa", category: "Wellness", minutesPerWeek: 300 }] }, id: "g_aaaaaaaa" });
    if (!first.ok) throw new Error("no");
    const again = setGoal(first.state, "Wellness", 600, "g_bbbbbbbb");
    expect(again.ok && again.state.items).toEqual([{ id: "g_aaaaaaaa", category: "Wellness", minutesPerWeek: 600 }]);
    expect(setGoal(first.state, "Wellness", 300)).toMatchObject({ ok: true, state: first.state });
  });

  test("refuses bad targets, an empty category and a full list", () => {
    expect(setGoal(DEFAULT_GOALS_STATE, "Work", 5)).toEqual({ ok: false, reason: "invalid-minutes" });
    expect(setGoal(DEFAULT_GOALS_STATE, "Work", 90.5)).toEqual({ ok: false, reason: "invalid-minutes" });
    expect(setGoal(DEFAULT_GOALS_STATE, " ", 60)).toEqual({ ok: false, reason: "invalid-category" });
    const full: GoalsState = { items: Array.from({ length: MAX_GOALS }, (_, i) => ({ id: `g_${String(i).padStart(8, "0")}`, category: `c${i}`, minutesPerWeek: 60 })) };
    expect(setGoal(full, "new", 60)).toEqual({ ok: false, reason: "limit" });
  });

  test("remove", () => {
    const state: GoalsState = { items: [{ id: "g_aaaaaaaa", category: "Work", minutesPerWeek: 60 }] };
    expect(removeGoal(state, "g_aaaaaaaa")).toEqual({ ok: true, state: { items: [] } });
    expect(removeGoal(state, "g_zzzzzzzz")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("goalsProgress", () => {
  const goals = [{ id: "g_aaaaaaaa", category: "Wellness", minutesPerWeek: 300 }, { id: "g_bbbbbbbb", category: "Work", minutesPerWeek: 600 }];
  const stats = { perCategory: { Wellness: { plannedMinutes: 400, doneMinutes: 150, count: 4 }, Work: { plannedMinutes: 900, doneMinutes: 900, count: 9 } } };

  test("over a week the target is the weekly one and the ratio is capped at 1", () => {
    const [wellness, work] = goalsProgress(goals, stats, { from: "2026-03-02", to: "2026-03-08" });
    expect(wellness).toMatchObject({ doneMinutes: 150, targetMinutes: 300, ratio: 0.5, reached: false });
    expect(work).toMatchObject({ doneMinutes: 900, targetMinutes: 600, ratio: 1, reached: true });
  });

  test("over a month the target grows with the days", () => {
    const [wellness] = goalsProgress(goals, stats, { from: "2026-03-01", to: "2026-03-31" });
    expect(wellness.targetMinutes).toBe(1329);
  });

  test("a category with no finished task is at zero", () => {
    const [only] = goalsProgress([{ id: "g_cccccccc", category: "Focus", minutesPerWeek: 60 }], stats, { from: "2026-03-02", to: "2026-03-08" });
    expect(only).toMatchObject({ doneMinutes: 0, ratio: 0, reached: false });
  });
});

describe("parseGoalsText", () => {
  test("drops broken goals and a second goal of the same category", () => {
    const text = JSON.stringify({ items: [
      { id: "g_aaaaaaaa", category: "Work", minutesPerWeek: 60 },
      { id: "g_bbbbbbbb", category: "Work", minutesPerWeek: 120 },
      { id: "bad", category: "x", minutesPerWeek: 60 },
    ] });
    const result = parseGoalsText(text);
    expect(result.state.items).toHaveLength(1);
    expect(result.lossy).toBe(true);
  });
  test("not JSON or the wrong shape is invalid", () => {
    expect(parseGoalsText("{").valid).toBe(false);
    expect(parseGoalsText("[]").valid).toBe(false);
  });
});

describe("json store", () => {
  function memory(initial: Record<string, string> = {}, options: { failSet?: boolean; failGet?: boolean } = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      async getItem(key: string) { if (options.failGet) throw new Error("read"); return data.get(key) ?? null; },
      async setItem(key: string, value: string) { if (options.failSet) throw new Error("write"); data.set(key, value); },
    };
  }
  const config = { key: "k", corruptPrefix: "k.corrupt.", empty: DEFAULT_GOALS_STATE, parse: parseGoalsText };

  test("applies a change and persists it", async () => {
    const storage = memory();
    const store = createJsonStore(storage, config);
    await store.load();
    expect(await store.apply(state => setGoal(state, "Work", 60, "g_aaaaaaaa"))).toEqual({ ok: true, id: "g_aaaaaaaa" });
    expect(JSON.parse(storage.data.get("k") as string).items).toHaveLength(1);
    expect(store.getState().state.items).toHaveLength(1);
  });

  test("a refused change writes nothing", async () => {
    const storage = memory();
    const store = createJsonStore(storage, config);
    await store.load();
    expect(await store.apply(state => setGoal(state, "Work", 1))).toEqual({ ok: false, reason: "invalid-minutes" });
    expect(storage.data.size).toBe(0);
  });

  test("a failed write keeps the old state; unreadable storage locks; damaged data is copied aside", async () => {
    const failing = createJsonStore(memory({}, { failSet: true }), config);
    await failing.load();
    expect(await failing.apply(state => setGoal(state, "Work", 60))).toEqual({ ok: false, reason: "write-failed" });
    expect(failing.getState()).toMatchObject({ saveError: true });
    expect(failing.getState().state.items).toEqual([]);

    const unreadable = memory({}, { failGet: true });
    const locked = createJsonStore(unreadable, config);
    await locked.load();
    expect(await locked.apply(state => setGoal(state, "Work", 60))).toEqual({ ok: false, reason: "locked" });
    expect(unreadable.data.size).toBe(0);

    const damaged = memory({ k: "{broken" });
    const copied = createJsonStore(damaged, config);
    await copied.load();
    expect([...damaged.data.keys()].some(key => key.startsWith("k.corrupt."))).toBe(true);
    expect(damaged.data.get("k")).toBe("{broken");
    expect(copied.getState().locked).toBe(false);
  });
});
