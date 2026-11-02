import { describe, expect, test } from "bun:test";
import { FOCUS_CORRUPT_PREFIX, FOCUS_KEY, createFocusStore } from "./focus-store";

const MIN = 60_000;
const T0 = new Date(2026, 2, 2, 9, 0, 0).getTime();

function memory(initial: Record<string, string> = {}, options: { failSet?: boolean; failGet?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key: string) { if (options.failGet) throw new Error("read"); return data.get(key) ?? null; },
    async setItem(key: string, value: string) { if (options.failSet) throw new Error("write"); data.set(key, value); },
  };
}

function clockStore(storage = memory()) {
  const clock = { now: T0 };
  const store = createFocusStore(storage, () => clock.now);
  return { store, storage, clock };
}

describe("focus store", () => {
  test("runs a round: start, pause, resume, settle, stop", async () => {
    const { store, storage, clock } = clockStore();
    await store.load();
    expect((await store.start("t1", 25)).ok).toBe(true);
    expect(store.getState().state.session).toMatchObject({ taskId: "t1", phase: "focus" });
    expect(JSON.parse(storage.data.get(FOCUS_KEY) as string).session.taskId).toBe("t1");

    clock.now = T0 + 5 * MIN;
    await store.pause();
    clock.now = T0 + 50 * MIN;
    await store.settle();
    expect(store.getState().state.session?.phase).toBe("focus");
    await store.resume();
    clock.now = T0 + 50 * MIN + 21 * MIN;
    await store.settle();
    expect(store.getState().state.session?.phase).toBe("break");
    expect(store.getState().state.log).toHaveLength(1);

    await store.stop();
    expect(store.getState().state.session).toBeNull();
  });

  test("settle writes nothing when nothing is due", async () => {
    const { store, storage } = clockStore();
    await store.load();
    await store.start(null);
    const before = storage.data.get(FOCUS_KEY);
    await store.settle();
    expect(storage.data.get(FOCUS_KEY)).toBe(before);
  });

  test("a session that ended while the app was closed is settled on load", async () => {
    const first = clockStore();
    await first.store.load();
    await first.store.start("t1", 25);
    const { storage, clock, store } = clockStore(first.storage);
    clock.now = T0 + 3 * 60 * MIN;
    await store.load();
    expect(store.getState().state.session).toBeNull();
    expect(store.getState().state.log).toMatchObject([{ taskId: "t1", minutes: 25 }]);
    expect(JSON.parse(storage.data.get(FOCUS_KEY) as string).log).toHaveLength(1);
  });

  test("a failed write keeps the previous state and flags the error", async () => {
    const { store } = clockStore(memory({}, { failSet: true }));
    await store.load();
    expect(await store.start("t1")).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState().state.session).toBeNull();
    expect(store.getState().saveError).toBe(true);
  });

  test("unreadable storage locks writes", async () => {
    const storage = memory({}, { failGet: true });
    const { store } = clockStore(storage);
    await store.load();
    expect(await store.start("t1")).toEqual({ ok: false, reason: "locked" });
    expect(storage.data.size).toBe(0);
  });

  test("damaged data is copied aside and the main key is left alone", async () => {
    const storage = memory({ [FOCUS_KEY]: "{broken" });
    const { store } = clockStore(storage);
    await store.load();
    expect([...storage.data.keys()].some(key => key.startsWith(FOCUS_CORRUPT_PREFIX))).toBe(true);
    expect(storage.data.get(FOCUS_KEY)).toBe("{broken");
  });

  test("another round after a break, and prefs", async () => {
    const { store, clock } = clockStore();
    await store.load();
    await store.setPrefs({ focusMinutes: 50 });
    await store.start("t1");
    clock.now = T0 + 51 * MIN;
    await store.settle();
    await store.nextRound();
    expect(store.getState().state.session).toMatchObject({ phase: "focus", round: 1, durationMs: 50 * MIN });
  });
});
