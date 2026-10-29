import { describe, expect, test } from "bun:test";
import { carryOverCandidates, carryOverUpdate } from "./carry-over";
import type { Task } from "./planner";

const TODAY = "2026-10-30";
const YESTERDAY = "2026-10-29";

let counter = 0;
function task(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `t${counter}`,
    title: "Task",
    date: YESTERDAY,
    start: "09:00",
    duration: 30,
    status: "todo",
    category: "Work",
    notes: "",
    createdAt: "2026-10-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("carryOverCandidates", () => {
  test("includes unfinished scheduled tasks of a past day", () => {
    const todo = task({ status: "todo" });
    const doing = task({ status: "in_progress" });
    expect(carryOverCandidates([todo, doing], YESTERDAY, TODAY)).toEqual([todo, doing]);
  });

  test("leaves out finished tasks", () => {
    expect(carryOverCandidates([task({ status: "done" })], YESTERDAY, TODAY)).toEqual([]);
  });

  test("leaves out tasks of other days and backlog tasks", () => {
    const other = task({ date: "2026-10-28" });
    const backlog = task({ date: null, start: null });
    expect(carryOverCandidates([other, backlog], YESTERDAY, TODAY)).toEqual([]);
  });

  test("leaves out occurrences of a recurring series, which already have their own copy for today", () => {
    const occurrence = task({ seriesId: "s1", repeat: "daily" });
    expect(carryOverCandidates([occurrence], YESTERDAY, TODAY)).toEqual([]);
  });

  test("offers nothing for today or a future day", () => {
    const todayTask = task({ date: TODAY });
    const tomorrowTask = task({ date: "2026-10-31" });
    expect(carryOverCandidates([todayTask, tomorrowTask], TODAY, TODAY)).toEqual([]);
    expect(carryOverCandidates([tomorrowTask], "2026-10-31", TODAY)).toEqual([]);
  });

  test("works across a month boundary", () => {
    const lastOfMonth = task({ date: "2026-10-31" });
    expect(carryOverCandidates([lastOfMonth], "2026-10-31", "2026-11-01")).toEqual([lastOfMonth]);
  });
});

describe("carryOverUpdate", () => {
  test("moves unfinished tasks to today and keeps their time, length and everything else", () => {
    const moving = task({ id: "a", start: "14:30", duration: 45, notes: "bring notes", remind: 15 });
    const [moved] = carryOverUpdate(YESTERDAY, TODAY)([moving]);
    expect(moved).toEqual({ ...moving, date: TODAY });
  });

  test("leaves every other task untouched, in the same order", () => {
    const first = task({ id: "first" });
    const done = task({ id: "done", status: "done" });
    const series = task({ id: "series", seriesId: "s1", repeat: "daily" });
    const backlog = task({ id: "backlog", date: null, start: null });
    const result = carryOverUpdate(YESTERDAY, TODAY)([first, done, series, backlog]);
    expect(result.map(t => t.id)).toEqual(["first", "done", "series", "backlog"]);
    expect(result[0]?.date).toBe(TODAY);
    expect(result.slice(1)).toEqual([done, series, backlog]);
  });

  test("returns the same list when there is nothing to move, so no write happens", () => {
    const list = [task({ status: "done" }), task({ date: null, start: null })];
    expect(carryOverUpdate(YESTERDAY, TODAY)(list)).toBe(list);
  });

  test("does not mutate its input", () => {
    const original = task({ id: "x" });
    const list = [original];
    carryOverUpdate(YESTERDAY, TODAY)(list);
    expect(list[0]).toBe(original);
    expect(original.date).toBe(YESTERDAY);
  });
});
