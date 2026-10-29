import { describe, test, expect } from "bun:test";
import {
  TOO_MANY_TASKS_MESSAGE,
  exportErrorMessage,
  parseErrorMessage,
  pickErrorMessage,
  planImport,
  runImport,
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

function ids(prefix: string, count: number): Task[] {
  return Array.from({ length: count }, (_, i) => task(`${prefix}${i}`));
}

const parsed = (tasks: Task[], rejected = 0) => ({ tasks, rejected });

describe("planImport merge", () => {
  test("adds new tasks, updates changed ones and keeps the rest", () => {
    const current = [task("a"), task("b"), task("c")];
    const incoming = [task("b", { title: "Changed" }), task("c"), task("d")];
    const plan = planImport(current, parsed(incoming, 2), "merge");
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.summary).toEqual({ found: 3, skipped: 2, added: 1, updated: 1, unchanged: 1, removed: 0, resulting: 4 });
    expect(plan.update(current).map(t => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan.update(current)[1].title).toBe("Changed");
  });

  test("an import that changes nothing leaves the list untouched (same reference)", () => {
    const current = [task("a"), task("b")];
    const plan = planImport(current, parsed([task("a")]), "merge");
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.summary.added + plan.summary.updated).toBe(0);
    expect(plan.update(current)).toBe(current);
  });

  test("an empty import is a no-op", () => {
    const current = [task("a")];
    const plan = planImport(current, parsed([]), "merge");
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.update(current)).toBe(current);
  });
});

describe("planImport replace", () => {
  test("keeps only the incoming tasks and counts removals", () => {
    const current = [task("a"), task("b")];
    const plan = planImport(current, parsed([task("b"), task("z")]), "replace");
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.summary).toEqual({ found: 2, skipped: 0, added: 1, updated: 0, unchanged: 1, removed: 1, resulting: 2 });
    expect(plan.update(current).map(t => t.id)).toEqual(["b", "z"]);
  });

  test("replacing with identical content is a no-op", () => {
    const current = [task("a"), task("b")];
    const plan = planImport(current, parsed([task("a"), task("b")]), "replace");
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.update(current)).toBe(current);
  });

  test("replacing with nothing clears the list and reports every removal", () => {
    const current = [task("a"), task("b")];
    const plan = planImport(current, parsed([]), "replace");
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.summary.removed).toBe(2);
    expect(plan.update(current)).toEqual([]);
  });
});

describe("planImport cap", () => {
  test("refuses a merge that would exceed MAX_RECORDS", () => {
    const current = ids("c", MAX_RECORDS);
    expect(planImport(current, parsed([task("extra")]), "merge")).toEqual({ ok: false, reason: "too-many-tasks" });
  });

  test("accepts a merge that lands exactly on MAX_RECORDS", () => {
    const current = ids("c", MAX_RECORDS - 1);
    const plan = planImport(current, parsed([task("extra")]), "merge");
    expect(plan.ok).toBe(true);
  });

  test("replace is judged on the incoming size only", () => {
    const current = ids("c", MAX_RECORDS);
    expect(planImport(current, parsed(ids("n", MAX_RECORDS)), "replace").ok).toBe(true);
    expect(planImport(current, parsed(ids("n", MAX_RECORDS + 1)), "replace").ok).toBe(false);
  });

  test("the update never exceeds the cap even if the list grew after planning", () => {
    const planned = ids("c", 5);
    const plan = planImport(planned, parsed([task("extra")]), "merge");
    if (!plan.ok) throw new Error("expected ok");
    const grown = ids("g", MAX_RECORDS);
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
    expect(outcome.ok).toBe(true);
    expect(store.value.map(t => t.id)).toEqual(["a", "b"]);
    if (outcome.ok) expect(outcome.summary.added).toBe(1);
  });

  test("reports too-many-tasks when the committed list is already too big, and writes nothing", async () => {
    const big = ids("c", MAX_RECORDS);
    const store = { value: big };
    const outcome = await runImport(mutateOn(big, store), parsed([task("x")]), "merge");
    expect(outcome).toEqual({ ok: false, reason: "too-many-tasks" });
    expect(store.value).toBe(big);
  });

  test("reports save-failed when mutate fails", async () => {
    const store = { value: [task("a")] };
    const outcome = await runImport(mutateOn(store.value, store, false), parsed([task("b")]), "merge");
    expect(outcome).toEqual({ ok: false, reason: "save-failed" });
  });
});

describe("user-facing messages", () => {
  test("maps every failure to a message and cancellation to none", () => {
    expect(exportErrorMessage("write-failed")).toBe("Could not create the backup file.");
    expect(exportErrorMessage("sharing-unavailable")).toBe("Sharing is not available on this device.");
    expect(exportErrorMessage("unsupported-platform")).toBe("Backup is not supported on this platform.");
    expect(pickErrorMessage("cancelled")).toBeNull();
    expect(pickErrorMessage("read-failed")).toBe("Could not read the selected file.");
    expect(pickErrorMessage("unsupported-platform")).toBe("Backup is not supported on this platform.");
    expect(parseErrorMessage("invalid-json")).toBe("This file is not a Dayform backup.");
    expect(parseErrorMessage("wrong-format")).toBe("This file is not a Dayform backup.");
    expect(parseErrorMessage("unsupported-version")).toBe("This backup was made by a newer version of Dayform.");
    expect(parseErrorMessage("too-large")).toBe("The file is too large to import.");
    expect(TOO_MANY_TASKS_MESSAGE.length).toBeGreaterThan(0);
  });
});
