import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { xpChange } from "./xp-sync";

const task = (id: string, status: Task["status"]): Task => ({
  id, title: id, date: "2026-10-10", start: "09:00", duration: 30, status, category: "Focus", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
});

describe("what a write means for the experience", () => {
  test("a task that became done is finished", () => {
    const result = xpChange([task("a", "todo"), task("b", "todo")], [task("a", "done"), task("b", "todo")]);
    expect(result.finished.map(t => t.id)).toEqual(["a"]);
    expect(result.reopened).toEqual([]);
  });

  test("a new task that is already done is finished", () => {
    expect(xpChange([], [task("a", "done")]).finished.map(t => t.id)).toEqual(["a"]);
  });

  test("a task that was done and is not any more is reopened", () => {
    const result = xpChange([task("a", "done")], [task("a", "todo")]);
    expect(result).toEqual({ finished: [], reopened: ["a"] });
  });

  test("a task that stays done or stays open changes nothing", () => {
    expect(xpChange([task("a", "done"), task("b", "todo")], [task("a", "done"), task("b", "todo")])).toEqual({ finished: [], reopened: [] });
  });

  test("a done task that leaves the list (deleted, archived) gives nothing back", () => {
    expect(xpChange([task("a", "done")], [])).toEqual({ finished: [], reopened: [] });
  });

  test("a done task that comes back (undo of a delete) counts as finished; the ledger stops it earning twice", () => {
    expect(xpChange([], [task("a", "done")]).finished).toHaveLength(1);
  });
});
