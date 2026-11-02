import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { ROUTINES_CORRUPT_PREFIX, ROUTINES_KEY, createRoutinesStore } from "./routines-store";

function memory(initial: Record<string, string> = {}, options: { failSet?: boolean; failGet?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key: string) { if (options.failGet) throw new Error("read"); return data.get(key) ?? null; },
    async setItem(key: string, value: string) { if (options.failSet) throw new Error("write"); data.set(key, value); },
  };
}
const day: Task[] = [{ id: "a", title: "Run", date: "2026-03-02", start: "07:00", duration: 20, status: "todo", category: "Wellness", notes: "", createdAt: "x" }];

describe("routines store", () => {
  test("starts empty, saves a day, renames and removes", async () => {
    const storage = memory();
    const store = createRoutinesStore(storage);
    await store.load();
    expect(store.getState()).toMatchObject({ ready: true, locked: false });
    const added = await store.addFromDay("Morning", day, "2026-03-02");
    expect(added.ok).toBe(true);
    const id = added.ok ? (added.id as string) : "";
    expect(JSON.parse(storage.data.get(ROUTINES_KEY) as string).items[0].name).toBe("Morning");
    expect((await store.rename(id, "Early")).ok).toBe(true);
    expect(store.getState().state.items[0].name).toBe("Early");
    expect((await store.remove(id)).ok).toBe(true);
    expect(store.getState().state.items).toEqual([]);
  });

  test("a failed write keeps the old list and flags the error", async () => {
    const store = createRoutinesStore(memory({}, { failSet: true }));
    await store.load();
    expect(await store.addFromDay("Morning", day, "2026-03-02")).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState().saveError).toBe(true);
    expect(store.getState().state.items).toEqual([]);
  });

  test("unreadable storage locks writes and never touches the key", async () => {
    const storage = memory({}, { failGet: true });
    const store = createRoutinesStore(storage);
    await store.load();
    expect(store.getState().locked).toBe(true);
    expect(await store.addFromDay("Morning", day, "2026-03-02")).toEqual({ ok: false, reason: "locked" });
    expect(storage.data.size).toBe(0);
  });

  test("damaged data is copied aside before anything is written", async () => {
    const storage = memory({ [ROUTINES_KEY]: "{broken" });
    const store = createRoutinesStore(storage);
    await store.load();
    expect([...storage.data.keys()].some(key => key.startsWith(ROUTINES_CORRUPT_PREFIX))).toBe(true);
    expect(storage.data.get(ROUTINES_KEY)).toBe("{broken");
    expect(store.getState().locked).toBe(false);
  });
});
