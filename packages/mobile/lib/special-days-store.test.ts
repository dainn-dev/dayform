import { describe, expect, test } from "bun:test";
import { SPECIAL_DAYS_CORRUPT_PREFIX, SPECIAL_DAYS_KEY, createSpecialDaysStore } from "./special-days-store";
import { DEFAULT_SPECIAL_DAYS_STATE, type SpecialDay, type SpecialDayInput, type SpecialDaysState } from "./special-days";
import { contentKey, type KeyValueStorage } from "./task-storage";

type Hooks = {
  failGet?: boolean;
  /** Return true to make the nth write (1-based) of any key fail. */
  failSet?: (key: string, call: number) => boolean;
  gate?: Promise<void>;
};

function fakeStorage(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  let calls = 0;
  const storage: KeyValueStorage = {
    async getItem(key) {
      if (hooks.failGet) throw new Error("read failed");
      await hooks.gate;
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

const linh: SpecialDayInput = { title: "Linh", kind: "birthday", calendar: "solar", month: 3, day: 15, startYear: 1995, remind: "none" };
const saved = (id: string, patch: Partial<SpecialDayInput> = {}): SpecialDay => ({ id, ...linh, ...patch });
const stored = (state: unknown) => ({ [SPECIAL_DAYS_KEY]: JSON.stringify(state) });
const mainWrites = (writes: Array<[string, string]>) => writes.filter(([key]) => key === SPECIAL_DAYS_KEY);

async function loaded(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const fake = fakeStorage(initial, hooks);
  const store = createSpecialDaysStore(fake.storage);
  await store.load();
  return { ...fake, store };
}

describe("initial state", () => {
  test("is not ready, empty, no errors", () => {
    const store = createSpecialDaysStore(fakeStorage().storage);
    expect(store.getState()).toEqual({ state: DEFAULT_SPECIAL_DAYS_STATE, ready: false, saveError: false, locked: false });
  });
});

describe("load", () => {
  test("a missing key means empty and writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(store.getState()).toEqual({ state: DEFAULT_SPECIAL_DAYS_STATE, ready: true, saveError: false, locked: false });
    expect(writes).toEqual([]);
  });

  test("a stored list is read back", async () => {
    const state: SpecialDaysState = { items: [saved("s_aaaaaaaa")] };
    const { store, writes } = await loaded(stored(state));
    expect(store.getState().state).toEqual(state);
    expect(writes).toEqual([]);
  });

  test("a failed read locks writes and never touches the stored value", async () => {
    const { store, writes } = await loaded(stored({ items: [saved("s_aaaaaaaa")] }), { failGet: true });
    expect(store.getState()).toMatchObject({ ready: true, locked: true });
    expect(await store.add(linh)).toEqual({ ok: false, reason: "locked" });
    expect(writes).toEqual([]);
  });

  test("text that is not JSON is copied aside once, the main key stays as it was", async () => {
    const text = "{broken";
    const { store, writes, data } = await loaded({ [SPECIAL_DAYS_KEY]: text });
    expect(store.getState()).toMatchObject({ locked: false, state: DEFAULT_SPECIAL_DAYS_STATE });
    expect(writes).toEqual([[contentKey(SPECIAL_DAYS_CORRUPT_PREFIX, text), text]]);
    expect(data.get(SPECIAL_DAYS_KEY)).toBe(text);
  });

  test("a list with some bad records keeps the good ones and copies the original aside", async () => {
    const text = JSON.stringify({ items: [saved("s_aaaaaaaa"), { id: "nope" }] });
    const { store, writes } = await loaded({ [SPECIAL_DAYS_KEY]: text });
    expect(store.getState().state.items.map(entry => entry.id)).toEqual(["s_aaaaaaaa"]);
    expect(writes).toEqual([[contentKey(SPECIAL_DAYS_CORRUPT_PREFIX, text), text]]);
  });

  test("if the copy cannot be saved the store locks", async () => {
    const { store } = await loaded({ [SPECIAL_DAYS_KEY]: "{broken" }, { failSet: () => true });
    expect(store.getState().locked).toBe(true);
  });

  test("changes wait for the first read", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fake = fakeStorage(stored({ items: [saved("s_aaaaaaaa")] }), { gate });
    const store = createSpecialDaysStore(fake.storage);
    const loading = store.load();
    const adding = store.add(linh);
    expect(fake.writes).toEqual([]);
    release();
    await loading;
    expect((await adding).ok).toBe(true);
    expect(store.getState().state.items).toHaveLength(2);
  });
});

describe("add, update, remove", () => {
  test("add saves the list and tells the new id", async () => {
    const { store, writes } = await loaded();
    const result = await store.add(linh);
    expect(result.ok && result.id).toMatch(/^s_[a-z0-9]{8}$/);
    expect(mainWrites(writes)).toHaveLength(1);
    expect(JSON.parse(mainWrites(writes)[0][1]).items).toHaveLength(1);
    expect(store.getState().state.items).toHaveLength(1);
  });

  test("a refused change writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(await store.add({ ...linh, title: " " })).toEqual({ ok: false, reason: "invalid-title" });
    expect(await store.update("s_zzzzzzzz", { title: "x" })).toEqual({ ok: false, reason: "unknown" });
    expect(await store.remove("s_zzzzzzzz")).toEqual({ ok: false, reason: "unknown" });
    expect(mainWrites(writes)).toEqual([]);
  });

  test("update and remove change the saved list", async () => {
    const { store } = await loaded(stored({ items: [saved("s_aaaaaaaa"), saved("s_bbbbbbbb", { title: "Mẹ" })] }));
    expect((await store.update("s_bbbbbbbb", { remind: "same-day" })).ok).toBe(true);
    expect(store.getState().state.items[1].remind).toBe("same-day");
    expect((await store.remove("s_aaaaaaaa")).ok).toBe(true);
    expect(store.getState().state.items.map(entry => entry.id)).toEqual(["s_bbbbbbbb"]);
  });

  test("memory changes only after the write succeeded", async () => {
    const { store } = await loaded({}, { failSet: key => key === SPECIAL_DAYS_KEY });
    expect(await store.add(linh)).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState()).toMatchObject({ state: DEFAULT_SPECIAL_DAYS_STATE, saveError: true });
  });

  test("a later successful write clears the save error", async () => {
    let fail = true;
    const { store } = await loaded({}, { failSet: key => key === SPECIAL_DAYS_KEY && fail });
    await store.add(linh);
    fail = false;
    expect((await store.add(linh)).ok).toBe(true);
    expect(store.getState().saveError).toBe(false);
  });

  test("two quick changes are applied one after the other, none is lost", async () => {
    const { store } = await loaded();
    const [first, second] = await Promise.all([store.add(linh), store.add({ ...linh, title: "Mẹ" })]);
    expect(first.ok && second.ok).toBe(true);
    expect(store.getState().state.items.map(entry => entry.title)).toEqual(["Linh", "Mẹ"]);
  });
});

describe("importState", () => {
  const incoming: SpecialDaysState = { items: [saved("s_aaaaaaaa", { title: "Trong tệp" }), saved("s_cccccccc", { title: "Mới" })] };

  test("merge keeps the current days and adds the new ones", async () => {
    const { store } = await loaded(stored({ items: [saved("s_aaaaaaaa", { title: "Hiện tại" })] }));
    expect((await store.importState(incoming, "merge")).ok).toBe(true);
    expect(store.getState().state.items.map(entry => entry.title)).toEqual(["Hiện tại", "Mới"]);
  });

  test("replace takes the file's list", async () => {
    const { store } = await loaded(stored({ items: [saved("s_bbbbbbbb")] }));
    await store.importState(incoming, "replace");
    expect(store.getState().state).toEqual(incoming);
  });

  test("merging nothing new writes nothing", async () => {
    const { store, writes } = await loaded(stored(incoming));
    expect((await store.importState(incoming, "merge")).ok).toBe(true);
    expect(mainWrites(writes)).toEqual([]);
  });
});

describe("subscribe and dispose", () => {
  test("listeners hear about changes and can stop listening", async () => {
    const { store } = await loaded();
    let calls = 0;
    const stop = store.subscribe(() => { calls += 1; });
    await store.add(linh);
    expect(calls).toBeGreaterThan(0);
    stop();
    const before = calls;
    await store.add(linh);
    expect(calls).toBe(before);
  });

  test("a read that finishes after dispose is ignored", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fake = fakeStorage(stored({ items: [saved("s_aaaaaaaa")] }), { gate });
    const store = createSpecialDaysStore(fake.storage);
    const loading = store.load();
    store.dispose();
    release();
    await loading;
    expect(store.getState().ready).toBe(false);
  });
});
