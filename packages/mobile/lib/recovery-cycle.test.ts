import { describe, expect, test } from "bun:test";
import { MAX_BACKUP_BYTES, serializeBackup } from "./backup";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle";
import { CYCLE_CORRUPT_PREFIX, CYCLE_KEY } from "./cycle-store";
import type { Task } from "./planner";
import {
  classifyRecoveryKey,
  deleteRecoveryItems,
  isRecoveryKey,
  listRecoveryItems,
  previewRecoveryItem,
  restoreRecoveryItem,
  type RecoveryStorage,
} from "./recovery";
import { SNAPSHOT_KEY_PREFIX } from "./snapshots";
import { BACKUP_KEY_PREFIX, contentKey } from "./task-storage";

function task(id: string): Task {
  return {
    id, title: `Task ${id}`, date: "2026-03-02", start: "09:00", duration: 30, status: "todo", category: "Work",
    notes: "", createdAt: "2026-03-01T08:00:00.000Z",
  };
}

const NOW = new Date(2026, 2, 20, 10, 0);
const snap = (date: string) => `${SNAPSHOT_KEY_PREFIX}${date}`;

function fakeStorage(initial: Record<string, string>, failWrite = false) {
  const data = new Map(Object.entries(initial));
  const removes: string[] = [];
  const writes: string[] = [];
  const storage: RecoveryStorage = {
    getAllKeys: async () => [...data.keys()],
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push(key);
      if (failWrite) throw new Error("storage full");
      data.set(key, value);
    },
    removeItem: async key => { removes.push(key); data.delete(key); },
  };
  return { storage, data, removes, writes };
}

function fakeStore(initial: Task[]) {
  const box = { tasks: initial };
  const mutate = async (update: (tasks: Task[]) => Task[]): Promise<boolean> => {
    box.tasks = update(box.tasks);
    return true;
  };
  return { box, mutate };
}

describe("recovery copies of the period tracker", () => {
  const cycle: CycleState = {
    ...DEFAULT_CYCLE_STATE, enabled: true, acknowledged: true, periods: [{ start: "2026-08-05" }, { start: "2026-09-02" }],
  };
  const current: CycleState = { ...DEFAULT_CYCLE_STATE, enabled: true, periods: [{ start: "2026-07-01" }] };
  const copyKey = `${CYCLE_CORRUPT_PREFIX}abc-12`;
  const snapKey = snap("2026-03-20");
  function hooks(calls: string[] = [], result: { ok: boolean } | "throw" = { ok: true }) {
    return {
      cycle: current,
      importCycle: async (incoming: CycleState, mode: string) => {
        calls.push(`${incoming.periods.length}:${mode}`);
        if (result === "throw") throw new Error("disk");
        return result;
      },
    };
  }

  test("the corrupt-copy prefix is a recovery prefix; the main tracker key is not", () => {
    expect(classifyRecoveryKey(copyKey)).toEqual({ kind: "cycle", label: "abc-12", date: null });
    expect(isRecoveryKey(CYCLE_CORRUPT_PREFIX)).toBe(false);
    expect(isRecoveryKey(CYCLE_KEY)).toBe(false);
    expect(isRecoveryKey("dayform.cycle.v1.backup")).toBe(false);
    expect(isRecoveryKey("dayform.cycle.corrupt")).toBe(false);
  });

  test("is listed with its size, next to the other copies, and the main key is not", async () => {
    const { storage } = fakeStorage({ [copyKey]: JSON.stringify(cycle), [snapKey]: serializeBackup([task("a")], NOW), [CYCLE_KEY]: "{}" });
    const result = await listRecoveryItems(storage);
    if (!result.ok) throw new Error("list failed");
    expect(result.items.map(entry => [entry.key, entry.kind])).toEqual([[snapKey, "snapshot"], [copyKey, "cycle"]]);
    expect(result.items[1]).toMatchObject({ bytes: JSON.stringify(cycle).length, unreadable: false });
  });

  test("is deleted like any copy, while the main tracker key is still refused", async () => {
    const { storage, data, removes } = fakeStorage({ [copyKey]: "{}", [CYCLE_KEY]: JSON.stringify(cycle) });
    const results = await deleteRecoveryItems(storage, [copyKey, CYCLE_KEY]);
    expect(results).toEqual([{ key: copyKey, outcome: "deleted" }, { key: CYCLE_KEY, outcome: "refused" }]);
    expect(removes).toEqual([copyKey]);
    expect(data.has(CYCLE_KEY)).toBe(true);
  });

  test("a preview shows no tasks and the repaired tracker data; garbage and oversized copies are refused", async () => {
    const lossy = JSON.stringify({ ...cycle, periods: [{ start: "2026-02-30" }, { start: "2026-09-02" }], extra: 1 });
    const { storage } = fakeStorage({
      [copyKey]: lossy,
      [`${CYCLE_CORRUPT_PREFIX}bad`]: "not json",
      [`${CYCLE_CORRUPT_PREFIX}arr`]: "[1,2]",
      [`${CYCLE_CORRUPT_PREFIX}big`]: " ".repeat(MAX_BACKUP_BYTES + 1),
    });
    expect(await previewRecoveryItem(storage, copyKey)).toEqual({
      ok: true, tasks: [], rejected: 0, cycle: { ...cycle, periods: [{ start: "2026-09-02" }] },
    });
    expect(await previewRecoveryItem(storage, `${CYCLE_CORRUPT_PREFIX}bad`)).toEqual({ ok: false, reason: "unreadable-copy" });
    expect(await previewRecoveryItem(storage, `${CYCLE_CORRUPT_PREFIX}arr`)).toEqual({ ok: false, reason: "unreadable-copy" });
    expect(await previewRecoveryItem(storage, `${CYCLE_CORRUPT_PREFIX}big`)).toEqual({ ok: false, reason: "copy-too-large" });
    expect(await previewRecoveryItem(storage, `${CYCLE_CORRUPT_PREFIX}missing`)).toEqual({ ok: false, reason: "missing" });
  });

  test("a snapshot preview carries the tracker data only when it has some", async () => {
    const { storage } = fakeStorage({
      [snapKey]: serializeBackup([task("a")], NOW, { cycle }),
      [snap("2026-03-13")]: serializeBackup([task("a")], NOW),
    });
    expect(await previewRecoveryItem(storage, snapKey)).toEqual({ ok: true, tasks: [task("a")], rejected: 0, cycle });
    expect(await previewRecoveryItem(storage, snap("2026-03-13"))).toEqual({ ok: true, tasks: [task("a")], rejected: 0 });
  });

  test("restoring a tracker-only copy merges or replaces the tracker and touches no task", async () => {
    for (const mode of ["merge", "replace"] as const) {
      const { storage, data } = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
      const { box, mutate } = fakeStore([task("keep")]);
      const calls: string[] = [];
      const outcome = await restoreRecoveryItem(storage, mutate, copyKey, mode, NOW, hooks(calls));
      expect(outcome).toMatchObject({ ok: true, cycle: "applied", cycleOnly: true, summary: { added: 0, updated: 0, removed: 0 } });
      expect(calls).toEqual([`2:${mode}`]);
      expect(box.tasks.map(item => item.id)).toEqual(["keep"]);
      expect(data.has(copyKey)).toBe(true);
    }
  });

  test("a tracker-only replace first saves the current tracker as a restorable safety copy", async () => {
    const { storage, data } = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
    const { mutate } = fakeStore([]);
    await restoreRecoveryItem(storage, mutate, copyKey, "replace", NOW, hooks());
    const copies = [...data.entries()].filter(([name]) => name.startsWith(BACKUP_KEY_PREFIX));
    expect(copies).toHaveLength(1);
    expect(copies[0]![0]).toBe(contentKey(BACKUP_KEY_PREFIX, copies[0]![1]));
    expect(copies[0]![1]).toBe(serializeBackup([], NOW, { compact: true, cycle: current }));
    const again = await restoreRecoveryItem(storage, mutate, copies[0]![0], "replace", NOW, hooks());
    expect(again).toMatchObject({ ok: true, cycleOnly: true });
  });

  test("merge and an empty current tracker write no safety copy", async () => {
    const merge = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
    await restoreRecoveryItem(merge.storage, fakeStore([]).mutate, copyKey, "merge", NOW, hooks());
    expect(merge.writes).toEqual([]);
    const empty = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
    await restoreRecoveryItem(empty.storage, fakeStore([]).mutate, copyKey, "replace", NOW, { ...hooks(), cycle: DEFAULT_CYCLE_STATE });
    expect(empty.writes).toEqual([]);
  });

  test("a replace without the current tracker passed in writes no safety copy either", async () => {
    const { storage, writes } = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
    const { cycle: _omitted, ...withoutCurrent } = hooks();
    await restoreRecoveryItem(storage, fakeStore([]).mutate, copyKey, "replace", NOW, withoutCurrent);
    expect(writes).toEqual([]);
  });

  test("a failed safety copy refuses the replace and never reaches the tracker", async () => {
    const { storage } = fakeStorage({ [copyKey]: JSON.stringify(cycle) }, true);
    const calls: string[] = [];
    const outcome = await restoreRecoveryItem(storage, fakeStore([]).mutate, copyKey, "replace", NOW, hooks(calls));
    expect(outcome).toEqual({ ok: false, reason: "safety-copy-failed" });
    expect(calls).toEqual([]);
  });

  test("a failing or throwing tracker store is a failed save", async () => {
    for (const result of [{ ok: false }, "throw"] as const) {
      const { storage } = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
      const outcome = await restoreRecoveryItem(storage, fakeStore([]).mutate, copyKey, "merge", NOW, hooks([], result));
      expect(outcome).toEqual({ ok: false, reason: "save-failed" });
    }
  });

  test("without a tracker hook a tracker-only copy cannot restore anything", async () => {
    const { storage } = fakeStorage({ [copyKey]: JSON.stringify(cycle) });
    const outcome = await restoreRecoveryItem(storage, fakeStore([]).mutate, copyKey, "merge", NOW);
    expect(outcome).toEqual({ ok: false, reason: "no-valid-tasks" });
  });

  test("a snapshot restore applies its tasks, then the tracker, and saves the current tracker in the safety copy", async () => {
    const { storage, data } = fakeStorage({ [snapKey]: serializeBackup([task("a")], NOW, { cycle }) });
    const { box, mutate } = fakeStore([task("current")]);
    const calls: string[] = [];
    const outcome = await restoreRecoveryItem(storage, mutate, snapKey, "replace", NOW, hooks(calls));
    expect(outcome).toMatchObject({ ok: true, cycle: "applied" });
    expect(outcome).not.toHaveProperty("cycleOnly");
    expect(calls).toEqual(["2:replace"]);
    expect(box.tasks.map(item => item.id)).toEqual(["a"]);
    const copies = [...data.entries()].filter(([name]) => name.startsWith(BACKUP_KEY_PREFIX));
    expect(copies[0]![1]).toContain("containsHealthData");
  });
});
