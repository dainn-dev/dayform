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
} from "./backup-flow";
import { MAX_RECORDS } from "./task-storage";
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

describe("runImport", () => {
  const mutateOn = (list: Task[], store: { value: Task[] }, ok = true) =>
    async (update: (tasks: Task[]) => Task[]) => {
      if (!ok) return false;
      store.value = update(list);
      return true;
    };

  test("commits through mutate and returns the summary", async () => {
    const store = { value: [task("a")] };
    const outcome = await runImport(mutateOn(store.value, store), parsed([task("b")]), "merge");
    expect(okOutcome(outcome).summary.added).toBe(1);
    expect(store.value.map(t => t.id)).toEqual(["a", "b"]);
  });

  test("reports too-many-tasks when the committed list is already too big, and writes nothing", async () => {
    const big = ids("c", MAX_RECORDS);
    const store = { value: big };
    const outcome = await runImport(mutateOn(big, store), parsed([task("x")]), "merge");
    expect(outcome).toEqual({ ok: false, reason: "too-many-tasks" });
    expect(store.value).toBe(big);
  });

  test("reports no-valid-tasks and writes nothing", async () => {
    const list = [task("a")];
    const store = { value: list };
    const outcome = await runImport(mutateOn(list, store), parsed([], 4), "replace");
    expect(outcome).toEqual({ ok: false, reason: "no-valid-tasks" });
    expect(store.value).toBe(list);
  });

  test("reports save-failed when mutate fails", async () => {
    const store = { value: [task("a")] };
    const outcome = await runImport(mutateOn(store.value, store, false), parsed([task("b")]), "merge");
    expect(outcome).toEqual({ ok: false, reason: "save-failed" });
  });

  test("reports save-failed when mutate never calls the update", async () => {
    const outcome = await runImport(async () => true, parsed([task("b")]), "merge");
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
    const reasons = ["too-many-tasks", "too-large", "no-valid-tasks", "save-failed"] as const;
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
