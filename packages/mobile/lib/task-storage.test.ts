import { describe, test, expect } from "bun:test";
import {
  BACKUP_KEY_PREFIX,
  CORRUPT_KEY_PREFIX,
  MAX_RECORDS,
  TASKS_STORAGE_KEY as KEY,
  contentKey,
  loadTasks,
  taskSchema,
  type KeyValueStorage,
  type LoadResult,
} from "./task-storage";
import { seedTasks, type Task } from "./planner";

type FakeOptions = { initial?: Record<string, string>; getThrows?: boolean; setThrowsFor?: string };

function fakeStorage({ initial = {}, getThrows = false, setThrowsFor }: FakeOptions = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const setCalls: [string, string][] = [];
  const storage: KeyValueStorage = {
    async getItem(key) {
      if (getThrows) throw new Error("read boom");
      return data.has(key) ? data.get(key)! : null;
    },
    async setItem(key, value) {
      setCalls.push([key, value]);
      if (setThrowsFor !== undefined && key.startsWith(setThrowsFor)) throw new Error("write boom");
      data.set(key, value);
    },
  };
  return { storage, data, setCalls };
}

type Fake = ReturnType<typeof fakeStorage>;

/** Loads and asserts the invariant that loadTasks never writes the main key. */
async function load(fake: Fake, key: string = KEY): Promise<LoadResult> {
  const result = await loadTasks(fake.storage, key);
  expect(fake.setCalls.filter(([k]) => k === key)).toEqual([]);
  return result;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "Write", date: "2026-03-10", start: "09:30", duration: 45,
    status: "todo", category: "Work", notes: "", createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

const stored = (value: unknown) => ({ [KEY]: JSON.stringify(value) });

describe("contentKey", () => {
  test("uses the FNV-1a 32-bit hash in base 16 and the text length", () => {
    expect(contentKey("p.", "")).toBe("p.811c9dc5-0");
    expect(contentKey("p.", "a")).toBe("p.e40c292c-1");
    expect(contentKey("p.", "foobar")).toBe("p.bf9cf968-6");
  });

  test("is deterministic and differs for different content", () => {
    expect(contentKey("p.", "abc")).toBe(contentKey("p.", "abc"));
    expect(contentKey("p.", "abc")).not.toBe(contentKey("p.", "abd"));
  });

  test("handles non-ASCII text without throwing", () => {
    expect(contentKey("p.", "Việt 😀")).toMatch(/^p\.[0-9a-f]+-\d+$/);
  });
});

describe("taskSchema", () => {
  test("accepts a scheduled task and an unscheduled task", () => {
    expect(taskSchema.safeParse(task()).success).toBe(true);
    expect(taskSchema.safeParse(task({ date: null, start: null })).success).toBe(true);
  });

  test("rejects an empty id, bad status and bad category", () => {
    expect(taskSchema.safeParse(task({ id: "" })).success).toBe(false);
    expect(taskSchema.safeParse({ ...task(), status: "nope" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task(), category: "Other" }).success).toBe(false);
  });

  test("rejects malformed times and fractional durations", () => {
    expect(taskSchema.safeParse(task({ start: "24:00" })).success).toBe(false);
    expect(taskSchema.safeParse(task({ start: "9:30" })).success).toBe(false);
    expect(taskSchema.safeParse(task({ duration: 1.5 })).success).toBe(false);
  });

  test("rejects date set while start is null", () => {
    expect(taskSchema.safeParse(task({ start: null })).success).toBe(false);
  });

  test("accepts every seed task", () => {
    for (const seed of seedTasks()) expect(taskSchema.safeParse(seed).success).toBe(true);
  });

  test("accepts TaskEditor-shaped scheduled and backlog tasks", () => {
    const id = `${Date.now()}-abc`;
    const createdAt = new Date().toISOString();
    expect(taskSchema.safeParse(task({ id, createdAt })).success).toBe(true);
    expect(taskSchema.safeParse(task({ id, date: null, start: null, createdAt })).success).toBe(true);
  });
});

describe("loadTasks", () => {
  test("returns seed tasks without persisting when the key is absent", async () => {
    const fake = fakeStorage();
    const result = await load(fake);
    expect(result.kind).toBe("seed");
    if (result.kind === "seed") expect(result.tasks.length).toBeGreaterThan(0);
    expect(fake.setCalls).toEqual([]);
  });

  test("returns ok with zero quarantined for a valid array", async () => {
    const tasks = [task(), task({ id: "t2", date: null, start: null })];
    const fake = fakeStorage({ initial: stored(tasks) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks, quarantined: 0 });
    expect(fake.setCalls).toEqual([]);
  });

  test("returns ok with an empty array stored", async () => {
    const fake = fakeStorage({ initial: stored([]) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [], quarantined: 0 });
  });

  test("strips extra keys from valid records", async () => {
    const fake = fakeStorage({ initial: stored([{ ...task(), extra: "x", nested: { a: 1 } }]) });
    const result = await load(fake);
    expect(result).toEqual({ kind: "ok", tasks: [task()], quarantined: 0 });
    if (result.kind === "ok") expect(Object.keys(result.tasks[0]).sort()).toEqual(Object.keys(task()).sort());
  });

  test("quarantines one bad record among good ones into a content-addressed corrupt key", async () => {
    const good = task();
    const bad = { id: "bad", title: 5 };
    const fake = fakeStorage({ initial: stored([good, bad]) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [good], quarantined: 1 });
    const rejectedText = JSON.stringify([bad]);
    expect(fake.data.get(contentKey(CORRUPT_KEY_PREFIX, rejectedText))).toBe(rejectedText);
  });

  test("quarantines a record with start set but date null", async () => {
    const bad = task({ id: "x", date: null });
    const fake = fakeStorage({ initial: stored([bad]) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [], quarantined: 1 });
    const text = JSON.stringify([bad]);
    expect(fake.data.get(contentKey(CORRUPT_KEY_PREFIX, text))).toBe(text);
  });

  test("quarantines an impossible calendar date", async () => {
    const fake = fakeStorage({ initial: stored([task({ id: "feb", date: "2026-02-31" })]) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [], quarantined: 1 });
  });

  test("quarantines durations of 0 and 1441 but keeps 1 and 1440", async () => {
    const records = [
      task({ id: "a", duration: 0 }), task({ id: "b", duration: 1441 }),
      task({ id: "c", duration: 1 }), task({ id: "d", duration: 1440 }),
    ];
    const result = await load(fakeStorage({ initial: stored(records) }));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.tasks.map(t => t.id)).toEqual(["c", "d"]);
      expect(result.quarantined).toBe(2);
    }
  });

  test("keeps the first of duplicate ids and counts the rest as quarantined", async () => {
    const first = task({ id: "dup", title: "first" });
    const second = task({ id: "dup", title: "second" });
    const fake = fakeStorage({ initial: stored([first, second]) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [first], quarantined: 1 });
    const text = JSON.stringify([second]);
    expect(fake.data.get(contentKey(CORRUPT_KEY_PREFIX, text))).toBe(text);
  });

  test("quarantines non-object entries such as null", async () => {
    const result = await load(fakeStorage({ initial: stored([null, task()]) }));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.quarantined).toBe(1);
  });

  test("treats an array of non-objects as all rejected", async () => {
    const fake = fakeStorage({ initial: stored([1, "two", true, [3]]) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [], quarantined: 4 });
  });

  test("returns ok with no tasks when every record is invalid", async () => {
    const records = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const fake = fakeStorage({ initial: stored(records) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [], quarantined: 3 });
    expect(fake.setCalls).toHaveLength(1);
  });

  test("recovers from invalid JSON by backing up the raw string", async () => {
    const fake = fakeStorage({ initial: { [KEY]: "{bad" } });
    const backupKey = contentKey(BACKUP_KEY_PREFIX, "{bad");
    expect(await load(fake)).toEqual({ kind: "recovered", tasks: [], backupKey });
    expect(backupKey.startsWith(BACKUP_KEY_PREFIX)).toBe(true);
    expect(fake.data.get(backupKey)).toBe("{bad");
  });

  test("recovers when the stored JSON is an object rather than an array", async () => {
    const raw = JSON.stringify({ tasks: [] });
    const fake = fakeStorage({ initial: { [KEY]: raw } });
    const backupKey = contentKey(BACKUP_KEY_PREFIX, raw);
    expect(await load(fake)).toEqual({ kind: "recovered", tasks: [], backupKey });
    expect(fake.data.get(backupKey)).toBe(raw);
  });

  test("recovers when the stored value is the string null", async () => {
    const fake = fakeStorage({ initial: { [KEY]: "null" } });
    expect((await load(fake)).kind).toBe("recovered");
    expect(fake.data.get(contentKey(BACKUP_KEY_PREFIX, "null"))).toBe("null");
  });

  test("recovers when the stored value is an empty string", async () => {
    const fake = fakeStorage({ initial: { [KEY]: "" } });
    expect((await load(fake)).kind).toBe("recovered");
    expect(fake.data.get(contentKey(BACKUP_KEY_PREFIX, ""))).toBe("");
  });

  test("recovers from an array longer than MAX_RECORDS", async () => {
    const raw = JSON.stringify(new Array(MAX_RECORDS + 1).fill(0));
    const fake = fakeStorage({ initial: { [KEY]: raw } });
    const backupKey = contentKey(BACKUP_KEY_PREFIX, raw);
    expect(await load(fake)).toEqual({ kind: "recovered", tasks: [], backupKey });
    expect(fake.data.get(backupKey)).toBe(raw);
  });

  test("still processes an array of exactly MAX_RECORDS entries", async () => {
    const fake = fakeStorage({ initial: stored(new Array(MAX_RECORDS).fill(null)) });
    expect(await load(fake)).toEqual({ kind: "ok", tasks: [], quarantined: MAX_RECORDS });
  });

  test("locks with read-failed and never writes when getItem throws", async () => {
    const fake = fakeStorage({ getThrows: true });
    expect(await load(fake)).toEqual({ kind: "locked", reason: "read-failed" });
    expect(fake.setCalls).toEqual([]);
  });

  test("locks with backup-failed when the raw backup cannot be written", async () => {
    const fake = fakeStorage({ initial: { [KEY]: "{bad" }, setThrowsFor: BACKUP_KEY_PREFIX });
    expect(await load(fake)).toEqual({ kind: "locked", reason: "backup-failed" });
    expect(fake.data.get(KEY)).toBe("{bad");
  });

  test("returns read-only with the valid tasks when the quarantine copy cannot be written", async () => {
    const good = task();
    const fake = fakeStorage({ initial: stored([good, { id: "bad" }]), setThrowsFor: CORRUPT_KEY_PREFIX });
    expect(await load(fake)).toEqual({ kind: "read-only", tasks: [good] });
    expect([...fake.data.keys()].some(k => k.startsWith(CORRUPT_KEY_PREFIX))).toBe(false);
  });

  test("locks with backup-failed when the quarantine copy fails and no valid task exists", async () => {
    const fake = fakeStorage({ initial: stored([{ id: "bad" }]), setThrowsFor: CORRUPT_KEY_PREFIX });
    expect(await load(fake)).toEqual({ kind: "locked", reason: "backup-failed" });
  });

  test("is idempotent: loading the same corrupt data twice writes one key with one value", async () => {
    const fake = fakeStorage({ initial: stored([task(), { id: "bad" }]) });
    await load(fake);
    const keysAfterFirst = [...fake.data.keys()].sort();
    await load(fake);
    expect([...fake.data.keys()].sort()).toEqual(keysAfterFirst);
    expect(fake.data.size).toBe(2);
    expect(new Set(fake.setCalls.map(([k]) => k)).size).toBe(1);
    expect(new Set(fake.setCalls.map(([, v]) => v)).size).toBe(1);
  });

  test("is idempotent for unparseable data", async () => {
    const fake = fakeStorage({ initial: { [KEY]: "{bad" } });
    await load(fake);
    await load(fake);
    expect(fake.data.size).toBe(2);
    expect(new Set(fake.setCalls.map(([k]) => k)).size).toBe(1);
  });

  test("uses the supplied storage key", async () => {
    const fake = fakeStorage({ initial: { custom: JSON.stringify([task()]) } });
    expect((await load(fake, "custom")).kind).toBe("ok");
  });
});

describe("taskSchema recurrence and reminder fields", () => {
  const accepts = (value: unknown) => taskSchema.safeParse(value).success;

  test("records without remind, seriesId or repeat are still valid (backward compatible)", () => {
    const legacy = task();
    expect("remind" in legacy || "seriesId" in legacy || "repeat" in legacy).toBe(false);
    expect(accepts(legacy)).toBe(true);
    expect(accepts(task({ date: null, start: null }))).toBe(true);
  });

  test("valid remind, seriesId and repeat values round-trip unchanged", () => {
    const full = task({ remind: 15, seriesId: "s1", repeat: "weekdays", id: "s1:2026-03-10" });
    const parsed = taskSchema.safeParse(JSON.parse(JSON.stringify(full)));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(full);
  });

  test("accepts null for remind, seriesId and repeat and every repeat value", () => {
    expect(accepts(task({ remind: null, seriesId: null, repeat: null }))).toBe(true);
    for (const repeat of ["daily", "weekdays", "weekly"] as const) {
      expect(accepts(task({ seriesId: "s", repeat }))).toBe(true);
    }
  });

  test("accepts remind at both boundaries 0 and 1440", () => {
    expect(accepts(task({ remind: 0 }))).toBe(true);
    expect(accepts(task({ remind: 1440 }))).toBe(true);
  });

  test("rejects remind when start is null", () => {
    expect(accepts(task({ date: null, start: null, remind: 10 }))).toBe(false);
  });

  test("rejects repeat or seriesId when date is null", () => {
    expect(accepts(task({ date: null, start: null, repeat: "daily" }))).toBe(false);
    expect(accepts(task({ date: null, start: null, seriesId: "s1" }))).toBe(false);
  });

  test("rejects remind outside 0..1440 and fractional remind", () => {
    expect(accepts(task({ remind: -1 }))).toBe(false);
    expect(accepts(task({ remind: 1441 }))).toBe(false);
    expect(accepts(task({ remind: 1.5 }))).toBe(false);
  });

  test("rejects an unknown repeat value and an empty seriesId", () => {
    expect(accepts({ ...task(), repeat: "monthly" })).toBe(false);
    expect(accepts(task({ seriesId: "" }))).toBe(false);
  });
});
