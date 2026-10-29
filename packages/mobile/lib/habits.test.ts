import { describe, expect, test } from "bun:test";
import { EMPTY_HINTS, MAX_HISTORY, computeHints } from "./habits";
import { addDays, dateKey, type Task } from "./planner";

const NOW = new Date(2026, 9, 29, 10, 0);
const TODAY = dateKey(NOW);

let counter = 0;
const make = (title: string, daysAgo: number, extra: Partial<Task> = {}): Task => {
  counter += 1;
  return {
    id: `t${counter}`, title, date: addDays(TODAY, -daysAgo), start: "09:00", duration: 30, status: "done", category: "Work",
    notes: "", createdAt: "2026-09-01T00:00:00.000Z", ...extra,
  };
};

const gym = [make("Gym session", 0), make("Gym session", 7), make("Gym session", 21)];

describe("computeHints", () => {
  test("returns the shared empty result without touching the data when disabled", () => {
    const poisoned = new Proxy([] as Task[], { get() { throw new Error("history was read"); } });
    expect(computeHints({ typedTitle: "Gym session", tasks: poisoned, archive: poisoned, now: NOW, enabled: false })).toBe(EMPTY_HINTS);
    expect(EMPTY_HINTS).toEqual({ duration: null, repeat: null, focus: null, stale: { count: 0, ids: [] } });
  });

  test("returns nothing useful for an empty history", () => {
    expect(computeHints({ typedTitle: "Gym session", tasks: [], now: NOW, enabled: true })).toEqual({
      duration: null, repeat: null, focus: null, stale: { count: 0, ids: [] },
    });
  });

  test("combines the duration, repeat and stale hints", () => {
    const stale = make("Call dentist", 30, { status: "todo" });
    const result = computeHints({ typedTitle: "Gym session", tasks: [...gym, stale], now: NOW, enabled: true });
    expect(result.duration).toEqual({ minutes: 30, basedOn: 3, category: "Work" });
    expect(result.repeat).toEqual({ repeat: "weekly", weekday: 4, occurrences: 3, window: 4 });
    expect(result.focus).toBeNull();
    expect(result.stale).toEqual({ count: 1, ids: [stale.id] });
  });

  test("gives no title-based hints for an empty or short typed title", () => {
    const result = computeHints({ typedTitle: "", tasks: gym, now: NOW, enabled: true });
    expect(result.duration).toBeNull();
    expect(result.repeat).toBeNull();
  });

  test("includes the archive in the learned hints", () => {
    const archive = [make("Gym session", 100), make("Gym session", 101)];
    expect(computeHints({ typedTitle: "Gym session", tasks: [], now: NOW, enabled: true }).duration).toBeNull();
    expect(computeHints({ typedTitle: "Gym session", tasks: [], archive, now: NOW, enabled: true }).duration?.basedOn).toBe(2);
  });

  test("does not double count a task that is in both lists", () => {
    const shared = make("Gym session", 5);
    const result = computeHints({ typedTitle: "Gym session", tasks: [shared], archive: [shared, { ...shared }], now: NOW, enabled: true });
    expect(result.duration).toBeNull();
  });

  test("does not look at archived tasks for the stale hint", () => {
    const archive = [make("Old", 200, { status: "todo" })];
    expect(computeHints({ typedTitle: "", tasks: [], archive, now: NOW, enabled: true }).stale.count).toBe(0);
  });

  test("learns the focus window once there is enough history", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => make(`Deep work ${i}`, i, { start: "09:00", duration: 60 }));
    expect(computeHints({ typedTitle: "", tasks, now: NOW, enabled: true }).focus).toEqual({
      startHour: 9, endHour: 11, share: 1, sample: 20,
    });
  });

  test("learns from only the most recent tasks of a huge history", () => {
    expect(MAX_HISTORY).toBe(3000);
    const ancient = Array.from({ length: 200 }, () => make("Gym session", 900, { duration: 120 }));
    const recent = Array.from({ length: MAX_HISTORY }, (_, i) => make(`Other ${i}`, i % 50));
    const recentGym = [make("Gym session", 1, { duration: 45 }), make("Gym session", 2, { duration: 45 })];
    const result = computeHints({ typedTitle: "Gym session", tasks: [...ancient, ...recent.slice(0, 2998), ...recentGym], now: NOW, enabled: true });
    expect(result.duration).toEqual({ minutes: 45, basedOn: 2, category: "Work" });
  });

  test("still finds very old unfinished tasks in a huge history", () => {
    const stale = make("Forgotten", 400, { status: "todo" });
    const filler = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => make(`Filler ${i}`, i % 30));
    expect(computeHints({ typedTitle: "", tasks: [stale, ...filler], now: NOW, enabled: true }).stale).toEqual({ count: 1, ids: [stale.id] });
  });

  test("finishes quickly on a history of 10k tasks", () => {
    const tasks = Array.from({ length: 10_000 }, (_, i) => make(`Task ${i % 40}`, i % 400, { status: i % 7 === 0 ? "todo" : "done" }));
    const started = performance.now();
    const result = computeHints({ typedTitle: "Task 1", tasks, archive: tasks.slice(0, 2000), now: NOW, enabled: true });
    const elapsed = performance.now() - started;
    expect(result.stale.count).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });
});
