import { describe, test, expect } from "bun:test";
import { CYCLE_CORRUPT_PREFIX, CYCLE_KEY, createCycleStore } from "./cycle-store";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle";
import { dateKey } from "./planner";
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

const TODAY = "2026-06-15";
const FULL: CycleState = {
  ...DEFAULT_CYCLE_STATE, enabled: true, acknowledged: true, periods: [{ start: "2026-05-20", end: "2026-05-24" }],
};
const stored = (state: unknown) => ({ [CYCLE_KEY]: JSON.stringify(state) });
const mainWrites = (writes: Array<[string, string]>) => writes.filter(([key]) => key === CYCLE_KEY);

async function loaded(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const fake = fakeStorage(initial, hooks);
  const store = createCycleStore(fake.storage);
  await store.load();
  return { ...fake, store };
}

describe("initial state", () => {
  test("is not ready, defaults, no errors", () => {
    const store = createCycleStore(fakeStorage().storage);
    expect(store.getState()).toEqual({ state: DEFAULT_CYCLE_STATE, ready: false, saveError: false, locked: false });
  });
});

describe("load", () => {
  test("a missing key means defaults and writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(store.getState()).toEqual({ state: DEFAULT_CYCLE_STATE, ready: true, saveError: false, locked: false });
    expect(writes).toEqual([]);
  });

  test("a stored state is read back and nothing is written", async () => {
    const { store, writes } = await loaded(stored(FULL));
    expect(store.getState().state).toEqual(FULL);
    expect(writes).toEqual([]);
  });

  test("a failed read locks writes and never writes anything", async () => {
    const { store, writes } = await loaded({}, { failGet: true });
    expect(store.getState()).toMatchObject({ ready: true, locked: true, state: DEFAULT_CYCLE_STATE });
    expect(await store.setEnabled(true)).toEqual({ ok: false, reason: "locked" });
    expect(writes).toEqual([]);
  });

  test("unparseable data is copied to a corrupt key and the main key is not written", async () => {
    const raw = "{not json";
    const { store, data, writes } = await loaded({ [CYCLE_KEY]: raw });
    expect(data.get(contentKey(CYCLE_CORRUPT_PREFIX, raw))).toBe(raw);
    expect(mainWrites(writes)).toEqual([]);
    expect(store.getState()).toMatchObject({ ready: true, locked: false, state: DEFAULT_CYCLE_STATE });
  });

  test("partly bad data is repaired in memory and the original is kept", async () => {
    const raw = JSON.stringify({ ...FULL, periods: [{ start: "2026-02-30" }, ...FULL.periods] });
    const { store, data, writes } = await loaded({ [CYCLE_KEY]: raw });
    expect(data.get(contentKey(CYCLE_CORRUPT_PREFIX, raw))).toBe(raw);
    expect(store.getState().state).toEqual(FULL);
    expect(mainWrites(writes)).toEqual([]);
  });

  test("the same bad data on every launch reuses one corrupt copy", async () => {
    const raw = "oops";
    const fake = fakeStorage({ [CYCLE_KEY]: raw });
    await createCycleStore(fake.storage).load();
    await createCycleStore(fake.storage).load();
    expect([...fake.data.keys()].filter(key => key.startsWith(CYCLE_CORRUPT_PREFIX))).toHaveLength(1);
  });

  test("when the corrupt copy cannot be saved, writes stay locked", async () => {
    const { store, writes } = await loaded({ [CYCLE_KEY]: "oops" }, { failSet: () => true });
    expect(store.getState().locked).toBe(true);
    expect(await store.setPaused(true)).toEqual({ ok: false, reason: "locked" });
    expect(writes).toEqual([]);
  });

  test("prototype-pollution keys in the stored text do not reach the state", async () => {
    const raw = '{"__proto__":{"enabled":true},"enabled":false}';
    const { store } = await loaded({ [CYCLE_KEY]: raw });
    expect(store.getState().state.enabled).toBe(false);
    expect(({} as Record<string, unknown>).enabled).toBeUndefined();
  });

  test("a second load replaces the first one's result only when it is the latest", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const store = createCycleStore(fakeStorage(stored(FULL), { gate }).storage);
    const first = store.load();
    const second = store.load();
    release();
    await Promise.all([first, second]);
    expect(store.getState().state).toEqual(FULL);
    expect(store.getState().ready).toBe(true);
  });

  test("dispose drops a late load result", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const store = createCycleStore(fakeStorage(stored(FULL), { gate }).storage);
    const pending = store.load();
    store.dispose();
    release();
    await pending;
    expect(store.getState().ready).toBe(false);
  });
});

describe("actions", () => {
  test("waits for the initial load and builds on the stored state", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const store = createCycleStore(fakeStorage(stored(FULL), { gate }).storage);
    const loading = store.load();
    const adding = store.addPeriod({ start: "2026-06-10" }, TODAY);
    release();
    await loading;
    expect(await adding).toEqual({ ok: true });
    expect(store.getState().state.periods.map(period => period.start)).toEqual(["2026-05-20", "2026-06-10"]);
    expect(store.getState().state.enabled).toBe(true);
  });

  test("every action persists the state it produced", async () => {
    const { store, writes } = await loaded();
    expect((await store.addPeriod({ start: "2026-05-20" }, TODAY)).ok).toBe(true);
    expect((await store.updatePeriod("2026-05-20", { start: "2026-05-21", end: "2026-05-25" }, TODAY)).ok).toBe(true);
    expect((await store.setEnabled(true)).ok).toBe(true);
    expect((await store.acknowledge()).ok).toBe(true);
    expect((await store.setPaused(true)).ok).toBe(true);
    expect((await store.updateDefaults({ cycleLength: 30 })).ok).toBe(true);
    expect((await store.updateReminders({ daysBefore: 2 })).ok).toBe(true);
    expect((await store.updateLock({ timeoutSec: 300 })).ok).toBe(true);
    expect((await store.setShowOnTimeline(true)).ok).toBe(true);
    expect((await store.removePeriod("2026-05-21")).ok).toBe(true);
    expect(mainWrites(writes)).toHaveLength(10);
    const last = JSON.parse(mainWrites(writes)[9][1]);
    expect(last).toEqual(store.getState().state);
    expect(store.getState().state).toEqual({
      ...DEFAULT_CYCLE_STATE, enabled: true, acknowledged: true, paused: true, showOnTimeline: true,
      defaults: { cycleLength: 30, periodLength: 5 },
      reminders: { ...DEFAULT_CYCLE_STATE.reminders, daysBefore: 2 },
      lock: { enabled: true, timeoutSec: 300 },
    });
  });

  test("what is written reads back as the same state, not lossy", async () => {
    const { store, data, writes } = await loaded();
    await store.addPeriod({ start: "2026-05-20", end: "2026-05-24" }, TODAY);
    await store.updateReminders({ time: "21:00" });
    const fresh = await loaded(Object.fromEntries(data));
    expect(fresh.store.getState().state).toEqual(store.getState().state);
    expect([...fresh.data.keys()].some(key => key.startsWith(CYCLE_CORRUPT_PREFIX))).toBe(false);
    expect(writes.every(([key]) => key === CYCLE_KEY)).toBe(true);
  });

  test("today defaults to the device's local date", async () => {
    const { store } = await loaded();
    const today = dateKey(new Date());
    expect((await store.addPeriod({ start: today })).ok).toBe(true);
    expect((await store.updatePeriod(today, { start: today, end: today })).ok).toBe(true);
    expect(await store.addPeriod({ start: "2999-01-01" })).toEqual({ ok: false, reason: "invalid-date" });
  });

  test("a refused change writes nothing and returns the reason", async () => {
    const { store, writes } = await loaded();
    expect(await store.addPeriod({ start: "2026-06-16" }, TODAY)).toEqual({ ok: false, reason: "future" });
    expect(await store.removePeriod("2026-01-01")).toEqual({ ok: false, reason: "unknown-period" });
    expect(await store.updateDefaults({ cycleLength: 99 })).toEqual({ ok: false, reason: "invalid-value" });
    expect(writes).toEqual([]);
  });

  test("a change that alters nothing writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(await store.setEnabled(false)).toEqual({ ok: true });
    expect(writes).toEqual([]);
  });

  test("a failed write is pessimistic: memory keeps the old value and saveError is set", async () => {
    const { store } = await loaded({}, { failSet: () => true });
    expect(await store.setEnabled(true)).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState()).toMatchObject({ state: DEFAULT_CYCLE_STATE, saveError: true });
  });

  test("repeated failures notify once", async () => {
    const { store } = await loaded({}, { failSet: () => true });
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    await store.setEnabled(true);
    await store.setEnabled(true);
    expect(calls).toBe(1);
  });

  test("a later successful write clears saveError", async () => {
    const { store } = await loaded({}, { failSet: (_key, call) => call === 1 });
    expect((await store.setEnabled(true)).ok).toBe(false);
    expect(store.getState().saveError).toBe(true);
    expect((await store.setEnabled(true)).ok).toBe(true);
    expect(store.getState()).toMatchObject({ saveError: false });
    expect(store.getState().state.enabled).toBe(true);
  });

  test("concurrent changes are applied one after another on the last committed state", async () => {
    const { store, writes } = await loaded();
    await Promise.all([
      store.addPeriod({ start: "2026-04-20" }, TODAY), store.addPeriod({ start: "2026-05-20" }, TODAY), store.setEnabled(true),
    ]);
    expect(store.getState().state.periods.map(period => period.start)).toEqual(["2026-04-20", "2026-05-20"]);
    expect(store.getState().state.enabled).toBe(true);
    expect(mainWrites(writes)).toHaveLength(3);
    expect(JSON.parse(mainWrites(writes)[2][1])).toEqual(store.getState().state);
  });

  test("two adds of the same period: the second is refused as an overlap", async () => {
    const { store } = await loaded();
    const [first, second] = await Promise.all([
      store.addPeriod({ start: "2026-05-20" }, TODAY), store.addPeriod({ start: "2026-05-20" }, TODAY),
    ]);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "overlap" });
  });

  test("a failing write does not block the queue", async () => {
    const { store } = await loaded({}, { failSet: (_key, call) => call === 1 });
    const [first, second] = await Promise.all([store.setEnabled(true), store.setPaused(true)]);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(store.getState().state).toMatchObject({ enabled: false, paused: true });
  });
});

describe("importState", () => {
  const incoming: CycleState = { ...DEFAULT_CYCLE_STATE, periods: [{ start: "2026-04-01" }] };

  test("merge adds the incoming periods, keeps the current settings and persists", async () => {
    const { store, writes } = await loaded(stored(FULL));
    expect(await store.importState(incoming, "merge")).toEqual({ ok: true });
    expect(store.getState().state.periods.map(period => period.start)).toEqual(["2026-04-01", "2026-05-20"]);
    expect(store.getState().state.enabled).toBe(true);
    expect(mainWrites(writes)).toHaveLength(1);
  });

  test("replace takes the incoming state wholesale", async () => {
    const { store } = await loaded(stored(FULL));
    await store.importState(incoming, "replace");
    expect(store.getState().state).toEqual(incoming);
  });

  test("an import that changes nothing writes nothing", async () => {
    const { store, writes } = await loaded();
    expect(await store.importState(DEFAULT_CYCLE_STATE, "merge")).toEqual({ ok: true });
    expect(writes).toEqual([]);
  });
});

describe("subscribe", () => {
  test("notifies on changes only, and stops after unsubscribe", async () => {
    const { store } = await loaded();
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    await store.setEnabled(true);
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);
    await store.setEnabled(true);
    expect(calls).toBe(afterFirst);
    off();
    await store.setPaused(true);
    expect(calls).toBe(afterFirst);
  });
});
