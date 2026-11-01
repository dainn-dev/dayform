import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import { contentKey, type KeyValueStorage } from "./task-storage";
import { createXpStore, XP_CORRUPT_PREFIX } from "./xp-store";
import { EMPTY_XP, XP_KEY } from "./xp";

type Hooks = { failGet?: boolean; failSet?: (key: string, call: number) => boolean };

function fakeStorage(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  let calls = 0;
  const storage: KeyValueStorage = {
    async getItem(key) {
      if (hooks.failGet) throw new Error("read failed");
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      calls += 1;
      if (hooks.failSet?.(key, calls)) throw new Error("write failed");
      writes.push([key, value]);
      data.set(key, value);
    },
  };
  return { storage, data, writes };
}

const NOW = new Date("2026-10-10T12:00:00");
const done: Task = {
  id: "a", title: "Task", date: "2026-10-10", start: "09:00", duration: 30, status: "done", category: "Focus", notes: "",
  createdAt: new Date("2026-10-01T08:00:00").toISOString(),
};

async function loaded(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const fake = fakeStorage(initial, hooks);
  const store = createXpStore(fake.storage);
  await store.load();
  return { ...fake, store };
}

describe("experience store", () => {
  test("starts empty and reads the stored value", async () => {
    expect((await loaded()).store.getState()).toMatchObject({ state: EMPTY_XP, ready: true, locked: false });
    const { store } = await loaded({ [XP_KEY]: JSON.stringify({ ...EMPTY_XP, total: 123 }) });
    expect(store.getState().state.total).toBe(123);
  });

  test("a claim is written, and a second claim of the same task writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(await store.claim([done], NOW)).toMatchObject({ ok: true, gained: 20 });
    expect(store.getState().state.total).toBe(20);
    const count = writes.length;
    expect(await store.claim([done], NOW)).toMatchObject({ ok: true, gained: 0 });
    expect(writes.length).toBe(count);
  });

  test("revoking takes back what was given", async () => {
    const { store } = await loaded();
    await store.claim([done], NOW);
    await store.revoke(["a"]);
    expect(store.getState().state.total).toBe(0);
  });

  test("a failed write leaves memory as it was and reports it", async () => {
    const { store } = await loaded({}, { failSet: () => true });
    expect(await store.claim([done], NOW)).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState()).toMatchObject({ saveError: true });
    expect(store.getState().state.total).toBe(0);
  });

  test("a read that fails locks the store: nothing is ever written", async () => {
    const { store, writes } = await loaded({}, { failGet: true });
    expect(store.getState().locked).toBe(true);
    expect(await store.claim([done], NOW)).toEqual({ ok: false, reason: "locked" });
    expect(writes).toEqual([]);
  });

  test("an unreadable value is copied aside and never overwritten at load", async () => {
    const { store, data, writes } = await loaded({ [XP_KEY]: "not json" });
    expect(store.getState()).toMatchObject({ state: EMPTY_XP, locked: false });
    expect(data.get(contentKey(XP_CORRUPT_PREFIX, "not json"))).toBe("not json");
    expect(writes.filter(([key]) => key === XP_KEY)).toEqual([]);
  });

  test("an unreadable value that cannot be copied locks the store", async () => {
    const { store } = await loaded({ [XP_KEY]: "not json" }, { failSet: () => true });
    expect(store.getState().locked).toBe(true);
  });

  test("simultaneous claims are applied one after another", async () => {
    const { store } = await loaded();
    const other: Task = { ...done, id: "b" };
    await Promise.all([store.claim([done], NOW), store.claim([other], NOW)]);
    expect(store.getState().state.total).toBe(40);
  });

  test("settle, import and reset", async () => {
    const { store } = await loaded();
    expect(await store.settle(NOW)).toMatchObject({ ok: true });
    expect(store.getState().state.startDay).toBe("2026-10-10");
    await store.importState({ ...EMPTY_XP, total: 500 }, "merge");
    expect(store.getState().state.total).toBe(500);
    await store.reset();
    expect(store.getState().state).toEqual(EMPTY_XP);
  });

  test("subscribers hear about each change", async () => {
    const { store } = await loaded();
    let heard = 0;
    store.subscribe(() => { heard += 1; });
    await store.claim([done], NOW);
    expect(heard).toBe(1);
  });
});
