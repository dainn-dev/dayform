import { describe, test, expect } from "bun:test";
import {
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_KEY_PREFIX,
  createSnapshotRunner,
  planSnapshotPrune,
  shouldSnapshot,
  snapshotDateFromKey,
  snapshotKey,
  takeSnapshot,
  MIN_TASK_JSON_BYTES,
  type SnapshotStorage,
} from "./snapshots";
import { parseBackup } from "./backup";
import { TASKS_STORAGE_KEY } from "./task-storage";
import type { Task } from "./planner";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    date: "2026-03-02",
    start: "09:00",
    duration: 30,
    status: "todo",
    category: "Work",
    notes: "",
    createdAt: "2026-03-01T08:00:00.000Z",
    ...overrides,
  };
}

type FakeOptions = { failList?: boolean; failWrite?: boolean; failRemove?: (key: string) => boolean };

function fakeStorage(initial: Record<string, string> = {}, options: FakeOptions = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const removes: string[] = [];
  const storage: SnapshotStorage = {
    getAllKeys: async () => {
      if (options.failList) throw new Error("list failed");
      return [...data.keys()];
    },
    setItem: async (key, value) => {
      writes.push(key);
      if (options.failWrite) throw new Error("quota");
      data.set(key, value);
    },
    removeItem: async key => {
      removes.push(key);
      if (options.failRemove?.(key)) throw new Error("remove failed");
      data.delete(key);
    },
  };
  return { storage, data, writes, removes };
}

const key = (date: string) => `${SNAPSHOT_KEY_PREFIX}${date}`;
const NOW = new Date(2026, 2, 20, 10, 0);

describe("snapshot keys", () => {
  test("uses the documented prefix and a local date", () => {
    expect(SNAPSHOT_KEY_PREFIX).toBe("dayform.snapshot.");
    expect(snapshotKey("2026-03-20")).toBe("dayform.snapshot.2026-03-20");
  });

  test("reads the date back and rejects anything that is not a valid snapshot key", () => {
    expect(snapshotDateFromKey(key("2026-03-20"))).toBe("2026-03-20");
    expect(snapshotDateFromKey(key("2026-02-30"))).toBeNull();
    expect(snapshotDateFromKey(key("not-a-date"))).toBeNull();
    expect(snapshotDateFromKey(`${key("2026-03-20")}x`)).toBeNull();
    expect(snapshotDateFromKey(TASKS_STORAGE_KEY)).toBeNull();
    expect(snapshotDateFromKey("")).toBeNull();
  });
});

describe("shouldSnapshot", () => {
  test("is due when there is no snapshot yet, ignoring unrelated keys", () => {
    expect(shouldSnapshot([], "2026-03-20")).toBe(true);
    expect(shouldSnapshot([TASKS_STORAGE_KEY, "dayform.tasks.backup.abc-1", key("garbage")], "2026-03-20")).toBe(true);
  });

  test("waits for the minimum interval since the newest snapshot (default 7 days)", () => {
    const keys = [key("2026-03-01"), key("2026-03-14")];
    expect(shouldSnapshot(keys, "2026-03-20")).toBe(false);
    expect(shouldSnapshot(keys, "2026-03-21")).toBe(true);
    expect(shouldSnapshot(keys, "2026-03-20", 6)).toBe(true);
    expect(shouldSnapshot(keys, "2026-03-20", 5)).toBe(true);
  });

  test("never snapshots twice on the same day, and counts days across DST and month ends", () => {
    expect(shouldSnapshot([key("2026-03-20")], "2026-03-20", 1)).toBe(false);
    expect(shouldSnapshot([key("2026-03-28")], "2026-04-04")).toBe(true);
    expect(shouldSnapshot([key("2026-03-28")], "2026-04-03")).toBe(false);
    expect(shouldSnapshot([key("2026-12-29")], "2027-01-05")).toBe(true);
  });

  test("ignores snapshots dated in the future so a wrong clock cannot stall the schedule", () => {
    expect(shouldSnapshot([key("2030-01-01")], "2026-03-20")).toBe(true);
    expect(shouldSnapshot([key("2030-01-01"), key("2026-03-18")], "2026-03-20")).toBe(false);
  });
});

describe("planSnapshotPrune", () => {
  const TODAY = "2026-03-21";

  test("returns the oldest snapshots beyond `keep` (default 3), oldest first", () => {
    const keys = [key("2026-03-14"), key("2026-01-01"), key("2026-03-21"), key("2026-02-01"), key("2026-02-20")];
    expect(planSnapshotPrune(keys, TODAY)).toEqual([key("2026-01-01"), key("2026-02-01")]);
    expect(planSnapshotPrune(keys, TODAY, 4)).toEqual([key("2026-01-01")]);
  });

  test("deletes nothing when within the limit", () => {
    expect(planSnapshotPrune([], TODAY)).toEqual([]);
    expect(planSnapshotPrune([key("2026-01-01"), key("2026-01-08"), key("2026-01-15")], TODAY)).toEqual([]);
  });

  test("only ever proposes snapshot keys, never the main key or recovery copies", () => {
    const keys = [
      TASKS_STORAGE_KEY,
      "dayform.tasks.backup.abc-1",
      "dayform.tasks.corrupt.abc-1",
      "dayform.language.v1",
      key("oops"),
      key("2026-01-01"),
      key("2026-01-08"),
    ];
    expect(planSnapshotPrune(keys, TODAY, 1)).toEqual([key("2026-01-01")]);
  });

  test("never prunes the last snapshot: an invalid `keep` falls back to the default", () => {
    const keys = [key("2026-01-01"), key("2026-01-08"), key("2026-01-15"), key("2026-01-22")];
    for (const bad of [0, -2, 1.5, Number.NaN]) {
      expect(planSnapshotPrune(keys, TODAY, bad)).toEqual([key("2026-01-01")]);
    }
  });

  test("sorts by date regardless of input order and does not mutate the input", () => {
    const keys = Object.freeze([key("2026-01-02"), key("2026-01-01")]) as readonly string[];
    expect(planSnapshotPrune(keys, TODAY, 1)).toEqual([key("2026-01-01")]);
    expect(keys).toEqual([key("2026-01-02"), key("2026-01-01")]);
  });

  test("snapshots dated after today count as the oldest: pruned first and never counted toward `keep`", () => {
    const keys = [key("2030-01-01"), key("2026-03-01"), key("2031-05-05"), key("2026-03-08"), key("2026-03-15"), key("2029-12-31")];
    expect(planSnapshotPrune(keys, TODAY)).toEqual([key("2029-12-31"), key("2030-01-01"), key("2031-05-05")]);
    expect(planSnapshotPrune(keys, TODAY, 2)).toEqual([
      key("2029-12-31"), key("2030-01-01"), key("2031-05-05"), key("2026-03-01"),
    ]);
  });

  test("three future keys plus the new snapshot: the new one survives and all three future ones go", () => {
    const keys = [key("2027-01-01"), key("2027-01-08"), key("2027-01-15"), key("2026-03-21")];
    expect(planSnapshotPrune(keys, TODAY)).toEqual([key("2027-01-01"), key("2027-01-08"), key("2027-01-15")]);
  });

  test("a snapshot dated today is not in the future", () => {
    expect(planSnapshotPrune([key(TODAY), key("2026-03-01"), key("2026-02-01"), key("2026-01-01")], TODAY)).toEqual([
      key("2026-01-01"),
    ]);
  });
});

describe("takeSnapshot", () => {
  test("writes a parseable backup under today's key and nothing else", async () => {
    const { storage, data, writes } = fakeStorage({ [TASKS_STORAGE_KEY]: "[]" });
    const tasks = [task("a"), task("b")];

    const result = await takeSnapshot(storage, tasks, NOW);

    expect(result).toEqual({ kind: "written", key: key("2026-03-20"), pruned: 0, pruneFailed: 0 });
    expect(writes).toEqual([key("2026-03-20")]);
    const parsed = parseBackup(data.get(key("2026-03-20")) ?? "");
    expect(parsed).toEqual({ ok: true, tasks, rejected: 0 });
    expect(data.get(TASKS_STORAGE_KEY)).toBe("[]");
  });

  test("never snapshots an empty list", async () => {
    const { storage, writes } = fakeStorage();
    expect(await takeSnapshot(storage, [], NOW)).toEqual({ kind: "skipped", reason: "empty" });
    expect(writes).toEqual([]);
  });

  test("skips when a recent snapshot exists", async () => {
    const { storage, writes } = fakeStorage({ [key("2026-03-18")]: "x" });
    expect(await takeSnapshot(storage, [task("a")], NOW)).toEqual({ kind: "skipped", reason: "not-due" });
    expect(writes).toEqual([]);
  });

  test("skips with a typed reason when the backup would be bigger than MAX_SNAPSHOT_BYTES", async () => {
    const { storage, writes, removes } = fakeStorage({ [key("2026-01-01")]: "x" });
    const big = [task("a", { notes: "x".repeat(MAX_SNAPSHOT_BYTES) })];
    expect(await takeSnapshot(storage, big, NOW)).toEqual({ kind: "skipped", reason: "too-large" });
    expect(writes).toEqual([]);
    expect(removes).toEqual([]);
  });

  test("measures size in UTF-8 bytes, not characters", async () => {
    const { storage } = fakeStorage();
    const wide = [task("a", { notes: "ế".repeat(Math.ceil(MAX_SNAPSHOT_BYTES / 3)) })];
    expect(await takeSnapshot(storage, wide, NOW)).toEqual({ kind: "skipped", reason: "too-large" });
  });

  test("prunes to the newest 3 after writing, never touching other keys", async () => {
    const { storage, data, removes } = fakeStorage({
      [TASKS_STORAGE_KEY]: "[]",
      [key("2026-01-01")]: "a",
      [key("2026-01-08")]: "b",
      [key("2026-01-15")]: "c",
      [key("2026-02-01")]: "d",
    });

    const result = await takeSnapshot(storage, [task("a")], NOW);

    expect(result).toEqual({ kind: "written", key: key("2026-03-20"), pruned: 2, pruneFailed: 0 });
    expect(removes).toEqual([key("2026-01-01"), key("2026-01-08")]);
    expect([...data.keys()].sort()).toEqual([TASKS_STORAGE_KEY, key("2026-01-15"), key("2026-02-01"), key("2026-03-20")].sort());
  });

  test("a failed prune is counted but does not turn the written snapshot into a failure", async () => {
    const { storage } = fakeStorage(
      { [key("2026-01-01")]: "a", [key("2026-01-08")]: "b", [key("2026-01-15")]: "c", [key("2026-02-01")]: "d" },
      { failRemove: k => k === key("2026-01-01") },
    );
    expect(await takeSnapshot(storage, [task("a")], NOW)).toEqual({
      kind: "written",
      key: key("2026-03-20"),
      pruned: 1,
      pruneFailed: 1,
    });
  });

  test("reports a failed write and a failed key listing without throwing", async () => {
    const write = fakeStorage({}, { failWrite: true });
    expect(await takeSnapshot(write.storage, [task("a")], NOW)).toEqual({ kind: "failed", reason: "write-failed" });
    const list = fakeStorage({}, { failList: true });
    expect(await takeSnapshot(list.storage, [task("a")], NOW)).toEqual({ kind: "failed", reason: "list-failed" });
    expect(list.writes).toEqual([]);
  });

  test("refuses an invalid date instead of writing a key named NaN", async () => {
    const { storage, writes } = fakeStorage();
    expect(await takeSnapshot(storage, [task("a")], new Date(Number.NaN))).toEqual({ kind: "failed", reason: "invalid-date" });
    expect(writes).toEqual([]);
  });

  test("handles 10,000 tasks within the size budget check without throwing", async () => {
    const { storage } = fakeStorage();
    const many = Array.from({ length: 10_000 }, (_, i) => task(`t${i}`));
    const result = await takeSnapshot(storage, many, NOW);
    expect(result.kind === "written" || (result.kind === "skipped" && result.reason === "too-large")).toBe(true);
  });
});

describe("createSnapshotRunner", () => {
  const tasks = [task("a")];

  test("snapshots the freshest tasks and then reports not-due", async () => {
    const { storage, writes } = fakeStorage();
    let current: readonly Task[] = tasks;
    const runner = createSnapshotRunner({ storage, read: () => ({ tasks: current, canSnapshot: true }), now: () => NOW });
    current = [task("a"), task("b")];

    expect((await runner.run())?.kind).toBe("written");
    expect(await runner.run()).toEqual({ kind: "skipped", reason: "not-due" });
    expect(writes).toEqual([key("2026-03-20")]);
  });

  test("does nothing while the tasks are not trustworthy (loading / writes blocked)", async () => {
    const { storage, writes } = fakeStorage();
    const runner = createSnapshotRunner({ storage, read: () => ({ tasks, canSnapshot: false }), now: () => NOW });
    expect(await runner.run()).toBeNull();
    expect(writes).toEqual([]);
  });

  test("is single-flight: an overlapping run returns null and writes once", async () => {
    const { storage, writes } = fakeStorage();
    const runner = createSnapshotRunner({ storage, read: () => ({ tasks, canSnapshot: true }), now: () => NOW });
    const [first, second] = await Promise.all([runner.run(), runner.run()]);
    expect(first?.kind).toBe("written");
    expect(second).toBeNull();
    expect(writes).toHaveLength(1);
    expect((await runner.run())?.kind).toBe("skipped");
  });

  test("does nothing after dispose", async () => {
    const { storage, writes } = fakeStorage();
    const runner = createSnapshotRunner({ storage, read: () => ({ tasks, canSnapshot: true }), now: () => NOW });
    runner.dispose();
    expect(await runner.run()).toBeNull();
    expect(writes).toEqual([]);
  });
});

describe("takeSnapshot size and clock handling", () => {
  const minimalTask = (id: string): Task =>
    task(id, { title: "", date: null, start: null, notes: "", createdAt: "", status: "done" });

  test("the per-task lower bound really is a lower bound (smallest valid task, plus its comma)", () => {
    expect(JSON.stringify(minimalTask("a")).length + 1).toBeGreaterThanOrEqual(MIN_TASK_JSON_BYTES);
  });

  test("writes compact JSON (no indentation) that still parses", async () => {
    const { storage, data } = fakeStorage();
    await takeSnapshot(storage, [task("a")], NOW);
    const text = data.get(key("2026-03-20")) ?? "";
    expect(text).not.toContain("\n");
    expect(parseBackup(text)).toEqual({ ok: true, tasks: [task("a")], rejected: 0 });
  });

  test("a list that cannot fit is rejected from its length alone, without serializing any task", async () => {
    const { storage, writes } = fakeStorage();
    let serialized = 0;
    const count = Math.floor(MAX_SNAPSHOT_BYTES / MIN_TASK_JSON_BYTES) + 1;
    const many = Array.from({ length: count }, (_, i) => {
      const item = minimalTask(`t${i}`);
      Object.defineProperty(item, "toJSON", { value: () => { serialized++; return { ...item }; }, enumerable: false });
      return item;
    });
    expect(await takeSnapshot(storage, many, NOW)).toEqual({ kind: "skipped", reason: "too-large" });
    expect(serialized).toBe(0);
    expect(writes).toEqual([]);
  });

  test("a list just under the length estimate still gets the exact size check", async () => {
    const { storage, writes } = fakeStorage();
    const bulky = Array.from({ length: 100 }, (_, i) => task(`t${i}`, { notes: "n".repeat(6_000) }));
    expect(await takeSnapshot(storage, bulky, NOW)).toEqual({ kind: "skipped", reason: "too-large" });
    expect(writes).toEqual([]);
  });

  test("future-dated snapshots are ignored for the schedule and pruned right after the new write", async () => {
    const { storage, data, removes } = fakeStorage({
      [key("2027-01-01")]: "a",
      [key("2027-01-08")]: "b",
      [key("2027-01-15")]: "c",
    });
    const result = await takeSnapshot(storage, [task("a")], NOW);
    expect(result).toEqual({ kind: "written", key: key("2026-03-20"), pruned: 3, pruneFailed: 0 });
    expect(removes).toEqual([key("2027-01-01"), key("2027-01-08"), key("2027-01-15")]);
    expect([...data.keys()]).toEqual([key("2026-03-20")]);
  });

  test("a snapshot for today that already exists is never overwritten", async () => {
    const { storage, data, writes } = fakeStorage({ [key("2026-03-20")]: "original" });
    expect(await takeSnapshot(storage, [task("a")], NOW)).toEqual({ kind: "skipped", reason: "not-due" });
    expect(writes).toEqual([]);
    expect(data.get(key("2026-03-20"))).toBe("original");
  });
});

describe("createSnapshotRunner edge cases", () => {
  test("a run while loading is ignored, and a later run once trustworthy writes (the guard does not stick)", async () => {
    const { storage, writes } = fakeStorage();
    let canSnapshot = false;
    const runner = createSnapshotRunner({ storage, read: () => ({ tasks: [task("a")], canSnapshot }), now: () => NOW });
    expect(await runner.run()).toBeNull();
    canSnapshot = true;
    expect((await runner.run())?.kind).toBe("written");
    expect(writes).toEqual([key("2026-03-20")]);
  });

  test("reports every attempted result to onResult, and nothing for a run that did not start", async () => {
    const { storage } = fakeStorage();
    const seen: string[] = [];
    let canSnapshot = false;
    const runner = createSnapshotRunner({
      storage,
      read: () => ({ tasks: [task("a")], canSnapshot }),
      now: () => NOW,
      onResult: result => seen.push(result.kind === "skipped" ? `skipped:${result.reason}` : result.kind),
    });
    await runner.run();
    canSnapshot = true;
    await runner.run();
    await runner.run();
    expect(seen).toEqual(["written", "skipped:not-due"]);
  });

  test("a throwing storage in the middle of a run does not leave the runner stuck", async () => {
    const boom = fakeStorage();
    let fail = true;
    const storage: SnapshotStorage = {
      ...boom.storage,
      getAllKeys: async () => {
        if (fail) throw new Error("native crash");
        return boom.storage.getAllKeys();
      },
    };
    const runner = createSnapshotRunner({ storage, read: () => ({ tasks: [task("a")], canSnapshot: true }), now: () => NOW });
    expect(await runner.run()).toEqual({ kind: "failed", reason: "list-failed" });
    fail = false;
    expect((await runner.run())?.kind).toBe("written");
  });
});
