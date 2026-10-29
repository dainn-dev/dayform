import { describe, test, expect, spyOn } from "bun:test";
import {
  classifyRecoveryKey,
  deleteRecoveryItems,
  isRecoveryKey,
  listRecoveryItems,
  previewRecoveryItem,
  restoreRecoveryItem,
  type RecoveryItem,
  type RecoveryStorage,
} from "./recovery";
import { BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES, serializeBackup } from "./backup";
import { SNAPSHOT_KEY_PREFIX } from "./snapshots";
import { BACKUP_KEY_PREFIX, CORRUPT_KEY_PREFIX, MAX_RECORDS, TASKS_STORAGE_KEY, contentKey } from "./task-storage";
import { THEME_STORAGE_KEY } from "./theme-preference";
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

const LANGUAGE_KEY = "dayform.language.v1";
const NOW = new Date(2026, 2, 20, 10, 0);
const snap = (date: string) => `${SNAPSHOT_KEY_PREFIX}${date}`;

type FakeOptions = { failList?: boolean; failRead?: string[]; failRemove?: string[]; failWrite?: boolean };

function fakeStorage(initial: Record<string, string>, options: FakeOptions = {}) {
  const data = new Map(Object.entries(initial));
  const reads: string[] = [];
  const removes: string[] = [];
  const writes: string[] = [];
  const concurrency = { active: 0, max: 0 };
  const storage: RecoveryStorage = {
    getAllKeys: async () => {
      if (options.failList) throw new Error("list failed");
      return [...data.keys()];
    },
    getItem: async key => {
      reads.push(key);
      concurrency.active += 1;
      concurrency.max = Math.max(concurrency.max, concurrency.active);
      await Promise.resolve();
      concurrency.active -= 1;
      if (options.failRead?.includes(key)) throw new Error("read failed");
      return data.get(key) ?? null;
    },
    setItem: async (key, value) => {
      writes.push(key);
      if (options.failWrite) throw new Error("storage full");
      data.set(key, value);
    },
    removeItem: async key => {
      removes.push(key);
      if (options.failRemove?.includes(key)) throw new Error("remove failed");
      data.delete(key);
    },
  };
  return { storage, data, reads, removes, writes, concurrency };
}

function fakeStore(initial: Task[], saves = true) {
  const box = { tasks: initial };
  const mutate = async (update: (tasks: Task[]) => Task[]): Promise<boolean> => {
    const next = update(box.tasks);
    if (!saves) return false;
    box.tasks = next;
    return true;
  };
  return { box, mutate };
}

const itemsOf = async (storage: RecoveryStorage): Promise<RecoveryItem[]> => {
  const result = await listRecoveryItems(storage);
  if (!result.ok) throw new Error("list failed");
  return result.items;
};

describe("classifyRecoveryKey / isRecoveryKey", () => {
  test("recognises the three known prefixes", () => {
    expect(classifyRecoveryKey(`${BACKUP_KEY_PREFIX}1a2b-30`)).toEqual({ kind: "backup", label: "1a2b-30", date: null });
    expect(classifyRecoveryKey(`${CORRUPT_KEY_PREFIX}ff-9`)).toEqual({ kind: "corrupt", label: "ff-9", date: null });
    expect(classifyRecoveryKey(snap("2026-03-20"))).toEqual({ kind: "snapshot", label: "2026-03-20", date: "2026-03-20" });
    expect(classifyRecoveryKey(snap("junk"))).toEqual({ kind: "snapshot", label: "junk", date: null });
  });

  test("never classifies the main key, language, theme or look-alikes as recovery data", () => {
    const protectedKeys = [
      TASKS_STORAGE_KEY,
      LANGUAGE_KEY,
      THEME_STORAGE_KEY,
      "dayform.tasks.backup",
      "dayform.tasks.corrupt",
      BACKUP_KEY_PREFIX,
      CORRUPT_KEY_PREFIX,
      SNAPSHOT_KEY_PREFIX,
      "dayform.snapshot",
      ` ${BACKUP_KEY_PREFIX}abc`,
      `x${SNAPSHOT_KEY_PREFIX}2026-03-20`,
      "",
    ];
    for (const key of protectedKeys) {
      expect(classifyRecoveryKey(key)).toBeNull();
      expect(isRecoveryKey(key)).toBe(false);
    }
    expect(isRecoveryKey(`${BACKUP_KEY_PREFIX}abc`)).toBe(true);
  });
});

describe("listRecoveryItems", () => {
  test("is empty and ok for an empty store", async () => {
    expect(await listRecoveryItems(fakeStorage({}).storage)).toEqual({ ok: true, items: [] });
  });

  test("lists only recovery keys and never reads the others", async () => {
    const backupKey = contentKey(BACKUP_KEY_PREFIX, "oops");
    const { storage, reads } = fakeStorage({
      [TASKS_STORAGE_KEY]: "[]",
      [LANGUAGE_KEY]: "vi",
      [THEME_STORAGE_KEY]: "dark",
      [backupKey]: "oops",
    });
    const items = await itemsOf(storage);
    expect(items.map(item => item.key)).toEqual([backupKey]);
    expect(reads).toEqual([backupKey]);
  });

  test("describes a copy by its key and UTF-8 byte size, without reading what is inside", async () => {
    const text = "{broken ế";
    const key = contentKey(BACKUP_KEY_PREFIX, text);
    const [item] = await itemsOf(fakeStorage({ [key]: text }).storage);
    expect(item).toEqual({
      key,
      kind: "backup",
      label: key.slice(BACKUP_KEY_PREFIX.length),
      date: null,
      bytes: 11,
      unreadable: false,
    });
  });

  test("measures every kind of copy the same way, valid or not", async () => {
    const array = JSON.stringify([task("a"), { id: "bad" }]);
    const snapshot = serializeBackup([task("a"), task("b")], NOW);
    const { storage } = fakeStorage({
      [contentKey(BACKUP_KEY_PREFIX, array)]: array,
      [snap("2026-03-20")]: snapshot,
      [`${CORRUPT_KEY_PREFIX}c`]: "[]",
    });
    const items = await itemsOf(storage);
    expect(items.map(item => [item.kind, item.date, item.bytes])).toEqual([
      ["snapshot", "2026-03-20", snapshot.length],
      ["backup", null, array.length],
      ["corrupt", null, 2],
    ]);
  });

  test("never parses a copy: 200 recovery keys are listed without a single JSON.parse", async () => {
    const initial: Record<string, string> = { [TASKS_STORAGE_KEY]: JSON.stringify([task("main")]) };
    const text = serializeBackup([task("a"), task("b")], NOW);
    for (let i = 0; i < 200; i++) initial[i % 2 === 0 ? `${BACKUP_KEY_PREFIX}${i}` : snap(`2026-01-${String((i % 28) + 1).padStart(2, "0")}-${i}`)] = text;
    const parse = spyOn(JSON, "parse");
    try {
      const { storage } = fakeStorage(initial);
      const items = await itemsOf(storage);
      expect(items).toHaveLength(200);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  test("reads the copies one after another, never all at once", async () => {
    const initial: Record<string, string> = {};
    for (let i = 0; i < 50; i++) initial[`${BACKUP_KEY_PREFIX}${i}`] = "[]";
    const { storage, concurrency, reads } = fakeStorage(initial);
    await itemsOf(storage);
    expect(reads).toHaveLength(50);
    expect(concurrency.max).toBe(1);
  });

  test("sorts snapshots newest first, then the undated copies in storage order", async () => {
    const text = serializeBackup([task("a")], NOW);
    const { storage } = fakeStorage({
      [`${BACKUP_KEY_PREFIX}b1`]: "x",
      [snap("2026-01-05")]: text,
      [`${CORRUPT_KEY_PREFIX}c1`]: "[]",
      [snap("2026-03-20")]: text,
      [snap("junk")]: text,
      [snap("2026-02-10")]: text,
      [`${BACKUP_KEY_PREFIX}b2`]: "y",
    });
    const keys = (await itemsOf(storage)).map(item => item.key);
    expect(keys).toEqual([
      snap("2026-03-20"),
      snap("2026-02-10"),
      snap("2026-01-05"),
      `${BACKUP_KEY_PREFIX}b1`,
      `${CORRUPT_KEY_PREFIX}c1`,
      snap("junk"),
      `${BACKUP_KEY_PREFIX}b2`,
    ]);
  });

  test("flags entries that cannot be read, and keeps listing the others", async () => {
    const failing = `${BACKUP_KEY_PREFIX}fail`;
    const vanished = `${BACKUP_KEY_PREFIX}gone`;
    const fine = `${BACKUP_KEY_PREFIX}fine`;
    const { storage } = fakeStorage({ [failing]: "x", [fine]: "[]" }, { failRead: [failing] });
    // `vanished` is listed but its value is gone by the time it is read (a concurrent delete).
    const racing: RecoveryStorage = {
      ...storage,
      getAllKeys: async () => [failing, vanished, fine],
    };
    const items = await itemsOf(racing);
    expect(items.map(item => [item.key, item.unreadable, item.bytes])).toEqual([
      [failing, true, 0],
      [vanished, true, 0],
      [fine, false, 2],
    ]);
  });

  test("returns a typed failure instead of throwing when the keys cannot be listed", async () => {
    expect(await listRecoveryItems(fakeStorage({}, { failList: true }).storage)).toEqual({ ok: false, reason: "list-failed" });
  });

  test("lists a few hundred copies", async () => {
    const initial: Record<string, string> = {};
    for (let i = 0; i < 300; i++) initial[`${BACKUP_KEY_PREFIX}${i}`] = "[]";
    expect(await itemsOf(fakeStorage(initial).storage)).toHaveLength(300);
  });
});

describe("previewRecoveryItem", () => {
  test("parses an envelope, a bare array and reports rejected records", async () => {
    const { storage } = fakeStorage({
      [snap("2026-03-20")]: serializeBackup([task("a"), task("b")], NOW),
      [`${BACKUP_KEY_PREFIX}arr`]: JSON.stringify([task("c"), { id: "bad" }]),
    });
    expect(await previewRecoveryItem(storage, snap("2026-03-20"))).toEqual({ ok: true, tasks: [task("a"), task("b")], rejected: 0 });
    expect(await previewRecoveryItem(storage, `${BACKUP_KEY_PREFIX}arr`)).toEqual({ ok: true, tasks: [task("c")], rejected: 1 });
  });

  test("refuses keys outside the recovery prefixes without reading them", async () => {
    const { storage, reads } = fakeStorage({ [TASKS_STORAGE_KEY]: JSON.stringify([task("a")]) });
    expect(await previewRecoveryItem(storage, TASKS_STORAGE_KEY)).toEqual({ ok: false, reason: "not-recovery-key" });
    expect(reads).toEqual([]);
  });

  test("maps read problems and parse problems to typed reasons", async () => {
    const failing = `${BACKUP_KEY_PREFIX}fail`;
    const { storage } = fakeStorage(
      {
        [failing]: "x",
        [`${BACKUP_KEY_PREFIX}text`]: "{nope",
        [`${BACKUP_KEY_PREFIX}wrong`]: JSON.stringify({ hello: 1 }),
        [`${BACKUP_KEY_PREFIX}newer`]: JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, tasks: [] }),
        [`${BACKUP_KEY_PREFIX}huge`]: " ".repeat(MAX_BACKUP_BYTES + 1),
      },
      { failRead: [failing] },
    );
    const reason = async (suffix: string) => {
      const result = await previewRecoveryItem(storage, `${BACKUP_KEY_PREFIX}${suffix}`);
      return result.ok ? "ok" : result.reason;
    };
    expect(await reason("fail")).toBe("read-failed");
    expect(await reason("missing")).toBe("missing");
    expect(await reason("text")).toBe("unreadable-copy");
    expect(await reason("wrong")).toBe("unreadable-copy");
    expect(await reason("newer")).toBe("newer-version");
    expect(await reason("huge")).toBe("copy-too-large");
  });
});

describe("deleteRecoveryItems", () => {
  test("deletes recovery copies of all three kinds", async () => {
    const keys = [`${BACKUP_KEY_PREFIX}a`, `${CORRUPT_KEY_PREFIX}b`, snap("2026-03-20")];
    const { storage, data } = fakeStorage(Object.fromEntries(keys.map(key => [key, "x"])));
    const results = await deleteRecoveryItems(storage, keys);
    expect(results).toEqual(keys.map(key => ({ key, outcome: "deleted" })));
    expect(data.size).toBe(0);
  });

  test("REFUSES to delete the main task key, the language key, the theme key and look-alikes", async () => {
    const protectedKeys = [
      TASKS_STORAGE_KEY,
      LANGUAGE_KEY,
      THEME_STORAGE_KEY,
      "dayform.tasks.backup",
      BACKUP_KEY_PREFIX,
      "dayform.snapshot",
      "",
    ];
    const { storage, data, removes } = fakeStorage(Object.fromEntries(protectedKeys.map(key => [key, "keep"])));
    const results = await deleteRecoveryItems(storage, protectedKeys);
    expect(results).toEqual(protectedKeys.map(key => ({ key, outcome: "refused" })));
    expect(removes).toEqual([]);
    expect(data.get(TASKS_STORAGE_KEY)).toBe("keep");
    expect(data.get(LANGUAGE_KEY)).toBe("keep");
    expect(data.get(THEME_STORAGE_KEY)).toBe("keep");
  });

  test("a mixed request deletes the recovery keys and refuses the rest", async () => {
    const { storage, data } = fakeStorage({ [TASKS_STORAGE_KEY]: "[]", [`${BACKUP_KEY_PREFIX}a`]: "x" });
    const results = await deleteRecoveryItems(storage, [TASKS_STORAGE_KEY, `${BACKUP_KEY_PREFIX}a`]);
    expect(results.map(result => result.outcome)).toEqual(["refused", "deleted"]);
    expect([...data.keys()]).toEqual([TASKS_STORAGE_KEY]);
  });

  test("reports a failed removal and still deletes the other keys", async () => {
    const stuck = `${BACKUP_KEY_PREFIX}stuck`;
    const other = `${BACKUP_KEY_PREFIX}other`;
    const { storage, data } = fakeStorage({ [stuck]: "x", [other]: "x" }, { failRemove: [stuck] });
    const results = await deleteRecoveryItems(storage, [stuck, other]);
    expect(results).toEqual([{ key: stuck, outcome: "failed" }, { key: other, outcome: "deleted" }]);
    expect([...data.keys()]).toEqual([stuck]);
  });

  test("handles an empty request and processes duplicate keys once", async () => {
    const key = `${BACKUP_KEY_PREFIX}a`;
    const { storage, removes } = fakeStorage({ [key]: "x" });
    expect(await deleteRecoveryItems(storage, [])).toEqual([]);
    expect(await deleteRecoveryItems(storage, [key, key])).toEqual([{ key, outcome: "deleted" }]);
    expect(removes).toEqual([key]);
  });
});

describe("restoreRecoveryItem", () => {
  test("merge adds the copy's tasks to the committed list and leaves the copy in place", async () => {
    const key = snap("2026-03-20");
    const { storage, data } = fakeStorage({ [key]: serializeBackup([task("a"), task("b", { title: "Old" })], NOW) });
    const { box, mutate } = fakeStore([task("b", { title: "New" }), task("z")]);

    const outcome = await restoreRecoveryItem(storage, mutate, key, "merge", NOW);

    expect(outcome.ok).toBe(true);
    expect(box.tasks.map(item => item.id)).toEqual(["b", "z", "a"]);
    expect(box.tasks[0].title).toBe("Old");
    expect(data.has(key)).toBe(true);
  });

  test("replace makes the list equal to the copy", async () => {
    const key = snap("2026-03-20");
    const { storage } = fakeStorage({ [key]: serializeBackup([task("a")], NOW) });
    const { box, mutate } = fakeStore([task("z"), task("y")]);

    const outcome = await restoreRecoveryItem(storage, mutate, key, "replace", NOW);

    expect(outcome).toMatchObject({ ok: true, summary: { added: 1, removed: 2, resulting: 1 } });
    expect(box.tasks.map(item => item.id)).toEqual(["a"]);
  });

  test("never writes the main key; the only key it writes is a backup-prefix safety copy", async () => {
    const key = `${BACKUP_KEY_PREFIX}a`;
    const { storage, data, writes } = fakeStorage({ [TASKS_STORAGE_KEY]: "[]", [key]: JSON.stringify([task("a")]) });
    const { mutate } = fakeStore([task("current")]);
    await restoreRecoveryItem(storage, mutate, key, "replace", NOW);
    expect(data.get(TASKS_STORAGE_KEY)).toBe("[]");
    expect(writes).toHaveLength(1);
    expect(writes.every(written => written.startsWith(BACKUP_KEY_PREFIX))).toBe(true);
  });

  test("replace first saves the current list as a recovery copy, which then shows up in the list", async () => {
    const key = snap("2026-03-20");
    const current = [task("z"), task("y")];
    const { storage, data } = fakeStorage({ [key]: serializeBackup([task("a")], NOW) });
    const { box, mutate } = fakeStore(current);

    expect((await restoreRecoveryItem(storage, mutate, key, "replace", NOW)).ok).toBe(true);

    const text = serializeBackup(current, NOW, { compact: true });
    const copyKey = contentKey(BACKUP_KEY_PREFIX, text);
    expect(data.get(copyKey)).toBe(text);
    expect(box.tasks.map(item => item.id)).toEqual(["a"]);
    const preview = await previewRecoveryItem(storage, copyKey);
    expect(preview).toEqual({ ok: true, tasks: current, rejected: 0 });
    expect((await itemsOf(storage)).map(item => item.key)).toContain(copyKey);
  });

  test("replace is refused with a typed result when the safety copy cannot be written", async () => {
    const key = snap("2026-03-20");
    const current = [task("z")];
    const { storage } = fakeStorage({ [key]: serializeBackup([task("a")], NOW) }, { failWrite: true });
    const { box, mutate } = fakeStore(current);
    expect(await restoreRecoveryItem(storage, mutate, key, "replace", NOW)).toEqual({ ok: false, reason: "safety-copy-failed" });
    expect(box.tasks).toBe(current);
  });

  test("merge writes no safety copy, so a full storage cannot block it", async () => {
    const key = snap("2026-03-20");
    const { storage, writes } = fakeStorage({ [key]: serializeBackup([task("a")], NOW) }, { failWrite: true });
    const { box, mutate } = fakeStore([task("z")]);
    expect((await restoreRecoveryItem(storage, mutate, key, "merge", NOW)).ok).toBe(true);
    expect(writes).toEqual([]);
    expect(box.tasks.map(item => item.id)).toEqual(["z", "a"]);
  });

  test("refuses the main key and does not call mutate", async () => {
    const { storage } = fakeStorage({ [TASKS_STORAGE_KEY]: JSON.stringify([task("a")]) });
    let called = false;
    const outcome = await restoreRecoveryItem(storage, async () => { called = true; return true; }, TASKS_STORAGE_KEY, "replace", NOW);
    expect(outcome).toEqual({ ok: false, reason: "not-recovery-key" });
    expect(called).toBe(false);
  });

  test("a copy without a single valid task is refused in both modes, so it can never wipe data", async () => {
    const key = `${CORRUPT_KEY_PREFIX}x`;
    const { storage } = fakeStorage({ [key]: JSON.stringify([{ id: "bad" }]) });
    const { box, mutate } = fakeStore([task("keep")]);
    expect(await restoreRecoveryItem(storage, mutate, key, "replace", NOW)).toEqual({ ok: false, reason: "no-valid-tasks" });
    expect(await restoreRecoveryItem(storage, mutate, key, "merge", NOW)).toEqual({ ok: false, reason: "no-valid-tasks" });
    expect(box.tasks.map(item => item.id)).toEqual(["keep"]);
  });

  test("refuses a merge that would exceed MAX_RECORDS, leaving the list untouched", async () => {
    const key = snap("2026-03-20");
    const { storage } = fakeStorage({ [key]: serializeBackup([task("new")], NOW) });
    const current = Array.from({ length: MAX_RECORDS }, (_, i) => task(`t${i}`));
    const { box, mutate } = fakeStore(current);
    expect(await restoreRecoveryItem(storage, mutate, key, "merge", NOW)).toEqual({ ok: false, reason: "too-many-tasks" });
    expect(box.tasks).toHaveLength(MAX_RECORDS);
  });

  test("refuses a result bigger than the stored-bytes limit", async () => {
    const key = `${BACKUP_KEY_PREFIX}big`;
    const bulky = Array.from({ length: 160 }, (_, i) => task(`b${i}`, { notes: "n".repeat(10_000) }));
    const { storage } = fakeStorage({ [key]: JSON.stringify(bulky.slice(0, 100)) });
    const { box, mutate } = fakeStore(bulky.slice(100));
    expect(await restoreRecoveryItem(storage, mutate, key, "merge", NOW)).toEqual({ ok: false, reason: "too-large" });
    expect(box.tasks).toHaveLength(60);
  });

  test("reports preview failures and a failed save with typed reasons", async () => {
    const key = `${BACKUP_KEY_PREFIX}a`;
    const { storage } = fakeStorage({ [key]: JSON.stringify([task("a")]), [`${BACKUP_KEY_PREFIX}bad`]: "{nope" });
    const failing = fakeStore([], false);
    expect(await restoreRecoveryItem(storage, failing.mutate, key, "merge", NOW)).toEqual({ ok: false, reason: "save-failed" });
    expect(await restoreRecoveryItem(storage, failing.mutate, `${BACKUP_KEY_PREFIX}bad`, "merge", NOW)).toEqual({
      ok: false,
      reason: "unreadable-copy",
    });
  });
});

describe("recovery copies with categories", () => {
  const categories = {
    custom: [{ id: "c_gym00000", name: "Gym", color: "coral" as const, icon: "barbell-outline" as const }],
    hidden: [], renamed: {},
  };
  const key = snap("2026-03-20");

  test("a preview carries the categories of the copy and omits the field otherwise", async () => {
    const { storage } = fakeStorage({
      [key]: serializeBackup([task("a")], NOW, { categories }),
      [snap("2026-03-13")]: serializeBackup([task("a")], NOW),
    });
    expect(await previewRecoveryItem(storage, key)).toEqual({ ok: true, tasks: [task("a")], rejected: 0, categories });
    expect(await previewRecoveryItem(storage, snap("2026-03-13"))).toEqual({ ok: true, tasks: [task("a")], rejected: 0 });
  });

  test("a restore applies the copy's categories in the same mode and stores the current ones in the safety copy", async () => {
    const { storage, data } = fakeStorage({ [key]: serializeBackup([task("a")], NOW, { categories }) });
    const { mutate } = fakeStore([task("current")]);
    const calls: string[] = [];
    const current = { custom: [], hidden: ["Work"], renamed: {} };
    const outcome = await restoreRecoveryItem(storage, mutate, key, "replace", NOW, {
      categories: current,
      importCategories: async (incoming, mode) => { calls.push(`${incoming.custom.length}:${mode}`); return { ok: true }; },
    });
    expect(outcome).toMatchObject({ ok: true, categories: "applied" });
    expect(calls).toEqual(["1:replace"]);
    const copies = [...data.entries()].filter(([name]) => name.startsWith(BACKUP_KEY_PREFIX));
    expect(copies).toHaveLength(1);
    expect(copies[0][1]).toContain('"hidden":["Work"]');
  });
});
