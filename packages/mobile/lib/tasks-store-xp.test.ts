import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { TASKS_STORAGE_KEY, type KeyValueStorage } from "./task-storage";
import { createTasksStore } from "./tasks-store";
import { xpChange } from "./xp-sync";

const task = (id: string, status: Task["status"]): Task => ({
  id, title: id, date: "2026-10-10", start: "09:00", duration: 30, status, category: "Focus", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
});

function storageWith(tasks: Task[], failWrites = false): KeyValueStorage {
  const data = new Map<string, string>([[TASKS_STORAGE_KEY, JSON.stringify(tasks)]]);
  return {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) {
      if (failWrites) throw new Error("write failed");
      data.set(key, value);
    },
  };
}

async function loaded(tasks: Task[], onCommitted: (change: { before: Task[]; next: Task[] }) => void, failWrites = false) {
  const store = createTasksStore(storageWith(tasks, failWrites), { onCommitted });
  await store.load();
  return store;
}

const complete = (id: string) => (list: Task[]) => list.map(t => (t.id === id ? { ...t, status: "done" as const } : t));

describe("the store reports committed writes for the experience", () => {
  test("a completion is reported with the list before and after", async () => {
    const seen: Array<{ finished: string[]; reopened: string[] }> = [];
    const store = await loaded([task("a", "todo")], ({ before, next }) => {
      const { finished, reopened } = xpChange(before, next);
      seen.push({ finished: finished.map(t => t.id), reopened });
    });
    await store.mutate(complete("a"));
    await store.mutate(list => list.map(t => ({ ...t, status: "todo" as const })));
    expect(seen).toEqual([{ finished: ["a"], reopened: [] }, { finished: [], reopened: ["a"] }]);
  });

  test("undoing a completion is a write too, so it gives the experience back", async () => {
    const seen: string[][] = [];
    const store = await loaded([task("a", "todo")], ({ before, next }) => { seen.push(xpChange(before, next).reopened); });
    await store.mutate(complete("a"), { undo: "bulk" });
    await store.undoLast();
    expect(seen).toEqual([[], ["a"]]);
  });

  test("a write marked noXp (import, archive) reports nothing", async () => {
    let calls = 0;
    const store = await loaded([task("a", "todo")], () => { calls += 1; });
    await store.mutate(complete("a"), { noXp: true });
    expect(calls).toBe(0);
    expect(store.getState().tasks[0].status).toBe("done");
  });

  test("a write that did not change anything or failed reports nothing", async () => {
    let calls = 0;
    const store = await loaded([task("a", "todo")], () => { calls += 1; });
    await store.mutate(list => list);
    expect(calls).toBe(0);
    const failing = await loaded([task("a", "todo")], () => { calls += 1; }, true);
    expect(await failing.mutate(complete("a"))).toBe(false);
    expect(calls).toBe(0);
  });

  test("a hook that throws never fails the write", async () => {
    const store = await loaded([task("a", "todo")], () => { throw new Error("boom"); });
    expect(await store.mutate(complete("a"))).toBe(true);
    expect(store.getState().tasks[0].status).toBe("done");
  });
});
