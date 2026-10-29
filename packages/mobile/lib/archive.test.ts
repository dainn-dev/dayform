import { describe, test, expect } from "bun:test";
import {
  ARCHIVE_KEY,
  ARCHIVE_UNEXPECTED_NOTICE,
  DEFAULT_ARCHIVE_DAYS,
  MAX_ARCHIVE_BYTES,
  archivable,
  archiveButtonLabel,
  archiveNotice,
  mergeArchive,
  parseArchive,
  planArchive,
  readArchive,
  runArchive,
  runRestore,
  serializeArchive,
  type ArchiveStore,
} from "./archive";
import { MAX_STORED_BYTES } from "./backup-flow";
import { utf8Length } from "./text-size";
import { MAX_RECORDS, type KeyValueStorage } from "./task-storage";
import type { Task } from "./planner";

const TODAY = "2026-10-29";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, title: `Task ${id}`, date: "2026-03-10", start: "09:30", duration: 45,
    status: "done", category: "Work", notes: "", createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Small tasks, so MAX_RECORDS of them still fit under MAX_STORED_BYTES. */
const compact = (id: string): Task => task(id, { title: "", date: null, start: null, createdAt: "", status: "todo" });

function fakeStorage(initial: Record<string, string> = {}, failSet = false, failGet = false) {
  const data = new Map<string, string>(Object.entries(initial));
  const sets: [string, string][] = [];
  const storage: KeyValueStorage = {
    async getItem(key) {
      if (failGet) throw new Error("read");
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      sets.push([key, value]);
      if (failSet) throw new Error("full");
      data.set(key, value);
    },
  };
  return { storage, data, sets };
}

/** A store double that applies `update` to a list, like TasksStore.mutate does. */
function fakeStore(initial: Task[], ok = true) {
  const state = { tasks: initial, calls: 0, silent: [] as (boolean | undefined)[] };
  const store: ArchiveStore = {
    async mutate(update, options) {
      state.calls += 1;
      state.silent.push(options?.silent);
      if (!ok) return false;
      state.tasks = update(state.tasks);
      return true;
    },
  };
  return { store, state };
}

describe("archivable", () => {
  test("selects done tasks older than a year by date", () => {
    const old = task("old", { date: "2025-07-01" });
    const recent = task("recent", { date: "2026-08-15" });
    expect(archivable([old, recent], TODAY).map(t => t.id)).toEqual(["old"]);
  });

  test("the default window is 365 days", () => {
    expect(DEFAULT_ARCHIVE_DAYS).toBe(365);
  });

  test("the boundary: exactly 365 days old is kept, 366 days old is archivable", () => {
    // 2026-10-29 minus 365 days = 2025-10-29
    expect(archivable([task("edge", { date: "2025-10-29" })], TODAY)).toEqual([]);
    expect(archivable([task("past", { date: "2025-10-28" })], TODAY)).toHaveLength(1);
    expect(archivable([task("recent", { date: "2025-10-30" })], TODAY)).toEqual([]);
  });

  test("never archives todo or in-progress tasks", () => {
    const tasks = [task("a", { status: "todo" }), task("b", { status: "in_progress" })];
    expect(archivable(tasks, TODAY)).toEqual([]);
  });

  test("backlog tasks (no date) use the createdAt date", () => {
    const stale = task("stale", { date: null, start: null, createdAt: "2025-01-02T10:00:00.000Z" });
    const fresh = task("fresh", { date: null, start: null, createdAt: "2026-10-01T10:00:00.000Z" });
    expect(archivable([stale, fresh], TODAY).map(t => t.id)).toEqual(["stale"]);
  });

  test("a backlog task uses the LOCAL day of createdAt, not the UTC date prefix (just after / before midnight)", () => {
    const created = (day: number, hour: number, minute: number) =>
      task("b", { date: null, start: null, createdAt: new Date(2025, 9, day, hour, minute).toISOString() });
    // Local day 2025-10-29 is exactly the cutoff: kept, whatever the UTC date of that instant is.
    expect(archivable([created(29, 0, 30)], TODAY)).toEqual([]);
    expect(archivable([created(29, 23, 30)], TODAY)).toEqual([]);
    // Local day 2025-10-28 is past the cutoff: archived.
    expect(archivable([created(28, 0, 30)], TODAY)).toHaveLength(1);
    expect(archivable([created(28, 23, 30)], TODAY)).toHaveLength(1);
  });

  test("a backlog task with an unreadable createdAt is not archivable", () => {
    expect(archivable([task("x", { date: null, start: null, createdAt: "yesterday" })], TODAY)).toEqual([]);
  });

  test("a custom number of days is honoured", () => {
    const t = task("t", { date: "2026-10-01" });
    expect(archivable([t], TODAY, 30)).toHaveLength(0);
    expect(archivable([t], TODAY, 27)).toHaveLength(1);
  });

  test("handles an empty list", () => {
    expect(archivable([], TODAY)).toEqual([]);
  });
});

describe("planArchive", () => {
  test("moves the archivable tasks and the update removes only them", () => {
    const old = task("old", { date: "2025-01-01" });
    const keep = task("keep", { date: "2026-10-20" });
    const open = task("open", { date: "2025-01-01", status: "todo" });
    const plan = planArchive([old, keep, open], TODAY);
    expect(plan.moved).toEqual([old]);
    expect(plan.update([old, keep, open])).toEqual([keep, open]);
  });

  test("the update returns the very same list when nothing moves", () => {
    const list = [task("keep", { date: "2026-10-20" })];
    const plan = planArchive(list, TODAY);
    expect(plan.moved).toEqual([]);
    expect(plan.update(list)).toBe(list);
  });

  test("the update leaves a task alone that was edited after planning", () => {
    const old = task("old", { date: "2025-01-01" });
    const plan = planArchive([old], TODAY);
    const reopened = { ...old, status: "todo" as const };
    const list = [reopened, task("added", { date: "2026-10-20" })];
    expect(plan.update(list)).toBe(list);
  });

  test("the update does not mutate its input", () => {
    const old = task("old", { date: "2025-01-01" });
    const list = [old];
    planArchive(list, TODAY).update(list);
    expect(list).toEqual([old]);
  });

  test("honours a custom number of days", () => {
    const t = task("t", { date: "2026-10-01" });
    expect(planArchive([t], TODAY, 10).moved).toEqual([t]);
  });
});

describe("parseArchive and serializeArchive", () => {
  test("null means an empty archive", () => {
    expect(parseArchive(null)).toEqual({ ok: true, tasks: [] });
  });

  test("round-trips tasks", () => {
    const tasks = [task("a"), task("b", { date: null, start: null })];
    expect(parseArchive(serializeArchive(tasks))).toEqual({ ok: true, tasks });
  });

  test("rejects unparseable text, non-arrays and invalid records as corrupt", () => {
    expect(parseArchive("{nope")).toEqual({ ok: false, reason: "corrupt" });
    expect(parseArchive('{"a":1}')).toEqual({ ok: false, reason: "corrupt" });
    expect(parseArchive(JSON.stringify([task("a"), { id: "bad" }]))).toEqual({ ok: false, reason: "corrupt" });
  });

  test("rejects more than MAX_RECORDS records", () => {
    const raw = JSON.stringify(Array.from({ length: MAX_RECORDS + 1 }, (_, i) => task(`t${i}`)));
    expect(parseArchive(raw)).toEqual({ ok: false, reason: "corrupt" });
  });

  test("drops repeated ids, keeping the first", () => {
    const first = task("a", { title: "first" });
    const raw = JSON.stringify([first, task("a", { title: "second" })]);
    expect(parseArchive(raw)).toEqual({ ok: true, tasks: [first] });
  });
});

describe("mergeArchive", () => {
  test("appends new tasks and keeps existing order", () => {
    const a = task("a");
    const b = task("b");
    expect(mergeArchive([a], [b])).toEqual([a, b]);
  });

  test("dedupes by id; the incoming copy replaces the existing one in place", () => {
    const a = task("a");
    const newer = task("a", { title: "newer" });
    const b = task("b");
    expect(mergeArchive([a, b], [newer])).toEqual([newer, b]);
  });

  test("dedupes within the incoming list and handles empties", () => {
    const a = task("a");
    expect(mergeArchive([], [a, a])).toEqual([a]);
    expect(mergeArchive([a], [])).toEqual([a]);
    expect(mergeArchive([], [])).toEqual([]);
  });
});

describe("readArchive", () => {
  test("returns an empty archive when the key is absent", async () => {
    expect(await readArchive(fakeStorage().storage)).toEqual({ ok: true, tasks: [] });
  });

  test("returns the stored tasks", async () => {
    const tasks = [task("a")];
    const { storage } = fakeStorage({ [ARCHIVE_KEY]: serializeArchive(tasks) });
    expect(await readArchive(storage)).toEqual({ ok: true, tasks });
  });

  test("reports corrupt and failed reads", async () => {
    expect(await readArchive(fakeStorage({ [ARCHIVE_KEY]: "{" }).storage)).toEqual({ ok: false, reason: "corrupt" });
    expect(await readArchive(fakeStorage({}, false, true).storage)).toEqual({ ok: false, reason: "read-failed" });
  });
});

describe("runArchive", () => {
  const old = task("old", { date: "2025-01-01" });
  const keep = task("keep", { date: "2026-10-20" });

  test("writes the archive first, then removes the tasks from the store", async () => {
    const order: string[] = [];
    const fake = fakeStorage();
    const original = fake.storage.setItem;
    fake.storage.setItem = async (k, v) => { order.push("archive-write"); await original(k, v); };
    const { store, state } = fakeStore([old, keep]);
    const wrapped: ArchiveStore = { mutate: (u, o) => { order.push("store-mutate"); return store.mutate(u, o); } };

    const outcome = await runArchive(fake.storage, wrapped, [old, keep], TODAY);
    expect(outcome).toEqual({ ok: true, archived: 1, total: 1 });
    expect(order).toEqual(["archive-write", "store-mutate"]);
    expect(state.tasks).toEqual([keep]);
    expect(parseArchive(fake.data.get(ARCHIVE_KEY) ?? null)).toEqual({ ok: true, tasks: [old] });
    expect(state.silent).toEqual([true]);
  });

  test("merges with what is already archived", async () => {
    const earlier = task("earlier", { date: "2025-01-01" });
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([earlier]) });
    const { store } = fakeStore([old]);
    expect(await runArchive(fake.storage, store, [old], TODAY)).toEqual({ ok: true, archived: 1, total: 2 });
    expect(parseArchive(fake.data.get(ARCHIVE_KEY) ?? null)).toEqual({ ok: true, tasks: [earlier, old] });
  });

  test("with nothing to archive it touches neither storage nor store", async () => {
    const fake = fakeStorage();
    const { store, state } = fakeStore([keep]);
    expect(await runArchive(fake.storage, store, [keep], TODAY)).toEqual({ ok: false, reason: "nothing-to-archive" });
    expect(fake.sets).toEqual([]);
    expect(state.calls).toBe(0);
  });

  test("a failed archive write leaves the store untouched", async () => {
    const fake = fakeStorage({}, true);
    const { store, state } = fakeStore([old]);
    expect(await runArchive(fake.storage, store, [old], TODAY)).toEqual({ ok: false, reason: "write-failed" });
    expect(state.calls).toBe(0);
    expect(state.tasks).toEqual([old]);
  });

  test("a failed store write keeps the tasks in both places", async () => {
    const fake = fakeStorage();
    const { store, state } = fakeStore([old], false);
    expect(await runArchive(fake.storage, store, [old], TODAY)).toEqual({ ok: false, reason: "save-failed" });
    expect(state.tasks).toEqual([old]);
    expect(parseArchive(fake.data.get(ARCHIVE_KEY) ?? null)).toEqual({ ok: true, tasks: [old] });
  });

  test("refuses to touch a corrupt or unreadable archive", async () => {
    const corrupt = fakeStorage({ [ARCHIVE_KEY]: "{" });
    const { store, state } = fakeStore([old]);
    expect(await runArchive(corrupt.storage, store, [old], TODAY)).toEqual({ ok: false, reason: "corrupt" });
    expect(corrupt.sets).toEqual([]);
    expect(await runArchive(fakeStorage({}, false, true).storage, store, [old], TODAY)).toEqual({ ok: false, reason: "read-failed" });
    expect(state.calls).toBe(0);
  });

  test("refuses when the archive would exceed MAX_ARCHIVE_BYTES", async () => {
    const big = task("big", { date: "2025-01-01", notes: "x".repeat(10_000) });
    const existing = Array.from({ length: Math.ceil(MAX_ARCHIVE_BYTES / 10_100) + 1 }, (_, i) => ({ ...big, id: `e${i}` }));
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive(existing) });
    const { store, state } = fakeStore([big]);
    expect(await runArchive(fake.storage, store, [big], TODAY)).toEqual({ ok: false, reason: "too-large" });
    expect(fake.sets).toEqual([]);
    expect(state.calls).toBe(0);
  });

  test("measures the archive in UTF-8 bytes, not characters", async () => {
    const wide = task("wide", { date: "2025-01-01", notes: "€".repeat(9_999) });
    const existing = Array.from({ length: 40 }, (_, i) => ({ ...wide, id: `e${i}` }));
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive(existing) });
    const { store } = fakeStore([wide]);
    expect(await runArchive(fake.storage, store, [wide], TODAY)).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("runRestore", () => {
  const a = task("a", { date: "2025-01-01" });
  const b = task("b", { date: "2025-01-02" });

  test("merges archived tasks back, then clears them from the archive", async () => {
    const live = task("live", { date: "2026-10-20" });
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a, b]) });
    const { store, state } = fakeStore([live]);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 2, remaining: 0, archiveCleared: true });
    expect(state.tasks).toEqual([live, a, b]);
    expect(parseArchive(fake.data.get(ARCHIVE_KEY) ?? null)).toEqual({ ok: true, tasks: [] });
    expect(state.silent).toEqual([true]);
  });

  test("writes the store before it rewrites the archive", async () => {
    const order: string[] = [];
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a]) });
    const original = fake.storage.setItem;
    fake.storage.setItem = async (k, v) => { order.push("archive-write"); await original(k, v); };
    const { store } = fakeStore([]);
    await runRestore(fake.storage, { mutate: (u, o) => { order.push("store-mutate"); return store.mutate(u, o); } });
    expect(order).toEqual(["store-mutate", "archive-write"]);
  });

  test("does not duplicate tasks already in the list and keeps the live copy", async () => {
    const live = { ...a, title: "edited live" };
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a, b]) });
    const { store, state } = fakeStore([live]);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 1, remaining: 0, archiveCleared: true });
    expect(state.tasks).toEqual([live, b]);
  });

  test("respects MAX_RECORDS and keeps the rest archived", async () => {
    const filler = Array.from({ length: MAX_RECORDS - 1 }, (_, i) => compact(`f${i}`));
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a, b]) });
    const { store, state } = fakeStore(filler);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 1, remaining: 1, archiveCleared: true });
    expect(state.tasks).toHaveLength(MAX_RECORDS);
    expect(parseArchive(fake.data.get(ARCHIVE_KEY) ?? null)).toEqual({ ok: true, tasks: [b] });
  });

  test("a full list restores nothing and leaves the archive file alone", async () => {
    const full = Array.from({ length: MAX_RECORDS }, (_, i) => compact(`f${i}`));
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a, b]) });
    const { store, state } = fakeStore(full);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 0, remaining: 2, archiveCleared: true });
    expect(state.tasks).toBe(full);
    expect(fake.sets).toEqual([]);
  });

  test("an empty archive is reported and nothing is written", async () => {
    const fake = fakeStorage();
    const { store, state } = fakeStore([]);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: false, reason: "nothing-archived" });
    expect(state.calls).toBe(0);
    expect(fake.sets).toEqual([]);
  });

  test("a failed store write keeps the archive intact", async () => {
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a]) });
    const { store } = fakeStore([], false);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: false, reason: "save-failed" });
    expect(fake.sets).toEqual([]);
  });

  test("a failed archive cleanup still reports the restore, flagged", async () => {
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a]) });
    let failing = false;
    const original = fake.storage.setItem;
    fake.storage.setItem = async (k, v) => { if (failing) throw new Error("full"); await original(k, v); };
    const { store, state } = fakeStore([]);
    failing = true;
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 1, remaining: 0, archiveCleared: false });
    expect(state.tasks).toEqual([a]);
  });

  test("refuses to touch a corrupt or unreadable archive", async () => {
    const { store, state } = fakeStore([]);
    expect(await runRestore(fakeStorage({ [ARCHIVE_KEY]: "{" }).storage, store)).toEqual({ ok: false, reason: "corrupt" });
    expect(await runRestore(fakeStorage({}, false, true).storage, store)).toEqual({ ok: false, reason: "read-failed" });
    expect(state.calls).toBe(0);
  });
});

describe("archiveNotice", () => {
  test("archived tasks", () => {
    expect(archiveNotice({ ok: true, archived: 1, total: 1 })).toEqual({ tone: "success", parts: [{ key: "task archived", count: 1 }] });
    expect(archiveNotice({ ok: true, archived: 5, total: 9 })).toEqual({ tone: "success", parts: [{ key: "tasks archived", count: 5 }] });
  });

  test("restored tasks, with what stays archived and a cleanup warning", () => {
    expect(archiveNotice({ ok: true, restored: 1, remaining: 0, archiveCleared: true })).toEqual({
      tone: "success", parts: [{ key: "task restored", count: 1 }],
    });
    expect(archiveNotice({ ok: true, restored: 3, remaining: 2, archiveCleared: false })).toEqual({
      tone: "success",
      parts: [
        { key: "tasks restored", count: 3 },
        { key: "tasks stay in the archive because there is no room left", count: 2 },
        { key: "The archive copy could not be cleared." },
      ],
    });
    expect(archiveNotice({ ok: true, restored: 1, remaining: 1, archiveCleared: true }).parts[1]).toEqual({
      key: "task stays in the archive because there is no room left", count: 1,
    });
  });

  test("every failure reason has an error message", () => {
    const reasons = ["nothing-to-archive", "nothing-archived", "too-large", "write-failed", "save-failed", "corrupt", "read-failed"] as const;
    for (const reason of reasons) {
      const notice = archiveNotice({ ok: false, reason });
      expect(notice.tone).toBe(reason.startsWith("nothing") ? "success" : "error");
      expect(notice.parts).toHaveLength(1);
      expect(notice.parts[0].key.length).toBeGreaterThan(0);
    }
  });
});

/** Storage whose reads and writes yield to other callers, so unserialised runs would interleave. */
function slowStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, 2));
  const storage: KeyValueStorage = {
    async getItem(key) {
      await pause();
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      await pause();
      data.set(key, value);
    },
  };
  return { storage, data };
}

/** One shared task list that several runs write to, with a yielding mutate like the real queue. */
function sharedStore(initial: Task[]) {
  const state = { tasks: initial };
  const store: ArchiveStore = {
    async mutate(update) {
      await new Promise<void>(resolve => setTimeout(resolve, 1));
      state.tasks = update(state.tasks);
      return true;
    },
  };
  return { store, state };
}

const archivedIds = (data: Map<string, string>): string[] => {
  const parsed = parseArchive(data.get(ARCHIVE_KEY) ?? null);
  return parsed.ok ? parsed.tasks.map(item => item.id).sort() : ["<corrupt>"];
};

describe("serialised archive runs", () => {
  test("two overlapping archive runs both land in the archive", async () => {
    const one = task("one", { date: "2025-01-01" });
    const two = task("two", { date: "2025-01-02" });
    const { storage, data } = slowStorage();
    const { store, state } = sharedStore([one, two]);

    const [first, second] = await Promise.all([
      runArchive(storage, store, [one], TODAY),
      runArchive(storage, store, [two], TODAY),
    ]);

    expect(first).toEqual({ ok: true, archived: 1, total: 1 });
    expect(second).toEqual({ ok: true, archived: 1, total: 2 });
    expect(archivedIds(data)).toEqual(["one", "two"]);
    expect(state.tasks).toEqual([]);
  });

  test("an archive and a restore started together lose nothing", async () => {
    const earlier = task("earlier", { date: "2024-01-01" });
    const fresh = task("fresh", { date: "2025-01-01" });
    const { storage, data } = slowStorage({ [ARCHIVE_KEY]: serializeArchive([earlier]) });
    const { store, state } = sharedStore([fresh]);

    await Promise.all([runArchive(storage, store, [fresh], TODAY), runRestore(storage, store)]);

    const everything = new Set([...state.tasks.map(item => item.id), ...archivedIds(data)]);
    expect([...everything].sort()).toEqual(["earlier", "fresh"]);
  });

  test("a restore queued behind an archive sees what the archive wrote", async () => {
    const fresh = task("fresh", { date: "2025-01-01" });
    const { storage, data } = slowStorage();
    const { store, state } = sharedStore([fresh]);
    const [, restored] = await Promise.all([runArchive(storage, store, [fresh], TODAY), runRestore(storage, store)]);
    expect(restored).toEqual({ ok: true, restored: 1, remaining: 0, archiveCleared: true });
    expect(state.tasks.map(item => item.id)).toEqual(["fresh"]);
    expect(archivedIds(data)).toEqual([]);
  });

  test("a run that throws does not block the runs queued behind it", async () => {
    const old = task("old", { date: "2025-01-01" });
    const { storage } = slowStorage();
    const exploding: ArchiveStore = { mutate: async () => { throw new Error("store crashed"); } };
    const { store } = sharedStore([old]);
    const crashed = runArchive(storage, exploding, [old], TODAY);
    const next = runArchive(storage, store, [old], TODAY);
    await expect(crashed).rejects.toThrow("store crashed");
    expect((await next).ok).toBe(true);
  });

  test("different storages do not wait for each other", async () => {
    const old = task("old", { date: "2025-01-01" });
    const a = slowStorage();
    const b = slowStorage();
    const { store } = sharedStore([old]);
    const results = await Promise.all([runArchive(a.storage, store, [old], TODAY), runArchive(b.storage, store, [old], TODAY)]);
    expect(results.every(result => result.ok)).toBe(true);
  });
});

describe("runArchive store contract", () => {
  const old = task("old", { date: "2025-01-01" });

  test("reports what the store really removed when a moved task was edited meanwhile", async () => {
    const fake = fakeStorage();
    const edited = { ...old, title: "edited after planning" };
    const { store, state } = fakeStore([edited]);
    expect(await runArchive(fake.storage, store, [old], TODAY)).toEqual({ ok: true, archived: 0, total: 1 });
    expect(state.tasks).toEqual([edited]);
  });

  test("counts only the removed tasks when some were edited and some were not", async () => {
    const second = task("second", { date: "2025-01-02" });
    const fake = fakeStorage();
    const { store, state } = fakeStore([{ ...old, notes: "changed" }, second]);
    expect(await runArchive(fake.storage, store, [old, second], TODAY)).toEqual({ ok: true, archived: 1, total: 2 });
    expect(state.tasks.map(item => item.id)).toEqual(["old"]);
  });

  test("a store that never calls update is a failed save, not a success", async () => {
    const fake = fakeStorage();
    const lazy: ArchiveStore = { mutate: async () => true };
    expect(await runArchive(fake.storage, lazy, [old], TODAY)).toEqual({ ok: false, reason: "save-failed" });
  });

  test("a store that calls update twice uses the result of the last call", async () => {
    const fake = fakeStorage();
    const state = { tasks: [old] };
    const twice: ArchiveStore = {
      async mutate(update) {
        update([]);
        state.tasks = update(state.tasks);
        return true;
      },
    };
    expect(await runArchive(fake.storage, twice, [old], TODAY)).toEqual({ ok: true, archived: 1, total: 1 });
    expect(state.tasks).toEqual([]);
  });
});

describe("runRestore limits and store contract", () => {
  /** A list of ~10 KB tasks whose JSON is exactly `MAX_STORED_BYTES - room` bytes. */
  function listWithRoom(room: number): Task[] {
    const bulky = (id: string, notes: string) => task(id, { notes, date: null, start: null });
    const base = Array.from({ length: 140 }, (_, i) => bulky(`live${i}`, "n".repeat(10_000)));
    const used = utf8Length(JSON.stringify(base));
    const last = base[base.length - 1];
    const adjusted = { ...last, notes: "n".repeat(10_000 + (MAX_STORED_BYTES - room - used)) };
    return [...base.slice(0, -1), adjusted];
  }
  const bulkyArchived = (count: number): Task[] =>
    Array.from({ length: count }, (_, i) => task(`arc${i}`, { date: "2025-01-01", notes: "a".repeat(10_000) }));

  test("restores only as many tasks as fit in MAX_STORED_BYTES and keeps the rest archived", async () => {
    const live = listWithRoom(35_000);
    expect(utf8Length(JSON.stringify(live))).toBe(MAX_STORED_BYTES - 35_000);
    const archived = bulkyArchived(80);
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive(archived) });
    const { store, state } = fakeStore(live);

    const outcome = await runRestore(fake.storage, store);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.restored).toBeGreaterThan(0);
    expect(outcome.remaining).toBeGreaterThan(0);
    expect(outcome.restored + outcome.remaining).toBe(80);
    expect(utf8Length(JSON.stringify(state.tasks))).toBeLessThanOrEqual(MAX_STORED_BYTES);
    expect(state.tasks.slice(live.length).map(item => item.id)).toEqual(archived.slice(0, outcome.restored).map(item => item.id));
    expect(archivedIds(fake.data)).toEqual(archived.slice(outcome.restored).map(item => item.id).sort());
  });

  test("never loses a task: everything is either in the list or still archived", async () => {
    const live = listWithRoom(35_000);
    const archived = bulkyArchived(80);
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive(archived) });
    const { store, state } = fakeStore(live);
    await runRestore(fake.storage, store);
    const present = new Set([...state.tasks.map(item => item.id), ...archivedIds(fake.data)]);
    for (const item of archived) expect(present.has(item.id)).toBe(true);
  });

  test("a list already at the size limit restores nothing and leaves the archive alone", async () => {
    const live = listWithRoom(0);
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive(bulkyArchived(3)) });
    const { store, state } = fakeStore(live);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 0, remaining: 3, archiveCleared: true });
    expect(state.tasks).toBe(live);
    expect(fake.sets).toEqual([]);
  });

  test("a task that does not fit is skipped, and a smaller one behind it is still restored", async () => {
    const live = listWithRoom(2_000);
    const huge = task("huge", { date: "2025-01-01", notes: "h".repeat(10_000) });
    const tiny = task("tiny", { date: null, start: null, title: "", createdAt: "", notes: "" });
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([huge, tiny]) });
    const { store, state } = fakeStore(live);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 1, remaining: 1, archiveCleared: true });
    expect(state.tasks[state.tasks.length - 1].id).toBe("tiny");
    expect(archivedIds(fake.data)).toEqual(["huge"]);
  });

  test("restores into an empty list (no leading comma in the size math)", async () => {
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([task("a", { date: "2025-01-01" })]) });
    const { store, state } = fakeStore([]);
    expect(await runRestore(fake.storage, store)).toEqual({ ok: true, restored: 1, remaining: 0, archiveCleared: true });
    expect(state.tasks.map(item => item.id)).toEqual(["a"]);
  });

  test("a store that never calls update is a failed save and the archive is left alone", async () => {
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([task("a", { date: "2025-01-01" })]) });
    const lazy: ArchiveStore = { mutate: async () => true };
    expect(await runRestore(fake.storage, lazy)).toEqual({ ok: false, reason: "save-failed" });
    expect(fake.sets).toEqual([]);
  });

  test("a store that calls update twice uses the result of the last call", async () => {
    const a = task("a", { date: "2025-01-01" });
    const fake = fakeStorage({ [ARCHIVE_KEY]: serializeArchive([a]) });
    const state = { tasks: [] as Task[] };
    const twice: ArchiveStore = {
      async mutate(update) {
        update([a]);
        state.tasks = update(state.tasks);
        return true;
      },
    };
    expect(await runRestore(fake.storage, twice)).toEqual({ ok: true, restored: 1, remaining: 0, archiveCleared: true });
    expect(state.tasks).toEqual([a]);
  });
});

describe("archive labels", () => {
  test("the button label takes the number of days from the constant", () => {
    expect(archiveButtonLabel(text => text)).toBe(`Archive tasks completed more than ${DEFAULT_ARCHIVE_DAYS} days ago`);
    const vi = (text: string) => (text.startsWith("Archive tasks") ? "Lưu trữ công việc đã hoàn thành hơn {n} ngày trước" : text);
    expect(archiveButtonLabel(vi)).toBe(`Lưu trữ công việc đã hoàn thành hơn ${DEFAULT_ARCHIVE_DAYS} ngày trước`);
  });

  test("the unexpected-failure notice is an error with a single translation key", () => {
    expect(ARCHIVE_UNEXPECTED_NOTICE).toEqual({ tone: "error", parts: [{ key: "Something went wrong. Please try again." }] });
  });
});
