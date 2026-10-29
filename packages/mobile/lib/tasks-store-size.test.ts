import { describe, test, expect } from "bun:test";
import { TOO_LARGE_ERROR, createTasksStore, fitsStoredLimits } from "./tasks-store";
import { MAX_STORED_BYTES } from "./backup-flow";
import { MAX_RECORDS, TASKS_STORAGE_KEY as KEY, type KeyValueStorage } from "./task-storage";
import { utf8Length } from "./text-size";
import type { Task } from "./planner";

const MAX_NOTES = 10_000;

function task(id: string, notes = ""): Task {
  return {
    id, title: `Task ${id}`, date: "2026-03-10", start: "09:30", duration: 45,
    status: "todo", category: "Work", notes, createdAt: "2026-03-01T00:00:00.000Z",
  };
}

const sizeOf = (list: Task[]): number => utf8Length(JSON.stringify(list));

/** A list whose serialized size is exactly `target` bytes (notes of the last task absorb the remainder). */
function listOfSize(target: number): Task[] {
  for (let count = 0; ; count++) {
    const full = Array.from({ length: count }, (_, i) => task(`f${i}`, "x".repeat(MAX_NOTES)));
    const room = target - sizeOf([...full, task("last")]);
    if (room < 0) throw new Error(`cannot size list to ${target}`);
    if (room <= MAX_NOTES) return [...full, task("last", "x".repeat(room))];
  }
}

function fakeStorage(initial: Task[]) {
  const data = new Map<string, string>([[KEY, JSON.stringify(initial)]]);
  const sets: string[] = [];
  const storage: KeyValueStorage = {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { sets.push(key); data.set(key, value); },
  };
  return { storage, sets };
}

async function loaded(initial: Task[]) {
  const fake = fakeStorage(initial);
  const store = createTasksStore(fake.storage);
  await store.load();
  return { store, fake };
}

describe("MAX_STORED_BYTES limit", () => {
  test("TOO_LARGE_ERROR text is the translation key", () => {
    expect(TOO_LARGE_ERROR).toBe("Your task list is too big to store. Archive old tasks in Settings to free space.");
  });

  test("a write over the cap is refused: no setItem, tasks untouched, error set", async () => {
    const { store, fake } = await loaded([task("a")]);
    const before = store.getState().tasks;
    expect(await store.mutate(() => listOfSize(MAX_STORED_BYTES + 1))).toBe(false);
    expect(fake.sets).toEqual([]);
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().error).toBe(TOO_LARGE_ERROR);
  });

  test("a silent write over the cap is refused without an error", async () => {
    const { store, fake } = await loaded([task("a")]);
    expect(await store.mutate(() => listOfSize(MAX_STORED_BYTES + 1), { silent: true })).toBe(false);
    expect(fake.sets).toEqual([]);
    expect(store.getState().error).toBeNull();
  });

  test("exactly MAX_STORED_BYTES is accepted", async () => {
    const list = listOfSize(MAX_STORED_BYTES);
    expect(sizeOf(list)).toBe(MAX_STORED_BYTES);
    const { store, fake } = await loaded([task("a")]);
    expect(await store.mutate(() => list)).toBe(true);
    expect(fake.sets).toHaveLength(1);
  });

  test("a write that shrinks the list at the cap is allowed", async () => {
    const { store } = await loaded(listOfSize(MAX_STORED_BYTES));
    expect(await store.mutate((tasks) => tasks.slice(1))).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  test("a deletion is allowed even when the stored list is already over the cap", async () => {
    const { store } = await loaded(listOfSize(MAX_STORED_BYTES + 500));
    expect(await store.remove("last")).toBe(true);
  });

  test("an edit that keeps the size over the cap is allowed, growing by one byte is not", async () => {
    const over = listOfSize(MAX_STORED_BYTES + 500);
    const { store } = await loaded(over);
    const edit = (notes: string) => (tasks: Task[]) => tasks.map((t) => (t.id === "last" ? { ...t, notes } : t));
    const last = over[over.length - 1]!;
    expect(await store.mutate(edit("y".repeat(last.notes.length)))).toBe(true);
    expect(await store.mutate(edit("y".repeat(last.notes.length + 1)))).toBe(false);
    expect(store.getState().error).toBe(TOO_LARGE_ERROR);
  });

  test("an undo that does not grow the list is allowed at the cap", async () => {
    const list = listOfSize(MAX_STORED_BYTES);
    const { store } = await loaded(list);
    expect(await store.remove("last")).toBe(true);
    expect(await store.undoLast()).toBe(true);
    expect(sizeOf(store.getState().tasks)).toBe(MAX_STORED_BYTES);
  });
});

describe("fitsStoredLimits", () => {
  test("is true for a small list and false past either limit", () => {
    expect(fitsStoredLimits([task("a")])).toBe(true);
    expect(fitsStoredLimits(Array.from({ length: MAX_RECORDS + 1 }, (_, i) => task(`m${i}`)))).toBe(false);
    expect(fitsStoredLimits(listOfSize(MAX_STORED_BYTES + 1))).toBe(false);
    expect(fitsStoredLimits(listOfSize(MAX_STORED_BYTES))).toBe(true);
  });
});
