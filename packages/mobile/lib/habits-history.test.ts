import { describe, expect, test } from "bun:test";
import { isDone, mostRecent, recencyKey } from "./habits-history";
import type { Task } from "./planner";

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: "t", date: "2026-10-20", start: "09:00", duration: 30, status: "done", category: "Work",
  notes: "", createdAt: "2026-10-01T08:00:00.000Z", ...extra,
});

describe("isDone", () => {
  test("is true only for done tasks", () => {
    expect(isDone(task("a"))).toBe(true);
    expect(isDone(task("a", { status: "todo" }))).toBe(false);
    expect(isDone(task("a", { status: "in_progress" }))).toBe(false);
  });
});

describe("recencyKey", () => {
  test("uses the date, falling back to the creation day for backlog tasks", () => {
    expect(recencyKey(task("a"))).toBe("2026-10-20");
    expect(recencyKey(task("a", { date: null, start: null }))).toBe("2026-10-01");
  });

  test("is empty when nothing is known", () => {
    expect(recencyKey(task("a", { date: null, createdAt: "" }))).toBe("");
  });
});

describe("mostRecent", () => {
  test("sorts newest first, breaking ties by creation time then id, without mutating the input", () => {
    const input = [
      task("old", { date: "2026-09-01" }),
      task("b", { date: "2026-10-02", createdAt: "2026-10-02T09:00:00.000Z" }),
      task("a", { date: "2026-10-02", createdAt: "2026-10-02T09:00:00.000Z" }),
      task("late", { date: "2026-10-02", createdAt: "2026-10-02T10:00:00.000Z" }),
      task("new", { date: "2026-10-05" }),
    ];
    const copy = [...input];
    expect(mostRecent(input, 10).map(t => t.id)).toEqual(["new", "late", "a", "b", "old"]);
    expect(input).toEqual(copy);
  });

  test("keeps only the requested number", () => {
    const input = [task("1", { date: "2026-10-01" }), task("2", { date: "2026-10-02" }), task("3", { date: "2026-10-03" })];
    expect(mostRecent(input, 2).map(t => t.id)).toEqual(["3", "2"]);
    expect(mostRecent(input, 0)).toEqual([]);
  });
});
