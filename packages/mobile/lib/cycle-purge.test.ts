import { describe, expect, test } from "bun:test";
import { serializeBackup } from "./backup";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle";
import {
  cancelCycleReminders, deleteAllCycleData, isIncomplete, purgeCycleCopies, stripCycleFromCopy, type PurgeStorage,
} from "./cycle-purge";
import { CYCLE_CORRUPT_PREFIX, CYCLE_KEY } from "./cycle-store";
import type { Task } from "./planner";
import { CYCLE_ID_PREFIX, REMINDER_ID_PREFIX, type ReminderScheduler } from "./reminders";
import { SNAPSHOT_KEY_PREFIX } from "./snapshots";
import { BACKUP_KEY_PREFIX, CORRUPT_KEY_PREFIX, contentKey } from "./task-storage";

const NOW = new Date(2026, 5, 15, 9, 0);
const CYCLE: CycleState = { ...DEFAULT_CYCLE_STATE, enabled: true, periods: [{ start: "2026-05-20", end: "2026-05-24" }] };
const task = (id: string): Task => ({
  id, title: id, date: "2026-06-15", start: "10:00", duration: 30, status: "todo", category: "Work", notes: "", createdAt: "2026-06-01T00:00:00.000Z",
});
const compact = (tasks: Task[], cycle?: CycleState) => serializeBackup(tasks, NOW, { compact: true, cycle });

type Hooks = { failGet?: (key: string) => boolean; failSet?: (key: string) => boolean; failRemove?: (key: string) => boolean; failList?: boolean };

function fakeStorage(initial: Record<string, string>, hooks: Hooks = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: PurgeStorage = {
    async getAllKeys() {
      if (hooks.failList) throw new Error("list failed");
      return [...data.keys()];
    },
    async getItem(key) {
      if (hooks.failGet?.(key)) throw new Error("read failed");
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (hooks.failSet?.(key)) throw new Error("write failed");
      writes.push(key);
      data.set(key, value);
    },
    async removeItem(key) {
      if (hooks.failRemove?.(key)) throw new Error("remove failed");
      data.delete(key);
    },
  };
  return { storage, data, writes };
}

describe("stripCycleFromCopy", () => {
  test("drops the tracker and its health-data markers, keeps the tasks", () => {
    const text = compact([task("a")], CYCLE);
    expect(text).toContain("containsHealthData");
    const result = stripCycleFromCopy(text);
    expect(result.kind).toBe("rewrite");
    if (result.kind !== "rewrite") return;
    const parsed = JSON.parse(result.text);
    expect(parsed.cycle).toBeUndefined();
    expect(parsed.containsHealthData).toBeUndefined();
    expect(parsed.notice).toBeUndefined();
    expect(parsed.tasks).toEqual([task("a")]);
    expect(parsed.format).toBe("dayform-backup");
    expect(result.text).not.toContain("2026-05-20");
  });

  test("keeps invalid task records untouched (it never validates or repairs them)", () => {
    const text = JSON.stringify({ format: "dayform-backup", version: 1, tasks: [{ junk: 1 }], cycle: {} });
    expect(stripCycleFromCopy(text)).toEqual({ kind: "rewrite", text: JSON.stringify({ format: "dayform-backup", version: 1, tasks: [{ junk: 1 }] }) });
  });

  test("an envelope version this code does not know is kept untouched", () => {
    const newer = JSON.stringify({ format: "dayform-backup", version: 2, items: [{ a: 1 }], cycle: {} });
    expect(stripCycleFromCopy(newer)).toEqual({ kind: "keep" });
  });

  test("a copy that would be left with nothing is removed", () => {
    expect(stripCycleFromCopy(compact([], CYCLE))).toEqual({ kind: "remove" });
    const tasksless = JSON.stringify({ format: "dayform-backup", version: 1, tasks: "bad", cycle: {} });
    expect(stripCycleFromCopy(tasksless)).toEqual({ kind: "remove" });
  });

  test("a tasks-less copy that still holds custom categories is rewritten, not removed", () => {
    const text = JSON.stringify({ format: "dayform-backup", version: 1, tasks: [], categories: { x: 1 }, cycle: {} });
    expect(stripCycleFromCopy(text).kind).toBe("rewrite");
  });

  test("leaves everything else alone", () => {
    for (const text of [
      compact([task("a")]),
      "not json",
      "[]",
      "null",
      JSON.stringify({ format: "other", cycle: {} }),
      JSON.stringify([{ id: "x" }]),
    ]) expect(stripCycleFromCopy(text)).toEqual({ kind: "keep" });
  });
});

describe("purgeCycleCopies", () => {
  test("removes every tracker corrupt copy", async () => {
    const { storage, data } = fakeStorage({ [`${CYCLE_CORRUPT_PREFIX}a-1`]: "x", [`${CYCLE_CORRUPT_PREFIX}b-2`]: "y" });
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 2, rewritten: 0, failed: [], listFailed: false });
    expect(data.size).toBe(0);
  });

  test("rewrites a snapshot under the same key, without the tracker", async () => {
    const key = `${SNAPSHOT_KEY_PREFIX}2026-06-10`;
    const { storage, data } = fakeStorage({ [key]: compact([task("a")], CYCLE) });
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 0, rewritten: 1, failed: [], listFailed: false });
    expect(JSON.parse(data.get(key)!).cycle).toBeUndefined();
    expect(JSON.parse(data.get(key)!).tasks).toHaveLength(1);
  });

  test("a safety copy keeps the content-addressed key scheme: new key from the new text, old key gone", async () => {
    const oldText = compact([task("a")], CYCLE);
    const oldKey = contentKey(BACKUP_KEY_PREFIX, oldText);
    const { storage, data } = fakeStorage({ [oldKey]: oldText });
    expect(await purgeCycleCopies(storage)).toMatchObject({ rewritten: 1, failed: [] });
    expect(data.has(oldKey)).toBe(false);
    const [newKey] = [...data.keys()];
    expect(newKey).toBe(contentKey(BACKUP_KEY_PREFIX, data.get(newKey!)!));
    expect(newKey!.startsWith(BACKUP_KEY_PREFIX)).toBe(true);
    expect(data.get(newKey!)).not.toContain("2026-05-20");
  });

  test("removes copies that held only the tracker", async () => {
    const text = compact([], CYCLE);
    const keys = [`${SNAPSHOT_KEY_PREFIX}2026-06-10`, contentKey(BACKUP_KEY_PREFIX, text)];
    const { storage, data } = fakeStorage({ [keys[0]!]: text, [keys[1]!]: text });
    expect(await purgeCycleCopies(storage)).toMatchObject({ removed: 2, rewritten: 0 });
    expect(data.size).toBe(0);
  });

  test("never touches the main keys, the tasks, task corrupt copies, raw backups or other keys", async () => {
    const initial = {
      [CYCLE_KEY]: JSON.stringify(CYCLE),
      "dayform.tasks.v1": compact([task("a")], CYCLE),
      [`${CORRUPT_KEY_PREFIX}1-1`]: compact([task("a")], CYCLE),
      [`${BACKUP_KEY_PREFIX}raw-1`]: "{broken",
      [`${SNAPSHOT_KEY_PREFIX}2026-06-10`]: compact([task("a")]),
      "dayform.language.v1": "vi",
    };
    const { storage, data, writes } = fakeStorage(initial);
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 0, rewritten: 0, failed: [], listFailed: false });
    expect(writes).toEqual([]);
    expect(Object.fromEntries(data)).toEqual(initial);
  });

  test("a prefix with nothing after it is not a copy", async () => {
    const { storage, data } = fakeStorage({ [SNAPSHOT_KEY_PREFIX]: compact([task("a")], CYCLE), [CYCLE_CORRUPT_PREFIX]: "x" });
    expect((await purgeCycleCopies(storage)).removed).toBe(0);
    expect(data.size).toBe(2);
  });

  test("one failing key is reported and does not stop the others", async () => {
    const bad = `${SNAPSHOT_KEY_PREFIX}2026-06-01`;
    const good = `${SNAPSHOT_KEY_PREFIX}2026-06-08`;
    const { storage, data } = fakeStorage(
      { [bad]: compact([task("a")], CYCLE), [good]: compact([task("b")], CYCLE), [`${CYCLE_CORRUPT_PREFIX}z-1`]: "x" },
      { failSet: key => key === bad },
    );
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 1, rewritten: 1, failed: [bad], listFailed: false });
    expect(JSON.parse(data.get(good)!).cycle).toBeUndefined();
    expect(data.has(`${CYCLE_CORRUPT_PREFIX}z-1`)).toBe(false);
  });

  test("failed reads and failed removals (also of the old key after a rewrite) are all reported", async () => {
    const readKey = `${SNAPSHOT_KEY_PREFIX}2026-06-01`;
    const oldText = compact([task("a")], CYCLE);
    const oldKey = contentKey(BACKUP_KEY_PREFIX, oldText);
    const corrupt = `${CYCLE_CORRUPT_PREFIX}z-1`;
    const emptyKey = `${SNAPSHOT_KEY_PREFIX}2026-06-02`;
    const { storage } = fakeStorage(
      { [readKey]: oldText, [oldKey]: oldText, [corrupt]: "x", [emptyKey]: compact([], CYCLE) },
      { failGet: key => key === readKey, failRemove: key => key === oldKey || key === corrupt || key === emptyKey },
    );
    const report = await purgeCycleCopies(storage);
    expect([...report.failed].sort()).toEqual([readKey, oldKey, corrupt, emptyKey].sort());
    expect(report.removed + report.rewritten).toBe(0);
  });

  test("an unreadable key list is reported and nothing is attempted", async () => {
    const { storage } = fakeStorage({ [`${CYCLE_CORRUPT_PREFIX}z-1`]: "x" }, { failList: true });
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 0, rewritten: 0, failed: [], listFailed: true });
  });

  test("a key that vanished between listing and reading is skipped", async () => {
    const key = `${SNAPSHOT_KEY_PREFIX}2026-06-01`;
    const { storage, data } = fakeStorage({ [key]: compact([task("a")], CYCLE) });
    const real = storage.getItem;
    storage.getItem = async k => { data.delete(k); return real(k); };
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 0, rewritten: 0, failed: [], listFailed: false });
  });

  test("running it twice does nothing the second time", async () => {
    const { storage } = fakeStorage({ [`${SNAPSHOT_KEY_PREFIX}2026-06-10`]: compact([task("a")], CYCLE), [`${CYCLE_CORRUPT_PREFIX}z-1`]: "x" });
    await purgeCycleCopies(storage);
    expect(await purgeCycleCopies(storage)).toEqual({ removed: 0, rewritten: 0, failed: [], listFailed: false });
  });
});

function fakeScheduler(ids: string[], failList = false, failCancel = false) {
  const cancelled: string[] = [];
  const scheduler: ReminderScheduler = {
    async listScheduledIds() {
      if (failList) throw new Error("list failed");
      return ids;
    },
    async schedule() {},
    async cancel(list) {
      if (failCancel) throw new Error("cancel failed");
      cancelled.push(...list);
    },
  };
  return { scheduler, cancelled };
}

describe("cancelCycleReminders", () => {
  test("cancels only the tracker notifications", async () => {
    const { scheduler, cancelled } = fakeScheduler([`${CYCLE_ID_PREFIX}next:1`, `${REMINDER_ID_PREFIX}a`, `${CYCLE_ID_PREFIX}late:2`]);
    expect(await cancelCycleReminders(scheduler)).toBe(true);
    expect(cancelled).toEqual([`${CYCLE_ID_PREFIX}next:1`, `${CYCLE_ID_PREFIX}late:2`]);
  });

  test("cancels nothing when there is none", async () => {
    const { scheduler, cancelled } = fakeScheduler([`${REMINDER_ID_PREFIX}a`]);
    expect(await cancelCycleReminders(scheduler)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  test("reports a failure to list or to cancel", async () => {
    expect(await cancelCycleReminders(fakeScheduler([], true).scheduler)).toBe(false);
    expect(await cancelCycleReminders(fakeScheduler([`${CYCLE_ID_PREFIX}x`], false, true).scheduler)).toBe(false);
  });
});

describe("deleteAllCycleData", () => {
  function setup(resetResult: { ok: true } | { ok: false; reason: string } = { ok: true }, hooks: Hooks = {}) {
    const calls: string[] = [];
    const store = fakeStorage({ [`${CYCLE_CORRUPT_PREFIX}z-1`]: "x" }, hooks);
    const sched = fakeScheduler([`${CYCLE_ID_PREFIX}next:1`]);
    const deps = {
      reset: async () => { calls.push("reset"); return resetResult; },
      storage: { ...store.storage, async getAllKeys() { calls.push("purge"); return store.storage.getAllKeys(); } } as PurgeStorage,
      scheduler: { ...sched.scheduler, async listScheduledIds() { calls.push("cancel"); return sched.scheduler.listScheduledIds(); } } as ReminderScheduler,
      removeExportFiles: () => { calls.push("files"); },
    };
    return { deps, calls, store, sched };
  }

  test("resets first, then purges the copies, cancels the notifications and removes the cached export", async () => {
    const { deps, calls, store, sched } = setup();
    const outcome = await deleteAllCycleData(deps);
    expect(calls).toEqual(["reset", "purge", "cancel", "files"]);
    expect(outcome).toEqual({
      ok: true, purge: { removed: 1, rewritten: 0, failed: [], listFailed: false }, remindersCancelled: true, filesRemoved: true,
    });
    expect(isIncomplete(outcome)).toBe(false);
    expect(store.data.size).toBe(0);
    expect(sched.cancelled).toEqual([`${CYCLE_ID_PREFIX}next:1`]);
  });

  test("a failed reset stops everything: nothing is purged while the data is still live", async () => {
    const { deps, calls } = setup({ ok: false, reason: "locked" });
    expect(await deleteAllCycleData(deps)).toEqual({ ok: false, reason: "locked" });
    expect(calls).toEqual(["reset"]);
  });

  test("a purge failure is reported as incomplete but the later steps still run", async () => {
    const { deps, calls } = setup({ ok: true }, { failRemove: () => true });
    const outcome = await deleteAllCycleData(deps);
    expect(calls).toEqual(["reset", "purge", "cancel", "files"]);
    expect(isIncomplete(outcome)).toBe(true);
  });

  test("an unreadable key list, a failed cancel or a throwing file cleanup also count as incomplete", async () => {
    expect(isIncomplete(await deleteAllCycleData(setup({ ok: true }, { failList: true }).deps))).toBe(true);
    const noCancel = setup().deps;
    noCancel.scheduler = fakeScheduler([`${CYCLE_ID_PREFIX}x`], true).scheduler;
    expect(isIncomplete(await deleteAllCycleData(noCancel))).toBe(true);
    const noFiles = setup().deps;
    noFiles.removeExportFiles = () => { throw new Error("nope"); };
    const outcome = await deleteAllCycleData(noFiles);
    expect(outcome).toMatchObject({ ok: true, filesRemoved: false });
    expect(isIncomplete(outcome)).toBe(true);
  });

  test("isIncomplete is false for a failed reset (the caller reports that reason instead)", () => {
    expect(isIncomplete({ ok: false, reason: "locked" })).toBe(false);
  });
});
