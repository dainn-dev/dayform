import { describe, test, expect } from "bun:test";
import { CATEGORIES_CORRUPT_PREFIX, CATEGORIES_KEY, createCategoriesStore } from "./categories-store";
import { DEFAULT_CATEGORIES_STATE, type CategoriesState } from "./categories";
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

const gym = { name: "Gym", color: "coral", icon: "barbell-outline" } as const;
const stored = (state: unknown) => ({ [CATEGORIES_KEY]: JSON.stringify(state) });
const mainWrites = (writes: Array<[string, string]>) => writes.filter(([key]) => key === CATEGORIES_KEY);

async function loaded(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const fake = fakeStorage(initial, hooks);
  const store = createCategoriesStore(fake.storage);
  await store.load();
  return { ...fake, store };
}

describe("initial state", () => {
  test("is not ready, defaults, no errors", () => {
    const store = createCategoriesStore(fakeStorage().storage);
    expect(store.getState()).toEqual({ state: DEFAULT_CATEGORIES_STATE, ready: false, saveError: false, locked: false });
  });
});

describe("load", () => {
  test("a missing key means defaults and writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(store.getState()).toEqual({ state: DEFAULT_CATEGORIES_STATE, ready: true, saveError: false, locked: false });
    expect(writes).toEqual([]);
  });

  test("a stored state is read back", async () => {
    const state: CategoriesState = { custom: [{ id: "c_aaaaaaaa", name: "Gym", color: "sky", icon: "book-outline" }], hidden: ["Work"], renamed: {} };
    const { store, writes } = await loaded(stored(state));
    expect(store.getState().state).toEqual(state);
    expect(writes).toEqual([]);
  });

  test("a failed read locks writes and never writes anything", async () => {
    const { store, writes } = await loaded({}, { failGet: true });
    expect(store.getState()).toMatchObject({ ready: true, locked: true, state: DEFAULT_CATEGORIES_STATE });
    expect(await store.add(gym)).toEqual({ ok: false, reason: "locked" });
    expect(writes).toEqual([]);
  });

  test("unparseable data is copied to a corrupt key and the main key is not written", async () => {
    const raw = "{not json";
    const { store, data, writes } = await loaded({ [CATEGORIES_KEY]: raw });
    expect(data.get(contentKey(CATEGORIES_CORRUPT_PREFIX, raw))).toBe(raw);
    expect(mainWrites(writes)).toEqual([]);
    expect(store.getState()).toMatchObject({ ready: true, locked: false, state: DEFAULT_CATEGORIES_STATE });
  });

  test("partly bad data is repaired in memory and the original is kept", async () => {
    const raw = JSON.stringify({ custom: [{ id: "bad" }], hidden: ["Work"], renamed: {} });
    const { store, data, writes } = await loaded({ [CATEGORIES_KEY]: raw });
    expect(data.get(contentKey(CATEGORIES_CORRUPT_PREFIX, raw))).toBe(raw);
    expect(store.getState().state).toEqual({ custom: [], hidden: ["Work"], renamed: {} });
    expect(mainWrites(writes)).toEqual([]);
  });

  test("when the corrupt copy cannot be saved, writes stay locked", async () => {
    const { store, writes } = await loaded({ [CATEGORIES_KEY]: "oops" }, { failSet: () => true });
    expect(store.getState().locked).toBe(true);
    expect(await store.hide("Work")).toEqual({ ok: false, reason: "locked" });
    expect(writes).toEqual([]);
  });

  test("a second load replaces the first one's result only when it is the latest", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fake = fakeStorage(stored({ hidden: ["Work"] }), { gate });
    const store = createCategoriesStore(fake.storage);
    const first = store.load();
    const second = store.load();
    release();
    await Promise.all([first, second]);
    expect(store.getState().state.hidden).toEqual(["Work"]);
    expect(store.getState().ready).toBe(true);
  });

  test("dispose drops a late load result", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const store = createCategoriesStore(fakeStorage(stored({ hidden: ["Work"] }), { gate }).storage);
    const pending = store.load();
    store.dispose();
    release();
    await pending;
    expect(store.getState().ready).toBe(false);
  });
});

describe("actions", () => {
  test("waits for the initial load before applying", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fake = fakeStorage(stored({ hidden: ["Work"] }), { gate });
    const store = createCategoriesStore(fake.storage);
    const loading = store.load();
    const adding = store.add(gym);
    release();
    await loading;
    const result = await adding;
    expect(result.ok).toBe(true);
    // The new list was built on top of the stored one, not on the defaults.
    expect(store.getState().state.hidden).toEqual(["Work"]);
    expect(store.getState().state.custom).toHaveLength(1);
  });

  test("add persists the new state and reports the id", async () => {
    const { store, writes } = await loaded();
    const result = await store.add(gym);
    expect(result.ok && result.id).toMatch(/^c_[0-9a-z]{8}$/);
    expect(mainWrites(writes)).toHaveLength(1);
    expect(JSON.parse(mainWrites(writes)[0][1])).toEqual(store.getState().state);
  });

  test("update, rename, hide, show and remove each persist", async () => {
    const { store, writes } = await loaded();
    const added = await store.add(gym);
    if (!added.ok || added.id === undefined) throw new Error("unexpected");
    expect((await store.update(added.id, { name: "Fitness" })).ok).toBe(true);
    expect((await store.rename("Work", "Day job")).ok).toBe(true);
    expect((await store.hide("Focus")).ok).toBe(true);
    expect((await store.show("Focus")).ok).toBe(true);
    expect((await store.remove(added.id)).ok).toBe(true);
    expect(store.getState().state).toEqual({ custom: [], hidden: [], renamed: { Work: "Day job" } });
    expect(mainWrites(writes)).toHaveLength(6);
  });

  test("translate is used for duplicate checks", async () => {
    const { store } = await loaded();
    const translate = (text: string) => (text === "Work" ? "Công việc" : text);
    expect(await store.add({ ...gym, name: "cong viec" }, { translate })).toEqual({ ok: false, reason: "duplicate" });
    expect(await store.rename("Focus", "Cong viec", { translate })).toEqual({ ok: false, reason: "duplicate" });
    expect((await store.add(gym)).ok).toBe(true);
    const id = store.getState().state.custom[0].id;
    expect(await store.update(id, { name: "cong viec" }, { translate })).toEqual({ ok: false, reason: "duplicate" });
  });

  test("a refused change writes nothing and returns the reason", async () => {
    const { store, writes } = await loaded();
    expect(await store.remove("c_nothere0")).toEqual({ ok: false, reason: "unknown-category" });
    expect(writes).toEqual([]);
  });

  test("a change that alters nothing writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(await store.show("Work")).toEqual({ ok: true, id: "Work" });
    expect(writes).toEqual([]);
  });

  test("a failed write is pessimistic: memory keeps the old value and saveError is set", async () => {
    const { store } = await loaded({}, { failSet: () => true });
    expect(await store.add(gym)).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState()).toMatchObject({ state: DEFAULT_CATEGORIES_STATE, saveError: true });
  });

  test("repeated failures notify once", async () => {
    const { store } = await loaded({}, { failSet: () => true });
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    await store.hide("Work");
    await store.hide("Work");
    expect(calls).toBe(1);
  });

  test("a later successful write clears saveError", async () => {
    const { store } = await loaded({}, { failSet: (_key, call) => call === 1 });
    expect((await store.hide("Work")).ok).toBe(false);
    expect(store.getState().saveError).toBe(true);
    expect((await store.hide("Work")).ok).toBe(true);
    expect(store.getState()).toMatchObject({ saveError: false });
    expect(store.getState().state.hidden).toEqual(["Work"]);
  });

  test("concurrent changes are applied one after another on the last committed state", async () => {
    const { store, writes } = await loaded();
    await Promise.all([store.hide("Focus"), store.hide("Work"), store.rename("Personal", "Me")]);
    expect(store.getState().state).toEqual({ custom: [], hidden: ["Focus", "Work"], renamed: { Personal: "Me" } });
    expect(mainWrites(writes)).toHaveLength(3);
    expect(JSON.parse(mainWrites(writes)[2][1])).toEqual(store.getState().state);
  });

  test("a failing write does not block the queue", async () => {
    const { store } = await loaded({}, { failSet: (_key, call) => call === 1 });
    const [first, second] = await Promise.all([store.hide("Focus"), store.hide("Work")]);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(store.getState().state.hidden).toEqual(["Work"]);
  });
});

describe("importState", () => {
  const incoming: CategoriesState = {
    custom: [{ id: "c_bbbbbbbb", name: "Art", color: "lime", icon: "leaf-outline" }],
    hidden: [],
    renamed: {},
  };

  test("merge adds the incoming custom categories and persists", async () => {
    const { store, writes } = await loaded();
    expect((await store.importState(incoming, "merge")).ok).toBe(true);
    expect(store.getState().state.custom).toEqual(incoming.custom);
    expect(mainWrites(writes)).toHaveLength(1);
  });

  test("replace takes the incoming state wholesale", async () => {
    const { store } = await loaded(stored({ hidden: ["Work"] }));
    await store.importState(incoming, "replace");
    expect(store.getState().state).toEqual(incoming);
  });

  test("an import that changes nothing writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(await store.importState(DEFAULT_CATEGORIES_STATE, "merge")).toEqual({ ok: true });
    expect(writes).toEqual([]);
  });
});

describe("subscribe", () => {
  test("notifies on changes only, and stops after unsubscribe", async () => {
    const { store } = await loaded();
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    await store.hide("Work");
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);
    await store.show("Personal"); // already visible: no change
    expect(calls).toBe(afterFirst);
    off();
    await store.hide("Focus");
    expect(calls).toBe(afterFirst);
  });
});
