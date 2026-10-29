import { describe, test, expect } from "bun:test";
import { createSettingsStore } from "./settings-store";
import { DEFAULT_SETTINGS, SETTINGS_KEY, resolveSettings } from "./settings";
import type { KeyValueStorage } from "./task-storage";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: Error) => void };

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

type Hooks = {
  onGet?: () => Promise<string | null> | string | null | undefined;
  onSet?: (value: string, call: number) => Promise<void> | void;
};

function fakeStorage(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  let sets = 0;
  const storage: KeyValueStorage = {
    async getItem(key) {
      const override = hooks.onGet?.();
      if (override !== undefined) return override;
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      sets += 1;
      await hooks.onSet?.(value, sets);
      writes.push(value);
      data.set(key, value);
    },
  };
  return { storage, data, writes };
}

const stored = (value: unknown) => ({ [SETTINGS_KEY]: JSON.stringify(value) });

describe("initial state", () => {
  test("is not ready, has defaults and no name", () => {
    const { storage } = fakeStorage();
    const state = createSettingsStore(storage).getState();
    expect(state).toEqual({ settings: DEFAULT_SETTINGS, ready: false, saveError: false, hasName: false });
  });
});

describe("load", () => {
  test("reads stored settings, becomes ready and reports hasName", async () => {
    const { storage, writes } = fakeStorage(stored({ profile: { name: "Linh" }, accent: "forest" }));
    const store = createSettingsStore(storage);
    await store.load();
    const state = store.getState();
    expect(state.ready).toBe(true);
    expect(state.hasName).toBe(true);
    expect(state.settings.accent).toBe("forest");
    expect(writes).toEqual([]);
  });

  test("first launch: defaults, ready, no write", async () => {
    const { storage, writes } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    expect(store.getState()).toEqual({ settings: DEFAULT_SETTINGS, ready: true, saveError: false, hasName: false });
    expect(writes).toEqual([]);
  });

  test("invalid stored JSON keeps the app running with defaults and does not write", async () => {
    const { storage, writes } = fakeStorage({ [SETTINGS_KEY]: "{broken" });
    const store = createSettingsStore(storage);
    await store.load();
    expect(store.getState().ready).toBe(true);
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(writes).toEqual([]);
  });

  test("a read error gives defaults, ready, and no write", async () => {
    const { storage, writes } = fakeStorage({}, { onGet: () => Promise.reject(new Error("io")) });
    const store = createSettingsStore(storage);
    await store.load();
    expect(store.getState().ready).toBe(true);
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(writes).toEqual([]);
  });

  test("partially invalid groups keep their valid fields", async () => {
    const { storage } = fakeStorage(stored({
      accent: "nope", notifications: { hideTitles: true, snoozeMinutes: 99 }, calendar: "x", profile: { name: "  Mai  " },
    }));
    const store = createSettingsStore(storage);
    await store.load();
    const { settings } = store.getState();
    expect(settings.accent).toBe("violet");
    expect(settings.notifications).toEqual({ ...DEFAULT_SETTINGS.notifications, hideTitles: true });
    expect(settings.calendar).toEqual(DEFAULT_SETTINGS.calendar);
    expect(settings.profile.name).toBe("Mai");
  });

  test("a disposed store ignores a late read", async () => {
    const read = deferred<string | null>();
    const { storage } = fakeStorage({}, { onGet: () => read.promise });
    const store = createSettingsStore(storage);
    const loading = store.load();
    store.dispose();
    read.resolve(JSON.stringify({ accent: "ocean" }));
    await loading;
    expect(store.getState().ready).toBe(false);
    expect(store.getState().settings.accent).toBe("violet");
  });

  test("a second load supersedes an unfinished first one (StrictMode)", async () => {
    const first = deferred<string | null>();
    let calls = 0;
    const { storage } = fakeStorage({}, {
      onGet: () => (++calls === 1 ? first.promise : JSON.stringify({ accent: "sunset" })),
    });
    const store = createSettingsStore(storage);
    const one = store.load();
    store.dispose();
    const two = store.load();
    await two;
    first.resolve(JSON.stringify({ accent: "ocean" }));
    await one;
    expect(store.getState().settings.accent).toBe("sunset");
  });

  test("a reload does not clobber an update made after the store was ready", async () => {
    const second = deferred<string | null>();
    let calls = 0;
    const { storage } = fakeStorage({}, { onGet: () => (++calls === 2 ? second.promise : undefined) });
    const store = createSettingsStore(storage);
    await store.load();
    const reloading = store.load();
    await store.update({ accent: "ocean" });
    second.resolve(JSON.stringify({ accent: "forest" }));
    await reloading;
    expect(store.getState().settings.accent).toBe("ocean");
    expect(store.getState().ready).toBe(true);
  });
});

describe("update", () => {
  test("applies optimistically and persists the merged settings", async () => {
    const gate = deferred();
    const { storage, writes } = fakeStorage({}, { onSet: () => gate.promise });
    const store = createSettingsStore(storage);
    await store.load();
    const pending = store.update({ accent: "ocean" });
    await flush();
    expect(store.getState().settings.accent).toBe("ocean");
    expect(writes).toEqual([]);
    gate.resolve();
    expect(await pending).toEqual({ ok: true });
    expect(JSON.parse(writes[0])).toEqual({ ...DEFAULT_SETTINGS, accent: "ocean" });
  });

  test("never writes before the initial read resolved (slow load, then update)", async () => {
    const read = deferred<string | null>();
    const { storage, writes } = fakeStorage({}, { onGet: () => read.promise });
    const store = createSettingsStore(storage);
    const loading = store.load();
    const updating = store.update({ habits: { hints: false } });
    await flush();
    expect(writes).toEqual([]);
    expect(store.getState().settings.habits.hints).toBe(true);

    read.resolve(JSON.stringify({ profile: { name: "Linh" }, accent: "lagoon" }));
    await loading;
    await updating;
    const saved = JSON.parse(writes[0]);
    expect(saved.profile.name).toBe("Linh");
    expect(saved.accent).toBe("lagoon");
    expect(saved.habits.hints).toBe(false);
    expect(store.getState().settings).toEqual(resolveSettings(saved));
  });

  test("serial queue: writes happen one at a time, in order, and the last one holds the final state", async () => {
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let maxRunning = 0;
    const { storage, writes } = fakeStorage({}, {
      onSet: async (_value, call) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await gates[call - 1].promise;
        running -= 1;
      },
    });
    const store = createSettingsStore(storage);
    await store.load();
    const a = store.update({ accent: "ocean" });
    const b = store.update({ accent: "forest" });
    const c = store.update({ accent: "sunset" });
    await flush();
    gates[0].resolve();
    await flush();
    gates[1].resolve();
    await flush();
    gates[2].resolve();
    await Promise.all([a, b, c]);
    expect(maxRunning).toBe(1);
    expect(JSON.parse(writes[writes.length - 1]).accent).toBe("sunset");
    expect(store.getState().settings.accent).toBe("sunset");
  });

  test("a failed save keeps the in-memory value and sets saveError; a later success clears it", async () => {
    let fail = true;
    const { storage, data } = fakeStorage({}, { onSet: () => { if (fail) throw new Error("disk full"); } });
    const store = createSettingsStore(storage);
    await store.load();
    expect(await store.update({ accent: "ocean" })).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState().settings.accent).toBe("ocean");
    expect(store.getState().saveError).toBe(true);
    expect(data.has(SETTINGS_KEY)).toBe(false);

    fail = false;
    expect(await store.update({ habits: { hints: false } })).toEqual({ ok: true });
    expect(store.getState().saveError).toBe(false);
    expect(JSON.parse(data.get(SETTINGS_KEY) as string).accent).toBe("ocean");
  });

  test("a no-op patch does not write or notify", async () => {
    const { storage, writes } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    const before = store.getState();
    expect(await store.update({})).toEqual({ ok: true });
    expect(await store.update({ accent: "violet" })).toEqual({ ok: true });
    expect(writes).toEqual([]);
    expect(notified).toBe(0);
    expect(store.getState()).toBe(before);
  });

  test("an invalid patched value never reaches storage", async () => {
    const { storage, writes } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    await store.update({ accent: "bogus" as never });
    expect(writes).toEqual([]);
    expect(store.getState().settings.accent).toBe("violet");
  });
});

describe("setName", () => {
  test("stores a normalised name and flips hasName", async () => {
    const { storage, writes } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    expect(await store.setName("  Ngọc \n 🌸 ")).toEqual({ ok: true });
    expect(store.getState().settings.profile.name).toBe("Ngọc 🌸");
    expect(store.getState().hasName).toBe(true);
    expect(JSON.parse(writes[0]).profile.name).toBe("Ngọc 🌸");
  });

  test("truncates a 41 character name to 40", async () => {
    const { storage } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    await store.setName("n".repeat(41));
    expect(store.getState().settings.profile.name).toBe("n".repeat(40));
  });

  test("rejects blank, whitespace-only and invisible-only names without touching state or storage", async () => {
    const { storage, writes } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    for (const bad of ["", "    ", "‮​", "\u0000"]) {
      expect(await store.setName(bad)).toEqual({ ok: false, reason: "invalid-name" });
    }
    expect(store.getState().hasName).toBe(false);
    expect(writes).toEqual([]);
  });

  test("a failed save still keeps the name in memory and reports it", async () => {
    const { storage } = fakeStorage({}, { onSet: () => { throw new Error("nope"); } });
    const store = createSettingsStore(storage);
    await store.load();
    expect(await store.setName("Linh")).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState().hasName).toBe(true);
    expect(store.getState().saveError).toBe(true);
  });
});

describe("subscribe and referential stability", () => {
  test("notifies on change, unsubscribes cleanly", async () => {
    const { storage } = fakeStorage();
    const store = createSettingsStore(storage);
    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified += 1; });
    await store.load();
    const afterLoad = notified;
    expect(afterLoad).toBeGreaterThan(0);
    await store.update({ accent: "ocean" });
    expect(notified).toBeGreaterThan(afterLoad);
    unsubscribe();
    const frozen = notified;
    await store.update({ accent: "forest" });
    expect(notified).toBe(frozen);
  });

  test("getState returns the same object until something changes", async () => {
    const { storage } = fakeStorage();
    const store = createSettingsStore(storage);
    await store.load();
    const first = store.getState();
    expect(store.getState()).toBe(first);
    await store.update({ accent: "ocean" });
    const second = store.getState();
    expect(second).not.toBe(first);
    expect(store.getState()).toBe(second);
    expect(second.settings.habits).toBe(first.settings.habits);
  });

  test("a save error that is already set does not renotify when it fails again", async () => {
    const { storage } = fakeStorage({}, { onSet: () => { throw new Error("nope"); } });
    const store = createSettingsStore(storage);
    await store.load();
    await store.update({ accent: "ocean" });
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    const state = store.getState();
    await store.update({ accent: "ocean" });
    expect(store.getState()).toBe(state);
    expect(notified).toBe(0);
  });

  test("a throwing listener cannot wedge the write queue", async () => {
    const { storage, writes } = fakeStorage({}, { onSet: (_value, call) => { if (call === 1) throw new Error("nope"); } });
    const store = createSettingsStore(storage);
    await store.load();
    let thrown = false;
    store.subscribe(() => { if (store.getState().saveError && !thrown) { thrown = true; throw new Error("listener"); } });
    await store.update({ accent: "ocean" }).catch(() => undefined);
    await store.update({ accent: "forest" });
    expect(JSON.parse(writes[writes.length - 1]).accent).toBe("forest");
  });
});
