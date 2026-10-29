import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { deleteCategoryWithTasks, reassignCategory, type MutateTasks } from "./category-reassign";

const task = (id: string, category: string): Task => ({
  id, title: id, date: null, start: null, duration: 30, status: "todo", category, notes: "", createdAt: "2026-01-01T00:00:00Z",
});

describe("reassignCategory", () => {
  const tasks = [task("a", "c_gym00001"), task("b", "Work"), task("c", "c_gym00001")];

  test("moves only the tasks of the deleted category", () => {
    const next = reassignCategory(tasks, "c_gym00001", "Personal");
    expect(next.map(item => item.category)).toEqual(["Personal", "Work", "Personal"]);
    expect(next[1]).toBe(tasks[1]);
  });

  test("does not mutate its input", () => {
    const snapshot = JSON.stringify(tasks);
    const next = reassignCategory(tasks, "c_gym00001", "Personal");
    expect(JSON.stringify(tasks)).toBe(snapshot);
    expect(next).not.toBe(tasks);
    expect(next[0]).not.toBe(tasks[0]);
  });

  test("keeps every other field of a moved task", () => {
    const [moved] = reassignCategory(tasks, "c_gym00001", "Personal");
    expect(moved).toEqual({ ...tasks[0]!, category: "Personal" });
  });

  test("returns the same list when nothing uses the category or source equals target", () => {
    expect(reassignCategory(tasks, "c_none0001", "Personal")).toBe(tasks);
    expect(reassignCategory(tasks, "Work", "Work")).toBe(tasks);
  });
});

describe("deleteCategoryWithTasks", () => {
  const run = (mutateTasks: MutateTasks, removeCategory: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>) =>
    deleteCategoryWithTasks({ id: "c_gym00001", targetId: "Personal", mutateTasks, removeCategory });

  test("moves the tasks with one write that is not undoable, then removes the category", async () => {
    const calls: string[] = [];
    let options: unknown;
    let result: Task[] = [];
    const outcome = await run(
      async (update, ...rest: unknown[]) => { calls.push("tasks"); options = rest[0]; result = update([task("a", "c_gym00001")]); return true; },
      async id => { calls.push(`remove:${id}`); return { ok: true }; },
    );
    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(["tasks", "remove:c_gym00001"]);
    expect(options).toBeUndefined();
    expect(result[0]!.category).toBe("Personal");
  });

  test("keeps the category when the tasks write fails or is blocked", async () => {
    let removed = false;
    const outcome = await run(async () => false, async () => { removed = true; return { ok: true }; });
    expect(outcome).toEqual({ ok: false, stage: "tasks" });
    expect(removed).toBe(false);
  });

  test("treats a throwing tasks write as a failure", async () => {
    let removed = false;
    const outcome = await run(async () => { throw new Error("boom"); }, async () => { removed = true; return { ok: true }; });
    expect(outcome).toEqual({ ok: false, stage: "tasks" });
    expect(removed).toBe(false);
  });

  test("reports a category failure after the tasks moved", async () => {
    expect(await run(async () => true, async () => ({ ok: false, reason: "locked" })))
      .toEqual({ ok: false, stage: "category", reason: "locked" });
    expect(await run(async () => true, async () => { throw new Error("boom"); }))
      .toEqual({ ok: false, stage: "category", reason: "write-failed" });
  });
});
