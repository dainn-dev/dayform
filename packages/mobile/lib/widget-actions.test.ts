import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { applyWidgetToggles, parseWidgetToggles, toggleReceipt } from "./widget-actions";

const task = (id: string, status: Task["status"]): Task => ({
  id, title: id, date: "2026-03-02", start: "09:00", duration: 30, status, category: "Work", notes: "", createdAt: "x",
});

describe("parseWidgetToggles", () => {
  test("reads the queue", () => {
    expect(parseWidgetToggles('[{"id":"a","done":true,"at":5},{"id":"b","done":false,"at":6}]')).toEqual([
      { id: "a", done: true, at: 5 }, { id: "b", done: false, at: 6 },
    ]);
  });

  test("skips broken entries and survives garbage", () => {
    expect(parseWidgetToggles('[{"id":"a","done":true,"at":5},{"id":"","done":true,"at":1},{"done":true},7]')).toHaveLength(1);
    expect(parseWidgetToggles("not json")).toEqual([]);
    expect(parseWidgetToggles("{}")).toEqual([]);
    expect(parseWidgetToggles("")).toEqual([]);
  });

  test("an id over the limit is refused", () => {
    expect(parseWidgetToggles(JSON.stringify([{ id: "x".repeat(101), done: true, at: 1 }]))).toEqual([]);
  });
});

describe("applyWidgetToggles", () => {
  test("finishes and reopens the named tasks only", () => {
    const tasks = [task("a", "todo"), task("b", "done"), task("c", "todo")];
    const result = applyWidgetToggles([{ id: "a", done: true, at: 1 }, { id: "b", done: false, at: 2 }])(tasks);
    expect(result.map(t => t.status)).toEqual(["done", "todo", "todo"]);
    expect(result[2]).toBe(tasks[2]);
  });

  test("only the last wish for a task counts", () => {
    const tasks = [task("a", "todo")];
    expect(applyWidgetToggles([{ id: "a", done: true, at: 1 }, { id: "a", done: false, at: 2 }])(tasks)).toBe(tasks);
    expect(applyWidgetToggles([{ id: "a", done: false, at: 3 }, { id: "a", done: true, at: 2 }])(tasks)).toBe(tasks);
    expect(applyWidgetToggles([{ id: "a", done: false, at: 1 }, { id: "a", done: true, at: 2 }])(tasks)[0].status).toBe("done");
  });

  test("a task already in the wished state or gone changes nothing and returns the same list", () => {
    const tasks = [task("a", "done")];
    expect(applyWidgetToggles([{ id: "a", done: true, at: 1 }, { id: "gone", done: true, at: 2 }])(tasks)).toBe(tasks);
  });

  test("an in-progress task can be finished and a finished one reopens as to-do", () => {
    const tasks = [task("a", "in_progress")];
    const done = applyWidgetToggles([{ id: "a", done: true, at: 1 }])(tasks);
    expect(done[0].status).toBe("done");
    expect(applyWidgetToggles([{ id: "a", done: false, at: 2 }])(done)[0].status).toBe("todo");
  });
});

test("the receipt lists the queued times", () => {
  expect(toggleReceipt([{ id: "a", done: true, at: 5 }, { id: "b", done: false, at: 9 }])).toBe("[5,9]");
});
