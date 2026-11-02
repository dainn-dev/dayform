import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { movedDate, moveOnUpdate, reviewWeek } from "./weekly-review";

// Week of Mon 2026-03-02 .. Sun 2026-03-08; the week before is 02-23 .. 03-01.
const task = (id: string, date: string | null, over: Partial<Task> = {}): Task => ({
  id, title: id, date, start: date ? "09:00" : null, duration: 60, status: "todo", category: "Work", notes: "", createdAt: "x", ...over,
});
const LOG = [
  { date: "2026-03-03", taskId: null, minutes: 25, at: 1 },
  { date: "2026-03-10", taskId: null, minutes: 50, at: 2 },
];

describe("reviewWeek", () => {
  const tasks = [
    task("a", "2026-03-02", { status: "done", category: "Focus", duration: 90 }),
    task("b", "2026-03-03", { status: "done" }),
    task("c", "2026-03-03"),
    task("d", "2026-03-04", { status: "in_progress" }),
    task("e", "2026-03-06"),
    task("series", "2026-03-02", { seriesId: "s", repeat: "daily" }),
    task("prev", "2026-02-24", { status: "done" }),
    task("prev2", "2026-02-25"),
    task("backlog", null),
  ];
  const review = reviewWeek(tasks, "2026-03-05", "2026-03-05", "mon", LOG);

  test("totals and the comparison with the week before", () => {
    expect(review.range).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    expect(review).toMatchObject({ scheduledCount: 6, doneCount: 2, doneMinutes: 150, focusMinutes: 25 });
    expect(review.completionRate).toBeCloseTo(2 / 6);
    expect(review.previous).toEqual({ scheduledCount: 2, doneCount: 1, doneMinutes: 60 });
  });

  test("best day and top category are by finished minutes", () => {
    expect(review.bestDay).toBe("2026-03-02");
    expect(review.topCategory).toEqual({ id: "Focus", doneMinutes: 90 });
  });

  test("only past, unfinished, one-off scheduled tasks can be moved on, in time order", () => {
    expect(review.unfinished.map(t => t.id)).toEqual(["c", "d"]);
  });

  test("an empty week has nothing to report", () => {
    const empty = reviewWeek([], "2026-03-05", "2026-03-05", "mon", []);
    expect(empty).toMatchObject({ scheduledCount: 0, completionRate: null, bestDay: null, topCategory: null, unfinished: [] });
  });

  test("a sunday-first week starts on sunday", () => {
    expect(reviewWeek(tasks, "2026-03-05", "2026-03-05", "sun", []).range.from).toBe("2026-03-01");
  });
});

describe("moving on", () => {
  const range = { from: "2026-03-02", to: "2026-03-08" };
  const tasks = [task("c", "2026-03-03"), task("d", "2026-03-04"), task("e", "2026-03-06"), task("done", "2026-03-03", { status: "done" })];

  test("a task moves to the same weekday a week later", () => {
    expect(movedDate("2026-03-03", "2026-03-05")).toBe("2026-03-10");
  });

  test("an old week lands on today instead of in the past", () => {
    expect(movedDate("2026-03-03", "2026-04-20")).toBe("2026-04-20");
  });

  test("moves only the wanted, still-eligible tasks and leaves the rest as the same objects", () => {
    const result = moveOnUpdate(["c", "e", "done"], range, "2026-03-05")(tasks);
    expect(result.map(t => t.date)).toEqual(["2026-03-10", "2026-03-04", "2026-03-06", "2026-03-03"]);
    expect(result[1]).toBe(tasks[1]);
  });

  test("returns the same list when nothing qualifies", () => {
    expect(moveOnUpdate(["done", "zzz"], range, "2026-03-05")(tasks)).toBe(tasks);
  });
});
