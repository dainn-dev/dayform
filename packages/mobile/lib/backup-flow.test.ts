import { describe, test, expect } from "bun:test";
import {
  MAX_STORED_BYTES,
  countItem,
  exportBlockedMessage,
  exportErrorMessage,
  formatNotice,
  importErrorMessage,
  parseErrorMessage,
  pickErrorMessage,
  planImport,
  runImport,
  type ImportOutcome,
  type ImportPlan,
  type SafetyCopyTarget,
} from "./backup-flow";
import { BACKUP_KEY_PREFIX, MAX_RECORDS, contentKey } from "./task-storage";
import { parseBackup, serializeBackup } from "./backup";
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

/** Compact backlog tasks, so MAX_RECORDS of them still fit under MAX_STORED_BYTES. */
function ids(prefix: string, count: number): Task[] {
  return Array.from({ length: count }, (_, i) =>
    task(`${prefix}${i}`, { title: "", date: null, start: null, createdAt: "" }));
}

const parsed = (tasks: Task[], rejected = 0) => ({ tasks, rejected });

/** Narrows a plan to its success branch (fails the test otherwise). */
function okPlan(plan: ImportPlan): Extract<ImportPlan, { ok: true }> {
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(`expected an ok plan, got ${plan.reason}`);
  return plan;
}

function okOutcome(outcome: ImportOutcome): Extract<ImportOutcome, { ok: true }> {
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error(`expected an ok outcome, got ${outcome.reason}`);
  return outcome;
}

/** A one-task list whose JSON is exactly `length` characters long, padded through the notes. */
function listOfJsonLength(length: number, filler = "a"): Task[] {
  const baseLength = JSON.stringify([task("pad")]).length;
  return [task("pad", { notes: filler.repeat(length - baseLength) })];
}

describe("planImport merge", () => {
  test("adds new tasks, updates changed ones and keeps the rest", () => {
    const current = [task("a"), task("b"), task("c")];
    const incoming = [task("b", { title: "Changed" }), task("c"), task("d")];
    const plan = okPlan(planImport(current, parsed(incoming, 2), "merge"));
    expect(plan.summary).toEqual({ found: 3, skipped: 2, added: 1, updated: 1, unchanged: 1, removed: 0, resulting: 4 });
    expect(plan.update(current).map(t => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan.update(current)[1].title).toBe("Changed");
  });

  test("an import that changes nothing leaves the list untouched (same reference)", () => {
    const current = [task("a"), task("b")];
    const plan = okPlan(planImport(current, parsed([task("a")]), "merge"));
    expect(plan.summary.added + plan.summary.updated).toBe(0);
    expect(plan.update(current)).toBe(current);
  });

  test("an import with no valid tasks is refused", () => {
    expect(planImport([task("a")], parsed([], 3), "merge")).toEqual({ ok: false, reason: "no-valid-tasks" });
  });
});

describe("planImport replace", () => {
  test("keeps only the incoming tasks and counts removals", () => {
    const current = [task("a"), task("b")];
    const plan = okPlan(planImport(current, parsed([task("b"), task("z")]), "replace"));
    expect(plan.summary).toEqual({ found: 2, skipped: 0, added: 1, updated: 0, unchanged: 1, removed: 1, resulting: 2 });
    expect(plan.update(current).map(t => t.id)).toEqual(["b", "z"]);
  });

  test("replacing with identical content is a no-op", () => {
    const current = [task("a"), task("b")];
    const plan = okPlan(planImport(current, parsed([task("a"), task("b")]), "replace"));
    expect(plan.update(current)).toBe(current);
  });

  test("replacing with no valid tasks is refused instead of wiping the list", () => {
    const outcome = planImport([task("a"), task("b")], parsed([], 2), "replace");
    expect(outcome).toEqual({ ok: false, reason: "no-valid-tasks" });
  });
});

describe("planImport cap", () => {
  test("refuses a merge that would exceed MAX_RECORDS", () => {
    const current = ids("c", MAX_RECORDS);
    expect(planImport(current, parsed([task("extra")]), "merge")).toEqual({ ok: false, reason: "too-many-tasks" });
  });

  test("accepts a merge that lands exactly on MAX_RECORDS", () => {
    const current = ids("c", MAX_RECORDS - 1);
    expect(planImport(current, parsed([task("extra")]), "merge").ok).toBe(true);
  });

  test("replace is judged on the incoming size only", () => {
    const current = ids("c", MAX_RECORDS);
    expect(planImport(current, parsed(ids("n", MAX_RECORDS)), "replace").ok).toBe(true);
    expect(planImport(current, parsed(ids("n", MAX_RECORDS + 1)), "replace").ok).toBe(false);
  });

  test("the update never exceeds the cap even if the list grew after planning", () => {
    const plan = okPlan(planImport(ids("c", 5), parsed([task("extra")]), "merge"));
    const grown = ids("g", MAX_RECORDS);
    expect(plan.update(grown)).toBe(grown);
  });
});

describe("planImport stored size", () => {
  test("accepts a list whose JSON is exactly MAX_STORED_BYTES and refuses one byte more", () => {
    const current = [task("keep")];
    const fits = listOfJsonLength(MAX_STORED_BYTES);
    expect(JSON.stringify(fits).length).toBe(MAX_STORED_BYTES);
    expect(planImport(current, parsed(fits), "replace").ok).toBe(true);
    expect(planImport(current, parsed(listOfJsonLength(MAX_STORED_BYTES + 1)), "replace")).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  test("a merge is judged on the combined list", () => {
    const current = listOfJsonLength(MAX_STORED_BYTES - 1_000);
    const plan = planImport(current, parsed([task("big", { notes: "b".repeat(2_000) })]), "merge");
    expect(plan).toEqual({ ok: false, reason: "too-large" });
  });

  test("counts UTF-8 bytes, not characters", () => {
    const keep = [task("keep")];
    const twoBytes = listOfJsonLength(MAX_STORED_BYTES - 100_000, "é");
    expect(JSON.stringify(twoBytes).length).toBeLessThan(MAX_STORED_BYTES);
    expect(planImport(keep, parsed(twoBytes), "replace")).toEqual({ ok: false, reason: "too-large" });
    const threeBytes = [task("t", { notes: "€".repeat(500_000) })];
    expect(planImport(keep, parsed(threeBytes), "replace").ok).toBe(false);
    const fourBytes = [task("f", { notes: "\u{1F600}".repeat(400_000) })];
    expect(planImport(keep, parsed(fourBytes), "replace").ok).toBe(false);
  });

  test("a lone surrogate is counted without crashing", () => {
    const lone = [task("l", { notes: "\ud83d" }), task("m", { notes: "a\ude00" })];
    expect(planImport([task("keep")], parsed(lone), "replace").ok).toBe(true);
  });

  test("the update refuses a list that grew too big after planning", () => {
    const plan = okPlan(planImport([task("a")], parsed([task("b")]), "merge"));
    const grown = listOfJsonLength(MAX_STORED_BYTES - 10);
    expect(plan.update(grown)).toBe(grown);
  });
});

const SAFETY_NOW = new Date(2026, 2, 5, 12, 0);

/** A storage double for the safety copy; `fail` makes every write throw. */
function safety(fail = false) {
  const data = new Map<string, string>();
  const order: string[] = [];
  const target: SafetyCopyTarget = {
    storage: {
      async setItem(key, value) {
        order.push("copy");
        if (fail) throw new Error("storage full");
        data.set(key, value);
      },
    },
    now: SAFETY_NOW,
  };
  return { target, data, order };
}

describe("runImport", () => {
  const mutateOn = (list: Task[], store: { value: Task[] }, ok = true) =>
    async (update: (tasks: Task[]) => Task[]) => {
      if (!ok) return false;
      store.value = update(list);
      return true;
    };

  test("commits through mutate and returns the summary", async () => {
    const store = { value: [task("a")] };
    const outcome = await runImport(mutateOn(store.value, store), parsed([task("b")]), "merge", safety().target);
    expect(okOutcome(outcome).summary.added).toBe(1);
    expect(store.value.map(t => t.id)).toEqual(["a", "b"]);
  });

  test("reports too-many-tasks when the committed list is already too big, and writes nothing", async () => {
    const big = ids("c", MAX_RECORDS);
    const store = { value: big };
    const outcome = await runImport(mutateOn(big, store), parsed([task("x")]), "merge", safety().target);
    expect(outcome).toEqual({ ok: false, reason: "too-many-tasks" });
    expect(store.value).toBe(big);
  });

  test("reports no-valid-tasks and writes nothing", async () => {
    const list = [task("a")];
    const store = { value: list };
    const outcome = await runImport(mutateOn(list, store), parsed([], 4), "replace", safety().target);
    expect(outcome).toEqual({ ok: false, reason: "no-valid-tasks" });
    expect(store.value).toBe(list);
  });

  test("reports save-failed when mutate fails", async () => {
    const store = { value: [task("a")] };
    const outcome = await runImport(mutateOn(store.value, store, false), parsed([task("b")]), "merge", safety().target);
    expect(outcome).toEqual({ ok: false, reason: "save-failed" });
  });

  test("reports save-failed when mutate never calls the update", async () => {
    const outcome = await runImport(async () => true, parsed([task("b")]), "merge", safety().target);
    expect(outcome).toEqual({ ok: false, reason: "save-failed" });
  });
});

describe("user-facing messages", () => {
  test("maps every export failure to a message", () => {
    expect(exportErrorMessage("write-failed")).toBe("Could not create the backup file.");
    expect(exportErrorMessage("sharing-unavailable")).toBe("Sharing is not available on this device.");
    expect(exportErrorMessage("share-failed")).toBe("Could not share the backup file.");
    expect(exportErrorMessage("unsupported-platform")).toBe("Backup is not supported on this platform.");
  });

  test("maps every pick failure to a message and cancellation to none", () => {
    expect(pickErrorMessage("cancelled")).toBeNull();
    expect(pickErrorMessage("read-failed")).toBe("Could not read the selected file.");
    expect(pickErrorMessage("too-large")).toBe("The file is too large to import.");
    expect(pickErrorMessage("unsupported-platform")).toBe("Backup is not supported on this platform.");
  });

  test("maps every parse failure to a message", () => {
    expect(parseErrorMessage("invalid-json")).toBe("This file is not a Dayform backup.");
    expect(parseErrorMessage("wrong-format")).toBe("This file is not a Dayform backup.");
    expect(parseErrorMessage("unsupported-version")).toBe("This backup was made by a newer version of Dayform.");
    expect(parseErrorMessage("too-large")).toBe("The file is too large to import.");
  });

  test("maps every import failure to a distinct message", () => {
    const reasons = ["too-many-tasks", "too-large", "no-valid-tasks", "save-failed", "safety-copy-failed", "list-changed"] as const;
    expect(new Set(reasons.map(importErrorMessage)).size).toBe(reasons.length);
    expect(importErrorMessage("no-valid-tasks")).toBe("No valid tasks were found in this file.");
    expect(importErrorMessage("too-large")).toBe("This backup is too big to store on this device.");
  });

  test("blocks an export while loading or with nothing to export", () => {
    expect(exportBlockedMessage(true, 5)).toBe("Your tasks are still loading. Try again in a moment.");
    expect(exportBlockedMessage(false, 0)).toBe("There are no tasks to export.");
    expect(exportBlockedMessage(false, 1)).toBeNull();
  });
});

describe("notices", () => {
  const identity = (text: string) => text;

  test("picks the singular key only for exactly one", () => {
    expect(countItem(1, "task imported", "tasks imported")).toEqual({ key: "task imported", count: 1 });
    expect(countItem(0, "task imported", "tasks imported")).toEqual({ key: "tasks imported", count: 0 });
    expect(countItem(2, "task imported", "tasks imported")).toEqual({ key: "tasks imported", count: 2 });
  });

  test("formats counted and plain items, translating each key at render time", () => {
    const items = [countItem(1, "task imported", "tasks imported"), { key: "added" }];
    expect(formatNotice(items, identity)).toBe("1 task imported, added");
    expect(formatNotice(items, text => text.toUpperCase())).toBe("1 TASK IMPORTED, ADDED");
  });
});

describe("runImport replace keeps a safety copy of the current tasks", () => {
  /** A store double: `before` runs ahead of each call (to simulate a concurrent change). */
  function fakeStore(initial: Task[], order: string[], before: (call: number) => void = () => undefined) {
    const box = { tasks: initial, calls: 0, options: [] as unknown[] };
    const mutate = async (update: (tasks: Task[]) => Task[], options?: unknown) => {
      order.push("mutate");
      box.options.push(options);
      before(box.calls++);
      box.tasks = update(box.tasks);
      return true;
    };
    return { box, mutate };
  }

  test("writes the current list as a compact backup copy before replacing", async () => {
    const copy = safety();
    const current = [task("a"), task("b")];
    const { box, mutate } = fakeStore(current, copy.order);

    const outcome = await runImport(mutate, parsed([task("z")]), "replace", copy.target);

    expect(okOutcome(outcome).summary).toMatchObject({ added: 1, removed: 2, resulting: 1 });
    expect(copy.order).toEqual(["mutate", "copy", "mutate"]);
    const text = serializeBackup(current, SAFETY_NOW, { compact: true });
    expect([...copy.data.keys()]).toEqual([contentKey(BACKUP_KEY_PREFIX, text)]);
    expect(copy.data.get(contentKey(BACKUP_KEY_PREFIX, text))).toBe(text);
    expect(parseBackup(text)).toEqual({ ok: true, tasks: current, rejected: 0 });
    expect(box.tasks.map(t => t.id)).toEqual(["z"]);
  });

  test("the replace itself is an undoable bulk write; reading the list is silent", async () => {
    const copy = safety();
    const { box, mutate } = fakeStore([task("a")], copy.order);
    await runImport(mutate, parsed([task("z")]), "replace", copy.target);
    expect(box.options).toEqual([{ silent: true }, { undo: "bulk" }]);
  });

  test("refuses the replace, with a typed result, when the copy cannot be written", async () => {
    const copy = safety(true);
    const current = [task("a")];
    const { box, mutate } = fakeStore(current, copy.order);
    const outcome = await runImport(mutate, parsed([task("z")]), "replace", copy.target);
    expect(outcome).toEqual({ ok: false, reason: "safety-copy-failed" });
    expect(box.tasks).toBe(current);
    expect(copy.order).toEqual(["mutate", "copy"]);
  });

  test("merge never writes a copy", async () => {
    const copy = safety();
    const { box, mutate } = fakeStore([task("a")], copy.order);
    await runImport(mutate, parsed([task("z")]), "merge", copy.target);
    expect(copy.order).toEqual(["mutate"]);
    expect(box.tasks.map(t => t.id)).toEqual(["a", "z"]);
  });

  test("an empty current list has nothing to protect, so no copy is written", async () => {
    const copy = safety();
    const { box, mutate } = fakeStore([], copy.order);
    expect(okOutcome(await runImport(mutate, parsed([task("z")]), "replace", copy.target)).summary.added).toBe(1);
    expect(copy.data.size).toBe(0);
    expect(box.tasks.map(t => t.id)).toEqual(["z"]);
  });

  test("a plan that is refused writes no copy and changes nothing", async () => {
    const copy = safety();
    const current = [task("a")];
    const { box, mutate } = fakeStore(current, copy.order);
    expect(await runImport(mutate, parsed([], 3), "replace", copy.target)).toEqual({ ok: false, reason: "no-valid-tasks" });
    expect(copy.data.size).toBe(0);
    expect(box.tasks).toBe(current);
  });

  test("a list that changed between the copy and the replace is left alone", async () => {
    const copy = safety();
    const original = [task("a")];
    const edited = [task("a"), task("late")];
    const { box, mutate } = fakeStore(original, copy.order, call => { if (call === 1) box.tasks = edited; });
    expect(await runImport(mutate, parsed([task("z")]), "replace", copy.target)).toEqual({ ok: false, reason: "list-changed" });
    expect(box.tasks).toBe(edited);
  });

  test("save-failed when the list cannot be read through mutate, and when the replace itself fails", async () => {
    const copy = safety();
    expect(await runImport(async () => false, parsed([task("z")]), "replace", copy.target)).toEqual({ ok: false, reason: "save-failed" });
    expect(await runImport(async () => true, parsed([task("z")]), "replace", copy.target)).toEqual({ ok: false, reason: "save-failed" });
    expect(copy.data.size).toBe(0);

    const current = [task("a")];
    let call = 0;
    const failsSecond = async (update: (tasks: Task[]) => Task[]) => { update(current); return call++ === 0; };
    expect(await runImport(failsSecond, parsed([task("z")]), "replace", copy.target)).toEqual({ ok: false, reason: "save-failed" });
    expect(copy.data.size).toBe(1);
  });

  test("a result over the limits is refused before any copy is written, leaving the list untouched", async () => {
    const copy = safety();
    const current = [task("a")];
    const { box, mutate } = fakeStore(current, copy.order);
    const tooMany = ids("m", MAX_RECORDS + 1);
    expect(await runImport(mutate, parsed(tooMany), "replace", copy.target)).toEqual({ ok: false, reason: "too-many-tasks" });
    expect(box.tasks).toBe(current);
    expect(copy.data.size).toBe(0);
  });
});
