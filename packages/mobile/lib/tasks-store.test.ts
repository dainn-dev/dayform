import { describe, test, expect } from "bun:test";
import {
  LOAD_ERROR,
  QUARANTINED_NOTICE,
  READ_ONLY_NOTICE,
  RECOVERED_NOTICE,
  SAVE_ERROR,
  TOO_MANY_TASKS_ERROR,
  createTasksStore,
} from "./tasks-store";
import {
  BACKUP_KEY_PREFIX,
  CORRUPT_KEY_PREFIX,
  MAX_RECORDS,
  TASKS_STORAGE_KEY as KEY,
  contentKey,
  type KeyValueStorage,
} from "./task-storage";
import type { Task } from "./planner";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: Error) => void };

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Lets already-resolved promise chains run to completion without timers. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

type Hooks = {
  /** Return a value to override getItem (1-based call number); undefined falls through to the data map. */
  onGet?: (call: number) => Promise<string | null> | string | null | undefined;
  /** Runs before a setItem commits; throw or reject to fail it. `call` is 1-based per key. */
  onSet?: (key: string, value: string, call: number) => Promise<void> | void;
};

function fakeStorage(initial: Record<string, string> = {}, hooks: Hooks = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const setCalls: [string, string][] = [];
  let gets = 0;
  const storage: KeyValueStorage = {
    async getItem(key) {
      gets += 1;
      const override = hooks.onGet?.(gets);
      if (override !== undefined) return override;
      return data.has(key) ? data.get(key)! : null;
    },
    async setItem(key, value) {
      setCalls.push([key, value]);
      const call = setCalls.filter(([k]) => k === key).length;
      await hooks.onSet?.(key, value, call);
      data.set(key, value);
    },
  };
  const mainWrites = (): unknown[] => setCalls.filter(([k]) => k === KEY).map(([, v]) => JSON.parse(v));
  return { storage, data, setCalls, mainWrites };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, title: `Task ${id}`, date: "2026-03-10", start: "09:30", duration: 45,
    status: "todo", category: "Work", notes: "", createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Smallest valid record: 10,000 of them stay under the stored-size cap, unlike the regular `task()`. */
function tiny(id: string): Task {
  return { id, title: "", date: null, start: null, duration: 1, status: "todo", category: "Work", notes: "", createdAt: "" };
}

const A = task("a");
const B = task("b");
const NEW = task("new");
const storedList = (tasks: unknown[]) => ({ [KEY]: JSON.stringify(tasks) });

async function loadedStore(tasks: Task[] = [A, B], hooks: Hooks = {}) {
  const fake = fakeStorage(storedList(tasks), hooks);
  const store = createTasksStore(fake.storage);
  await store.load();
  return { fake, store };
}

describe("initial state", () => {
  test("starts loading with no tasks and no error", () => {
    const store = createTasksStore(fakeStorage().storage);
    expect(store.getState()).toEqual({ tasks: [], loading: true, error: null, lastRemoved: null, undo: null, writesBlocked: false });
  });

  test("getState returns the same object while nothing changes", () => {
    const store = createTasksStore(fakeStorage().storage);
    expect(store.getState()).toBe(store.getState());
  });
});

describe("save during a slow load", () => {
  test("applies the save on top of the loaded data and never writes only the new task", async () => {
    const gate = deferred<string | null>();
    const fake = fakeStorage({}, { onGet: () => gate.promise });
    const store = createTasksStore(fake.storage);
    const loading = store.load();
    const saving = store.upsert(NEW);
    await flush();
    expect(fake.setCalls).toEqual([]);

    gate.resolve(JSON.stringify([A, B]));
    await loading;

    expect(await saving).toBe(true);
    expect(fake.mainWrites()).toEqual([[A, B, NEW]]);
    expect(fake.mainWrites().some(list => (list as Task[]).length === 1)).toBe(false);
    expect(store.getState().tasks).toEqual([A, B, NEW]);
  });

  test("a remove issued during a slow load is applied to the loaded data", async () => {
    const gate = deferred<string | null>();
    const fake = fakeStorage({}, { onGet: () => gate.promise });
    const store = createTasksStore(fake.storage);
    const loading = store.load();
    const removing = store.remove("a");
    gate.resolve(JSON.stringify([A, B]));
    await loading;
    expect(await removing).toBe(true);
    expect(fake.mainWrites()).toEqual([[B]]);
  });
});

describe("locked (read failed)", () => {
  async function lockedStore() {
    const fake = fakeStorage({}, { onGet: () => { throw new Error("read boom"); } });
    const store = createTasksStore(fake.storage);
    await store.load();
    return { fake, store };
  }

  test("shows LOAD_ERROR, no tasks and finishes loading", async () => {
    const { store } = await lockedStore();
    expect(store.getState()).toEqual({ tasks: [], loading: false, error: LOAD_ERROR, lastRemoved: null, undo: null, writesBlocked: true });
  });

  test("upsert and remove return false and never touch storage", async () => {
    const { fake, store } = await lockedStore();
    expect(await store.upsert(NEW)).toBe(false);
    expect(await store.remove("a")).toBe(false);
    expect(fake.setCalls).toEqual([]);
    expect(store.getState().error).toBe(LOAD_ERROR);
  });

  test("an unexpected exception from loadTasks is treated as locked", async () => {
    const poisoned = { toString: () => "{", get length(): number { throw new Error("boom"); } };
    const fake = fakeStorage({}, { onGet: () => poisoned as unknown as string });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState()).toEqual({ tasks: [], loading: false, error: LOAD_ERROR, lastRemoved: null, undo: null, writesBlocked: true });
    expect(await store.upsert(NEW)).toBe(false);
    expect(fake.setCalls).toEqual([]);
  });

  test("a backup failure for unreadable data also locks writes", async () => {
    const fake = fakeStorage({ [KEY]: "{bad" }, {
      onSet: key => { if (key.startsWith(BACKUP_KEY_PREFIX)) throw new Error("full"); },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState().error).toBe(LOAD_ERROR);
    expect(await store.upsert(NEW)).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(fake.data.get(KEY)).toBe("{bad");
  });
});

describe("recovered", () => {
  test("starts fresh with RECOVERED_NOTICE, then allows writes that replace the main key", async () => {
    const fake = fakeStorage({ [KEY]: "{bad" });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState()).toEqual({ tasks: [], loading: false, error: RECOVERED_NOTICE, lastRemoved: null, undo: null, writesBlocked: false });

    expect(await store.upsert(NEW)).toBe(true);
    expect(fake.data.get(KEY)).toBe(JSON.stringify([NEW]));
    expect(fake.data.get(contentKey(BACKUP_KEY_PREFIX, "{bad"))).toBe("{bad");
    expect(store.getState().error).toBeNull();
  });
});

describe("ok with quarantined records", () => {
  test("shows valid tasks with a notice that the first successful write clears", async () => {
    const bad = { id: "bad", title: 5 };
    const fake = fakeStorage(storedList([A, bad, B]));
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState()).toEqual({ tasks: [A, B], loading: false, error: QUARANTINED_NOTICE, lastRemoved: null, undo: null, writesBlocked: false });

    const corruptText = JSON.stringify([bad]);
    expect(fake.data.get(contentKey(CORRUPT_KEY_PREFIX, corruptText))).toBe(corruptText);

    expect(await store.upsert(NEW)).toBe(true);
    expect(store.getState().error).toBeNull();
    expect(fake.mainWrites()).toEqual([[A, B, NEW]]);
  });

  test("shows no notice when nothing was quarantined", async () => {
    const { store } = await loadedStore();
    expect(store.getState()).toEqual({ tasks: [A, B], loading: false, error: null, lastRemoved: null, undo: null, writesBlocked: false });
  });
});

describe("read-only", () => {
  async function readOnlyStore() {
    const fake = fakeStorage(storedList([A, { id: "bad" }]), {
      onSet: key => { if (key.startsWith(CORRUPT_KEY_PREFIX)) throw new Error("full"); },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    return { fake, store };
  }

  test("shows the valid tasks with READ_ONLY_NOTICE", async () => {
    const { store } = await readOnlyStore();
    expect(store.getState()).toEqual({ tasks: [A], loading: false, error: READ_ONLY_NOTICE, lastRemoved: null, undo: null, writesBlocked: true });
  });

  test("refuses writes with READ_ONLY_NOTICE and never writes the main key", async () => {
    const { fake, store } = await readOnlyStore();
    expect(await store.upsert(NEW)).toBe(false);
    expect(await store.remove("a")).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState().error).toBe(READ_ONLY_NOTICE);
    expect(store.getState().tasks).toEqual([A]);
  });
});

describe("seed", () => {
  test("persists the seed through the queue on first load", async () => {
    const fake = fakeStorage();
    const store = createTasksStore(fake.storage);
    await store.load();
    const { tasks, loading, error } = store.getState();
    expect(tasks.length).toBeGreaterThan(0);
    expect([loading, error]).toEqual([false, null]);
    expect(fake.mainWrites()).toEqual([JSON.parse(JSON.stringify(tasks))]);
  });

  test("a save issued right after load comes after the seed write and builds on it", async () => {
    const fake = fakeStorage();
    const store = createTasksStore(fake.storage);
    const loading = store.load();
    const saving = store.upsert(NEW);
    await loading;
    expect(await saving).toBe(true);
    const writes = fake.mainWrites() as Task[][];
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual([...writes[0], NEW]);
  });

  test("a failing seed write sets SAVE_ERROR but keeps the seed tasks displayed", async () => {
    const fake = fakeStorage({}, { onSet: (key, _v, call) => { if (key === KEY && call === 1) throw new Error("full"); } });
    const store = createTasksStore(fake.storage);
    await store.load();
    const state = store.getState();
    expect(state.error).toBe(SAVE_ERROR);
    expect(state.tasks.length).toBeGreaterThan(0);
    expect(state.loading).toBe(false);
    expect(await store.upsert(NEW)).toBe(true);
    expect(store.getState().error).toBeNull();
  });
});

describe("pessimistic writes", () => {
  test("a failed write returns false, leaves tasks untouched and sets SAVE_ERROR", async () => {
    const { store } = await loadedStore([A], { onSet: () => { throw new Error("full"); } });
    const before = store.getState().tasks;
    expect(await store.upsert(B)).toBe(false);
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().error).toBe(SAVE_ERROR);
  });

  test("a later successful write has no duplicate and does not contain the failed task", async () => {
    const { fake, store } = await loadedStore([A], {
      onSet: (key, _v, call) => { if (key === KEY && call === 1) throw new Error("full"); },
    });
    expect(await store.upsert(B)).toBe(false);
    expect(await store.upsert(NEW)).toBe(true);
    expect(fake.data.get(KEY)).toBe(JSON.stringify([A, NEW]));
    expect(store.getState().tasks).toEqual([A, NEW]);
    expect(store.getState().error).toBeNull();
  });

  test("when write A fails while B was issued right after, B's stored list does not contain A", async () => {
    const gate = deferred();
    const { fake, store } = await loadedStore([A], {
      onSet: (key, _v, call) => (key === KEY && call === 1 ? gate.promise : undefined),
    });
    const failing = store.upsert(B);
    const following = store.upsert(NEW);
    await flush();
    gate.reject(new Error("full"));
    expect(await failing).toBe(false);
    expect(await following).toBe(true);
    expect(fake.data.get(KEY)).toBe(JSON.stringify([A, NEW]));
    expect(store.getState().tasks).toEqual([A, NEW]);
  });

  test("a failed remove keeps the task", async () => {
    const { store } = await loadedStore([A, B], { onSet: () => { throw new Error("full"); } });
    expect(await store.remove("a")).toBe(false);
    expect(store.getState().tasks).toEqual([A, B]);
    expect(store.getState().error).toBe(SAVE_ERROR);
  });

  test("back-to-back upserts are serialized and persisted in order", async () => {
    const gate = deferred();
    const { fake, store } = await loadedStore([A], {
      onSet: (key, _v, call) => (key === KEY && call === 1 ? gate.promise : undefined),
    });
    const first = store.upsert(B);
    const second = store.upsert(NEW);
    await flush();
    expect(fake.mainWrites()).toEqual([[A, B]]);
    gate.resolve();
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(fake.mainWrites()).toEqual([[A, B], [A, B, NEW]]);
    expect(store.getState().tasks).toEqual([A, B, NEW]);
  });

  test("upsert replaces an existing task in place", async () => {
    const { fake, store } = await loadedStore([A, B]);
    const edited = { ...A, title: "edited" };
    expect(await store.upsert(edited)).toBe(true);
    expect(fake.mainWrites()).toEqual([[edited, B]]);
  });

  test("remove deletes the task and persists the rest", async () => {
    const { fake, store } = await loadedStore([A, B]);
    expect(await store.remove("a")).toBe(true);
    expect(fake.mainWrites()).toEqual([[B]]);
    expect(store.getState().tasks).toEqual([B]);
  });

  test("does not mutate the previously committed list", async () => {
    const { store } = await loadedStore([A]);
    const before = store.getState().tasks;
    await store.upsert(B);
    expect(before).toEqual([A]);
    expect(store.getState().tasks).not.toBe(before);
  });
});

describe("dispose and token handling", () => {
  test("a late load result after dispose is ignored and never resolves ready", async () => {
    const gate = deferred<string | null>();
    const fake = fakeStorage({}, { onGet: () => gate.promise });
    const store = createTasksStore(fake.storage);
    const loading = store.load();
    let settled = false;
    void store.upsert(NEW).then(() => { settled = true; });
    store.dispose();
    gate.resolve(JSON.stringify([A, B]));
    await loading;
    await flush();
    expect(store.getState()).toEqual({ tasks: [], loading: true, error: null, lastRemoved: null, undo: null, writesBlocked: false });
    expect(settled).toBe(false);
    expect(fake.setCalls).toEqual([]);
  });

  test("load -> dispose -> load (StrictMode) ends unlocked with the second load's data", async () => {
    const stale = deferred<string | null>();
    const fake = fakeStorage({}, {
      onGet: call => (call === 1 ? stale.promise : JSON.stringify([A, B])),
    });
    const store = createTasksStore(fake.storage);
    const first = store.load();
    store.dispose();
    const second = store.load();
    await second;
    stale.resolve(JSON.stringify([task("stale")]));
    await first;

    expect(store.getState()).toEqual({ tasks: [A, B], loading: false, error: null, lastRemoved: null, undo: null, writesBlocked: false });
    expect(await store.upsert(NEW)).toBe(true);
    expect(fake.mainWrites()).toEqual([[A, B, NEW]]);
  });

  test("a save issued during the first load of a StrictMode double load waits for the second", async () => {
    const stale = deferred<string | null>();
    const fake = fakeStorage({}, {
      onGet: call => (call === 1 ? stale.promise : JSON.stringify([A, B])),
    });
    const store = createTasksStore(fake.storage);
    const first = store.load();
    const saving = store.upsert(NEW);
    store.dispose();
    const second = store.load();
    await second;
    stale.resolve(JSON.stringify([task("stale")]));
    await first;
    expect(await saving).toBe(true);
    expect(fake.mainWrites()).toEqual([[A, B, NEW]]);
  });

  test("calling load again re-locks until the new result arrives", async () => {
    const fake = fakeStorage(storedList([A]), {
      onGet: call => { if (call === 2) throw new Error("read boom"); return undefined; },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState().error).toBeNull();
    await store.load();
    expect(store.getState()).toEqual({ tasks: [], loading: false, error: LOAD_ERROR, lastRemoved: null, undo: null, writesBlocked: true });
    expect(await store.upsert(NEW)).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
  });
});

describe("subscriptions", () => {
  test("notifies once per change and stops after unsubscribe", async () => {
    const fake = fakeStorage(storedList([A]));
    const store = createTasksStore(fake.storage);
    const seen: unknown[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getState()));

    await store.load();
    expect(seen).toHaveLength(1);

    await store.upsert(B);
    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(2);

    unsubscribe();
    await store.upsert(NEW);
    expect(seen).toHaveLength(2);
  });

  test("clearError notifies and produces a new state only when there is an error", async () => {
    const { store } = await loadedStore([A], { onSet: () => { throw new Error("full"); } });
    await store.upsert(B);
    let notified = 0;
    store.subscribe(() => { notified += 1; });

    store.clearError();
    expect(store.getState().error).toBeNull();
    expect(notified).toBe(1);

    const stable = store.getState();
    store.clearError();
    expect(store.getState()).toBe(stable);
    expect(notified).toBe(1);
  });

  test("supports multiple listeners independently", async () => {
    const store = createTasksStore(fakeStorage(storedList([A])).storage);
    let one = 0;
    let two = 0;
    const offOne = store.subscribe(() => { one += 1; });
    store.subscribe(() => { two += 1; });
    offOne();
    await store.load();
    expect([one, two]).toEqual([0, 1]);
  });
});

describe("mutate", () => {
  test("applies the update to the committed list and persists it", async () => {
    const { fake, store } = await loadedStore([A, B]);
    const edited = { ...A, title: "edited" };
    const ok = await store.mutate(tasks => [edited, ...tasks.filter(t => t.id !== "a" && t.id !== "b"), NEW]);
    expect(ok).toBe(true);
    expect(fake.mainWrites()).toEqual([[edited, NEW]]);
    expect(store.getState().tasks).toEqual([edited, NEW]);
    expect(store.getState().error).toBeNull();
  });

  test("issued during a slow load it waits and is applied to the loaded data", async () => {
    const gate = deferred<string | null>();
    const fake = fakeStorage({}, { onGet: () => gate.promise });
    const store = createTasksStore(fake.storage);
    const loading = store.load();
    const mutating = store.mutate(tasks => tasks.map(t => ({ ...t, status: "done" as const })));
    await flush();
    expect(fake.setCalls).toEqual([]);

    gate.resolve(JSON.stringify([A, B]));
    await loading;
    expect(await mutating).toBe(true);
    expect(fake.mainWrites()).toEqual([[{ ...A, status: "done" }, { ...B, status: "done" }]]);
  });

  test("computes from the list committed by earlier queued writes", async () => {
    const { fake, store } = await loadedStore([A]);
    const first = store.upsert(B);
    const second = store.mutate(tasks => [...tasks, NEW]);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(fake.mainWrites()).toEqual([[A, B], [A, B, NEW]]);
  });

  test("refuses when locked without touching storage and without calling update", async () => {
    const fake = fakeStorage({}, { onGet: () => { throw new Error("read boom"); } });
    const store = createTasksStore(fake.storage);
    await store.load();
    let called = false;
    expect(await store.mutate(tasks => { called = true; return tasks; })).toBe(false);
    expect(called).toBe(false);
    expect(fake.setCalls).toEqual([]);
    expect(store.getState().error).toBe(LOAD_ERROR);
  });

  test("refuses when read-only without touching storage", async () => {
    const fake = fakeStorage(storedList([A, { id: "bad" }]), {
      onSet: key => { if (key.startsWith(CORRUPT_KEY_PREFIX)) throw new Error("full"); },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(await store.mutate(() => [])).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState().tasks).toEqual([A]);
    expect(store.getState().error).toBe(READ_ONLY_NOTICE);
  });

  test("a failed write returns false, leaves tasks unchanged and sets SAVE_ERROR", async () => {
    const { store } = await loadedStore([A], { onSet: () => { throw new Error("full"); } });
    const before = store.getState().tasks;
    expect(await store.mutate(tasks => [...tasks, B])).toBe(false);
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().error).toBe(SAVE_ERROR);
  });

  test("an update returning the same list is a successful no-op without a storage write", async () => {
    const { fake, store } = await loadedStore([A]);
    const before = store.getState();
    expect(await store.mutate(tasks => tasks)).toBe(true);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState()).toBe(before);
  });

  test("an update that throws resolves false with SAVE_ERROR, never writes and does not poison later writes", async () => {
    const { fake, store } = await loadedStore([A]);
    const before = store.getState().tasks;
    expect(await store.mutate(() => { throw new Error("bad update"); })).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().error).toBe(SAVE_ERROR);
    expect(await store.upsert(B)).toBe(true);
    expect(fake.mainWrites()).toEqual([[A, B]]);
    expect(store.getState().error).toBeNull();
  });
});

describe("queue health", () => {
  test("a turn that rejects (throwing subscriber) does not stall later writes", async () => {
    const { fake, store } = await loadedStore([A]);
    const unsubscribe = store.subscribe(() => { throw new Error("listener boom"); });
    await expect(store.upsert(B)).rejects.toThrow("listener boom");
    unsubscribe();
    expect(await store.upsert(NEW)).toBe(true);
    expect(fake.mainWrites()).toEqual([[A, B], [A, B, NEW]]);
  });
});

describe("MAX_RECORDS limit", () => {
  const many = (count: number) => Array.from({ length: count }, (_, i) => tiny(`m${i}`));

  test("refuses a list longer than MAX_RECORDS: false, TOO_MANY_TASKS_ERROR, no setItem, tasks untouched", async () => {
    const { fake, store } = await loadedStore([A]);
    const before = store.getState().tasks;
    expect(await store.mutate(() => many(MAX_RECORDS + 1))).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().error).toBe(TOO_MANY_TASKS_ERROR);
    expect(TOO_MANY_TASKS_ERROR).toBe("You have reached the maximum number of tasks.");
  });

  test("accepts exactly MAX_RECORDS tasks", async () => {
    const { fake, store } = await loadedStore([A]);
    expect(await store.mutate(() => many(MAX_RECORDS))).toBe(true);
    expect(fake.mainWrites()).toHaveLength(1);
    expect(store.getState().tasks).toHaveLength(MAX_RECORDS);
  });

  test("upsert of a new task onto a full list is refused; editing an existing one still works", async () => {
    const { fake, store } = await loadedStore(many(MAX_RECORDS));
    expect(await store.upsert(NEW)).toBe(false);
    expect(store.getState().error).toBe(TOO_MANY_TASKS_ERROR);
    expect(fake.mainWrites()).toEqual([]);
    expect(await store.upsert({ ...tiny("m0"), title: "edited" })).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  test("a silent write over the limit is refused without an error", async () => {
    const { fake, store } = await loadedStore([A]);
    expect(await store.mutate(() => many(MAX_RECORDS + 1), { silent: true })).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState().error).toBeNull();
  });
});

describe("silent mutate", () => {
  test("success persists and keeps an existing error notice", async () => {
    const fake = fakeStorage(storedList([A, { id: "bad" }]));
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState().error).toBe(QUARANTINED_NOTICE);
    expect(await store.mutate(tasks => [...tasks, B], { silent: true })).toBe(true);
    expect(fake.mainWrites()).toEqual([[A, B]]);
    expect(store.getState().tasks).toEqual([A, B]);
    expect(store.getState().error).toBe(QUARANTINED_NOTICE);
  });

  test("a non-silent success still clears the error", async () => {
    const fake = fakeStorage(storedList([A, { id: "bad" }]));
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(await store.mutate(tasks => [...tasks, B], { silent: false })).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  test("returns false without an error when writes are blocked (locked), without calling update", async () => {
    const fake = fakeStorage({}, { onGet: () => { throw new Error("read boom"); } });
    const store = createTasksStore(fake.storage);
    await store.load();
    store.clearError();
    let called = false;
    expect(await store.mutate(tasks => { called = true; return tasks; }, { silent: true })).toBe(false);
    expect(called).toBe(false);
    expect(store.getState().error).toBeNull();
    expect(fake.setCalls).toEqual([]);
  });

  test("returns false without an error when read-only", async () => {
    const fake = fakeStorage(storedList([A, { id: "bad" }]), {
      onSet: key => { if (key.startsWith(CORRUPT_KEY_PREFIX)) throw new Error("full"); },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    store.clearError();
    expect(await store.mutate(tasks => [...tasks, B], { silent: true })).toBe(false);
    expect(store.getState().error).toBeNull();
    expect(fake.mainWrites()).toEqual([]);
  });

  test("a failed persist returns false without an error and leaves tasks unchanged", async () => {
    const { store } = await loadedStore([A], { onSet: () => { throw new Error("full"); } });
    const before = store.getState().tasks;
    expect(await store.mutate(tasks => [...tasks, B], { silent: true })).toBe(false);
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().error).toBeNull();
  });

  test("a throwing update returns false without an error and keeps the queue healthy", async () => {
    const { store } = await loadedStore([A]);
    expect(await store.mutate(() => { throw new Error("bad"); }, { silent: true })).toBe(false);
    expect(store.getState().error).toBeNull();
    expect(await store.upsert(B)).toBe(true);
  });

  test("an existing SAVE_ERROR is kept by a later silent success", async () => {
    const { store } = await loadedStore([A], {
      onSet: (key, _v, call) => { if (key === KEY && call === 1) throw new Error("full"); },
    });
    expect(await store.upsert(B)).toBe(false);
    expect(store.getState().error).toBe(SAVE_ERROR);
    expect(await store.mutate(tasks => [...tasks, NEW], { silent: true })).toBe(true);
    expect(store.getState().error).toBe(SAVE_ERROR);
  });
});

describe("writesBlocked", () => {
  test("is false while loading and after a normal load", async () => {
    const store = createTasksStore(fakeStorage().storage);
    expect(store.getState().writesBlocked).toBe(false);
    await store.load();
    expect(store.getState().writesBlocked).toBe(false);
  });

  test("is true when the read failed (locked) and when the backup copy failed", async () => {
    const locked = createTasksStore(fakeStorage({}, { onGet: () => { throw new Error("boom"); } }).storage);
    await locked.load();
    expect(locked.getState().writesBlocked).toBe(true);

    const backupFails = createTasksStore(fakeStorage(
      { [KEY]: "{" },
      { onSet: key => { if (key.startsWith(BACKUP_KEY_PREFIX)) throw new Error("full"); } },
    ).storage);
    await backupFails.load();
    expect(backupFails.getState().writesBlocked).toBe(true);
  });

  test("is true when read-only", async () => {
    const fake = fakeStorage(storedList([A, { id: "bad" }]), {
      onSet: key => { if (key.startsWith(CORRUPT_KEY_PREFIX)) throw new Error("full"); },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState().writesBlocked).toBe(true);
  });

  test("is false after a recovered load and after quarantine succeeded", async () => {
    const recovered = createTasksStore(fakeStorage({ [KEY]: "{" }).storage);
    await recovered.load();
    expect(recovered.getState().writesBlocked).toBe(false);
    const { store } = await loadedStore([A]);
    expect(store.getState().writesBlocked).toBe(false);
  });

  test("clears again when a reload succeeds after a failed read", async () => {
    const fake = fakeStorage(storedList([A]), {
      onGet: call => { if (call === 1) throw new Error("read boom"); return undefined; },
    });
    const store = createTasksStore(fake.storage);
    await store.load();
    expect(store.getState().writesBlocked).toBe(true);
    await store.load();
    expect(store.getState().writesBlocked).toBe(false);
  });
});

describe("remove of an unknown id", () => {
  test("is a successful no-op: no storage write, state and lastRemoved untouched", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.remove("a");
    const before = store.getState();
    const writesBefore = fake.setCalls.length;

    expect(await store.remove("nope")).toBe(true);
    expect(fake.setCalls).toHaveLength(writesBefore);
    expect(store.getState()).toBe(before);
    expect(store.getState().lastRemoved).toEqual(A);
  });
});

describe("undo delete", () => {
  test("a successful remove records the removed task", async () => {
    const { store } = await loadedStore([A, B]);
    expect(await store.remove("a")).toBe(true);
    expect(store.getState().lastRemoved).toEqual(A);
    expect(store.getState().tasks).toEqual([B]);
  });

  test("the removal and lastRemoved appear in one notification", async () => {
    const { store } = await loadedStore([A, B]);
    const seen: { tasks: Task[]; lastRemoved: Task | null }[] = [];
    store.subscribe(() => seen.push({ tasks: store.getState().tasks, lastRemoved: store.getState().lastRemoved }));
    await store.remove("a");
    expect(seen).toEqual([{ tasks: [B], lastRemoved: A }]);
  });

  test("a failed remove does not set lastRemoved and keeps the previous one", async () => {
    const { store } = await loadedStore([A, B], {
      onSet: (key, _v, call) => { if (key === KEY && call === 2) throw new Error("full"); },
    });
    await store.remove("a");
    expect(await store.remove("b")).toBe(false);
    expect(store.getState().lastRemoved).toEqual(A);
    expect(store.getState().tasks).toEqual([B]);
  });

  test("a failed first remove leaves lastRemoved null", async () => {
    const { store } = await loadedStore([A], { onSet: () => { throw new Error("full"); } });
    expect(await store.remove("a")).toBe(false);
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("a later successful remove replaces lastRemoved", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.remove("b");
    expect(store.getState().lastRemoved).toEqual(B);
  });

  test("undoRemove restores the same task, persists it and clears lastRemoved", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.remove("a");
    expect(await store.undoRemove()).toBe(true);
    expect(fake.mainWrites()).toEqual([[B], [B, A]]);
    expect(store.getState().tasks).toEqual([B, A]);
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("undoRemove works if the list changed meanwhile", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.upsert(NEW);
    expect(await store.undoRemove()).toBe(true);
    expect(store.getState().tasks).toEqual([B, NEW, A]);
  });

  test("undoRemove does not duplicate or overwrite when the task id exists again with other content", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.upsert({ ...A, title: "re-added" });
    expect(await store.undoRemove()).toBe(false);
    expect(store.getState().tasks.filter(t => t.id === "a")).toEqual([{ ...A, title: "re-added" }]);
  });

  test("undoRemove does not duplicate when an identical task exists again", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.upsert(A);
    expect(await store.undoRemove()).toBe(false);
    expect(store.getState().tasks.filter(t => t.id === "a")).toEqual([A]);
  });

  test("undoRemove with nothing to undo returns false without touching storage", async () => {
    const { fake, store } = await loadedStore([A]);
    const before = store.getState();
    expect(await store.undoRemove()).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState()).toBe(before);
  });

  test("a failed undo write keeps lastRemoved so it can be retried", async () => {
    const { fake, store } = await loadedStore([A, B], {
      onSet: (key, _v, call) => { if (key === KEY && call === 2) throw new Error("full"); },
    });
    await store.remove("a");
    expect(await store.undoRemove()).toBe(false);
    expect(store.getState().lastRemoved).toEqual(A);
    expect(store.getState().tasks).toEqual([B]);
    expect(store.getState().error).toBe(SAVE_ERROR);

    expect(await store.undoRemove()).toBe(true);
    expect(fake.data.get(KEY)).toBe(JSON.stringify([B, A]));
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("undoRemove twice restores once and the second call returns false", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.remove("a");
    expect(await store.undoRemove()).toBe(true);
    expect(await store.undoRemove()).toBe(false);
    expect(store.getState().tasks).toEqual([B, A]);
    expect(fake.mainWrites()).toEqual([[B], [B, A]]);
  });

  test("two undoRemove calls issued together restore once", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    expect(await Promise.all([store.undoRemove(), store.undoRemove()])).toEqual([true, false]);
    expect(store.getState().tasks).toEqual([B, A]);
  });

  test("clearUndo clears lastRemoved, notifies once and is stable when already null", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    let notified = 0;
    store.subscribe(() => { notified += 1; });

    store.clearUndo();
    expect(store.getState().lastRemoved).toBeNull();
    expect(notified).toBe(1);

    const stable = store.getState();
    store.clearUndo();
    expect(store.getState()).toBe(stable);
    expect(notified).toBe(1);
    expect(await store.undoRemove()).toBe(false);
  });

  test("a reload clears lastRemoved", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.load();
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("undoRemove notifies once with tasks and lastRemoved changing together", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    const seen: { tasks: Task[]; lastRemoved: Task | null }[] = [];
    store.subscribe(() => seen.push({ tasks: store.getState().tasks, lastRemoved: store.getState().lastRemoved }));
    await store.undoRemove();
    expect(seen).toEqual([{ tasks: [B, A], lastRemoved: null }]);
  });
});

const dayOf = (t: Task): Task => ({ ...t, date: "2026-04-01" });
const failSecondWrite = { onSet: (key: string, _v: string, call: number) => { if (key === KEY && call === 2) throw new Error("full"); } };

describe("undo: remove records a delete", () => {
  test("remove sets undo kind delete with one change and count 1", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    expect(store.getState().undo).toEqual({ kind: "delete", count: 1, changes: [{ id: "a", before: A, after: null }] });
  });

  test("remove of an unknown id leaves the previous undo untouched", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    const undo = store.getState().undo;
    await store.remove("nope");
    expect(store.getState().undo).toBe(undo);
  });
});

describe("undo: mutate with an undo kind", () => {
  test("sets undo with the changed tasks and count in the same notification as the new list", async () => {
    const { store } = await loadedStore([A, B]);
    const seen: { tasks: Task[]; count: number | undefined }[] = [];
    store.subscribe(() => seen.push({ tasks: store.getState().tasks, count: store.getState().undo?.count }));
    expect(await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" })).toBe(true);
    expect(seen).toEqual([{ tasks: [dayOf(A), dayOf(B)], count: 2 }]);
    expect(store.getState().undo?.kind).toBe("bulk");
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("a series delete through mutate counts every removed task", async () => {
    const { store } = await loadedStore([A, B, NEW]);
    await store.mutate(tasks => tasks.filter(t => t.id === "new"), { undo: "delete" });
    expect(store.getState().undo).toMatchObject({ kind: "delete", count: 2 });
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("mutate without an undo option does not set or clear undo", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    const undo = store.getState().undo;
    await store.mutate(tasks => [...tasks, NEW]);
    expect(store.getState().undo).toBe(undo);
  });

  test("a no-op or order-only update does not set undo", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks, { undo: "bulk" });
    await store.mutate(tasks => [...tasks].reverse(), { undo: "bulk" });
    expect(store.getState().undo).toBeNull();
    expect(fake.mainWrites()).toEqual([[B, A]]);
  });

  test("a failed write does not set undo", async () => {
    const { store } = await loadedStore([A, B], { onSet: () => { throw new Error("full"); } });
    expect(await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" })).toBe(false);
    expect(store.getState().undo).toBeNull();
  });

  test("a refused write (too many tasks) does not set undo", async () => {
    const many = Array.from({ length: MAX_RECORDS }, (_, i) => tiny(`t${i}`));
    const { store } = await loadedStore(many);
    expect(await store.mutate(tasks => [...tasks, NEW], { undo: "bulk" })).toBe(false);
    expect(store.getState().undo).toBeNull();
  });

  test("a throwing update does not set undo", async () => {
    const { store } = await loadedStore([A]);
    expect(await store.mutate(() => { throw new Error("bad"); }, { undo: "bulk" })).toBe(false);
    expect(store.getState().undo).toBeNull();
  });

  test("works together with silent", async () => {
    const { store } = await loadedStore([A, B]);
    expect(await store.mutate(tasks => tasks.map(dayOf), { silent: true, undo: "bulk" })).toBe(true);
    expect(store.getState().undo?.count).toBe(2);
    expect(store.getState().error).toBeNull();
  });

  test("a newer undoable write replaces the older undo", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    await store.remove("a");
    expect(store.getState().undo).toMatchObject({ kind: "delete", count: 1 });
  });

  test("is refused while writes are blocked", async () => {
    const { store } = await loadedStore([A], { onGet: () => { throw new Error("read"); } });
    expect(await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" })).toBe(false);
    expect(store.getState().undo).toBeNull();
  });
});

describe("undoLast", () => {
  test("reverts a bulk edit, persists it and clears undo", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    expect(await store.undoLast()).toBe(true);
    expect(store.getState().tasks).toEqual([A, B]);
    expect(fake.data.get(KEY)).toBe(JSON.stringify([A, B]));
    expect(store.getState().undo).toBeNull();
  });

  test("restores a multi-task delete", async () => {
    const { store } = await loadedStore([A, B, NEW]);
    await store.mutate(tasks => tasks.filter(t => t.id === "new"), { undo: "delete" });
    expect(await store.undoLast()).toBe(true);
    expect(store.getState().tasks).toEqual([NEW, A, B]);
  });

  test("never reverts an unrelated later edit", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(t => (t.id === "a" ? dayOf(t) : t)), { undo: "bulk" });
    await store.upsert({ ...B, title: "edited later" });
    await store.upsert(NEW);
    expect(await store.undoLast()).toBe(true);
    expect(store.getState().tasks).toEqual([A, { ...B, title: "edited later" }, NEW]);
  });

  test("partial conflict reverts only the untouched tasks", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    await store.upsert({ ...dayOf(A), title: "later" });
    expect(await store.undoLast()).toBe(true);
    expect(store.getState().tasks).toEqual([{ ...dayOf(A), title: "later" }, B]);
    expect(store.getState().undo).toBeNull();
  });

  test("when every change was skipped it returns false, clears undo and does not write", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    await store.mutate(tasks => tasks.map(t => ({ ...t, title: "x" })));
    const writes = fake.mainWrites().length;
    expect(await store.undoLast()).toBe(false);
    expect(store.getState().undo).toBeNull();
    expect(fake.mainWrites()).toHaveLength(writes);
    expect(store.getState().tasks.map(t => t.title)).toEqual(["x", "x"]);
  });

  test("a deleted task whose id was re-created is skipped", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.upsert({ ...A, title: "re-created" });
    expect(await store.undoLast()).toBe(false);
    expect(store.getState().tasks.find(t => t.id === "a")?.title).toBe("re-created");
  });

  test("returns false with nothing to undo, without touching storage or state", async () => {
    const { fake, store } = await loadedStore([A]);
    const before = store.getState();
    expect(await store.undoLast()).toBe(false);
    expect(fake.mainWrites()).toEqual([]);
    expect(store.getState()).toBe(before);
  });

  test("a failed write keeps undo so it can be retried", async () => {
    const { fake, store } = await loadedStore([A, B], failSecondWrite);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    const undo = store.getState().undo;
    expect(await store.undoLast()).toBe(false);
    expect(store.getState().undo).toBe(undo);
    expect(store.getState().error).toBe(SAVE_ERROR);
    expect(store.getState().tasks).toEqual([dayOf(A), dayOf(B)]);

    expect(await store.undoLast()).toBe(true);
    expect(fake.data.get(KEY)).toBe(JSON.stringify([A, B]));
    expect(store.getState().undo).toBeNull();
  });

  test("a restore that would exceed MAX_RECORDS fails and keeps undo", async () => {
    const many = Array.from({ length: MAX_RECORDS }, (_, i) => tiny(`t${i}`));
    const { store } = await loadedStore(many);
    await store.remove("t0");
    await store.upsert(task("x1"));
    expect(await store.undoLast()).toBe(false);
    expect(store.getState().error).toBe(TOO_MANY_TASKS_ERROR);
    expect(store.getState().undo).not.toBeNull();
  });

  test("undo twice reverts once; the second call returns false", async () => {
    const { fake, store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    expect(await store.undoLast()).toBe(true);
    expect(await store.undoLast()).toBe(false);
    expect(fake.mainWrites()).toEqual([[dayOf(A), dayOf(B)], [A, B]]);
  });

  test("two calls issued together revert once", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    expect(await Promise.all([store.undoLast(), store.undoLast()])).toEqual([true, false]);
  });

  test("runs on the committed list: an edit queued before it is respected", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    const edit = store.upsert({ ...dayOf(A), title: "queued edit" });
    const undo = store.undoLast();
    expect(await Promise.all([edit, undo])).toEqual([true, true]);
    expect(store.getState().tasks).toEqual([{ ...dayOf(A), title: "queued edit" }, B]);
  });

  test("undo and the new list arrive in one notification", async () => {
    const { store } = await loadedStore([A, B]);
    await store.mutate(tasks => tasks.map(dayOf), { undo: "bulk" });
    const seen: { tasks: Task[]; undo: unknown }[] = [];
    store.subscribe(() => seen.push({ tasks: store.getState().tasks, undo: store.getState().undo }));
    await store.undoLast();
    expect(seen).toEqual([{ tasks: [A, B], undo: null }]);
  });

  test("a failed second remove keeps the first undo", async () => {
    const { store } = await loadedStore([A, B], failSecondWrite);
    await store.remove("a");
    const undo = store.getState().undo;
    await store.remove("b");
    expect(store.getState().undo).toBe(undo);
  });
});

describe("undo: compatibility and stability", () => {
  test("undoRemove is an alias and lastRemoved derives from a single delete", async () => {
    const { store } = await loadedStore([A, B]);
    expect(store.undoRemove).toBe(store.undoLast);
    await store.remove("a");
    expect(store.getState().lastRemoved).toEqual(A);
    expect(await store.undoRemove()).toBe(true);
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("clearUndo clears undo and lastRemoved once and is stable afterwards", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    store.clearUndo();
    expect(store.getState().undo).toBeNull();
    expect(store.getState().lastRemoved).toBeNull();
    expect(notified).toBe(1);
    const stable = store.getState();
    store.clearUndo();
    expect(store.getState()).toBe(stable);
    expect(notified).toBe(1);
  });

  test("a reload clears undo", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    await store.load();
    expect(store.getState().undo).toBeNull();
    expect(store.getState().lastRemoved).toBeNull();
  });

  test("getState keeps returning the same object between changes", async () => {
    const { store } = await loadedStore([A, B]);
    await store.remove("a");
    expect(store.getState()).toBe(store.getState());
  });
});

describe("undo count for a delete that also detaches rows", () => {
  test("counts only the removed tasks, not rows that were merely detached", async () => {
    const earlier = task("e", { seriesId: "s1", repeat: "daily" });
    const later = task("l", { seriesId: "s1", repeat: "daily" });
    const { store } = await loadedStore([earlier, later]);
    await store.mutate(tasks => tasks.filter(t => t.id !== "l").map(t => ({ ...t, seriesId: null })), { undo: "delete" });
    expect(store.getState().undo?.count).toBe(1);
    expect(store.getState().undo?.changes).toHaveLength(2);
  });
});
