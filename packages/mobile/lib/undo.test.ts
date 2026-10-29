import { describe, test, expect } from "bun:test";
import { UNDO_FAILED_KEY, applyUndo, diffTasks, sameTask, undoActionLabel, undoFailedMessage, undoMessage, type Change } from "./undo";
import type { Task } from "./planner";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, title: `Task ${id}`, date: "2026-03-10", start: "09:30", duration: 45,
    status: "todo", category: "Work", notes: "", createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

const A = task("a");
const B = task("b");
const C = task("c");

describe("sameTask", () => {
  test("ignores property order", () => {
    const reordered: Task = { createdAt: A.createdAt, category: A.category, status: A.status, duration: A.duration, notes: A.notes, start: A.start, date: A.date, title: A.title, id: A.id };
    expect(sameTask(A, reordered)).toBe(true);
  });

  test("detects a changed field, including nested optional fields", () => {
    expect(sameTask(A, { ...A, title: "x" })).toBe(false);
    expect(sameTask(A, { ...A, remind: 5 })).toBe(false);
    expect(sameTask({ ...A, remind: null }, A)).toBe(false);
  });

  test("treats an undefined optional field like an absent one", () => {
    expect(sameTask({ ...A, remind: undefined }, A)).toBe(true);
  });
});

describe("diffTasks", () => {
  test("an unchanged task (same reference) is never serialized", () => {
    const poisoned = { ...A, toJSON: () => { throw new Error("serialized"); } } as Task;
    expect(diffTasks([poisoned, B], [poisoned, { ...B, title: "x" }])).toEqual([
      { id: "b", before: B, after: { ...B, title: "x" } },
    ]);
  });

  test("returns nothing for identical lists, even when reordered", () => {
    expect(diffTasks([A, B], [A, B])).toEqual([]);
    expect(diffTasks([A, B], [B, A])).toEqual([]);
    expect(diffTasks([], [])).toEqual([]);
  });

  test("reports removed tasks with after null", () => {
    expect(diffTasks([A, B], [B])).toEqual([{ id: "a", before: A, after: null }]);
  });

  test("reports added tasks with before null", () => {
    expect(diffTasks([A], [A, B])).toEqual([{ id: "b", before: null, after: B }]);
  });

  test("reports edited tasks with both sides", () => {
    const edited = { ...A, status: "done" as const };
    expect(diffTasks([A, B], [edited, B])).toEqual([{ id: "a", before: A, after: edited }]);
  });

  test("reports a mix of added, edited and removed tasks", () => {
    const edited = { ...B, title: "edited" };
    const changes = diffTasks([A, B], [edited, C]);
    expect(changes).toHaveLength(3);
    expect(changes).toContainEqual({ id: "a", before: A, after: null });
    expect(changes).toContainEqual({ id: "b", before: B, after: edited });
    expect(changes).toContainEqual({ id: "c", before: null, after: C });
  });

  test("is not fooled by property order alone", () => {
    const reordered = Object.fromEntries(Object.entries(A).reverse()) as Task;
    expect(diffTasks([A], [reordered])).toEqual([]);
  });

  test("handles large lists", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => task(`t${i}`));
    const after = many.map((t, i) => (i === 5000 ? { ...t, title: "changed" } : t));
    expect(diffTasks(many, after)).toHaveLength(1);
  });
});

describe("applyUndo", () => {
  test("re-adds a removed task at the end", () => {
    const changes: Change[] = [{ id: "a", before: A, after: null }];
    expect(applyUndo([B], changes)).toEqual({ tasks: [B, A], reverted: 1, skipped: 0 });
  });

  test("removes a task that was added", () => {
    const changes: Change[] = [{ id: "c", before: null, after: C }];
    expect(applyUndo([A, C, B], changes)).toEqual({ tasks: [A, B], reverted: 1, skipped: 0 });
  });

  test("replaces an edited task in place, keeping order", () => {
    const edited = { ...A, title: "edited" };
    const changes: Change[] = [{ id: "a", before: A, after: edited }];
    expect(applyUndo([B, edited, C], changes)).toEqual({ tasks: [B, A, C], reverted: 1, skipped: 0 });
  });

  test("skips a change when the task was edited since", () => {
    const edited = { ...A, title: "edited" };
    const later = { ...A, title: "edited again" };
    const result = applyUndo([later, B], [{ id: "a", before: A, after: edited }]);
    expect(result.tasks).toEqual([later, B]);
    expect(result).toMatchObject({ reverted: 0, skipped: 1 });
  });

  test("skips a removal when the id exists again", () => {
    const result = applyUndo([{ ...A, title: "re-added" }], [{ id: "a", before: A, after: null }]);
    expect(result).toMatchObject({ reverted: 0, skipped: 1 });
  });

  test("skips an addition that was edited or already removed", () => {
    expect(applyUndo([{ ...C, title: "x" }], [{ id: "c", before: null, after: C }])).toMatchObject({ reverted: 0, skipped: 1 });
    expect(applyUndo([A], [{ id: "c", before: null, after: C }])).toMatchObject({ reverted: 0, skipped: 1 });
  });

  test("skips an edit when the task was deleted since", () => {
    const edited = { ...A, title: "edited" };
    expect(applyUndo([B], [{ id: "a", before: A, after: edited }])).toMatchObject({ reverted: 0, skipped: 1 });
  });

  test("reverts what it can and counts the rest as skipped", () => {
    const editedA = { ...A, status: "done" as const };
    const editedB = { ...B, status: "done" as const };
    const changes: Change[] = [
      { id: "a", before: A, after: editedA },
      { id: "b", before: B, after: editedB },
    ];
    const current = [editedA, { ...editedB, title: "touched later" }, C];
    const result = applyUndo(current, changes);
    expect(result.tasks).toEqual([A, { ...editedB, title: "touched later" }, C]);
    expect(result).toMatchObject({ reverted: 1, skipped: 1 });
  });

  test("appends several re-added tasks in change order and keeps unrelated edits", () => {
    const laterC = { ...C, title: "later edit" };
    const changes: Change[] = [
      { id: "a", before: A, after: null },
      { id: "b", before: B, after: null },
    ];
    expect(applyUndo([laterC], changes).tasks).toEqual([laterC, A, B]);
  });

  test("returns the same list when nothing is reverted", () => {
    const current = [A];
    expect(applyUndo(current, []).tasks).toBe(current);
    expect(applyUndo(current, [{ id: "z", before: B, after: C }]).tasks).toBe(current);
  });

  test("does not mutate its inputs", () => {
    const current = [A, B];
    const changes: Change[] = [{ id: "a", before: { ...A, title: "old" }, after: A }];
    const snapshot = JSON.stringify([current, changes]);
    applyUndo(current, changes);
    expect(JSON.stringify([current, changes])).toBe(snapshot);
  });

  test("a change with both sides absent counts as reverted and changes nothing", () => {
    const result = applyUndo([A], [{ id: "z", before: null, after: null }]);
    expect(result.tasks).toEqual([A]);
    expect(result).toMatchObject({ reverted: 1, skipped: 0 });
  });

  test("diff then undo round-trips", () => {
    const before = [A, B, C];
    const after = [{ ...A, date: null, start: null }, C, task("d")];
    const { tasks, reverted, skipped } = applyUndo(after, diffTasks(before, after));
    expect(skipped).toBe(0);
    expect(reverted).toBe(3);
    expect([...tasks].sort((x, y) => x.id.localeCompare(y.id))).toEqual(before);
  });
});

describe("undoMessage", () => {
  const t = (text: string) => `<${text}>`;

  test("a single delete has no count", () => {
    expect(undoMessage({ kind: "delete", count: 1 }, t)).toBe("<Task deleted>");
  });

  test("several deletes get a count prefix and the plural key", () => {
    expect(undoMessage({ kind: "delete", count: 3 }, t)).toBe("3 <tasks deleted>");
  });

  test("bulk updates use singular and plural keys with a count prefix", () => {
    expect(undoMessage({ kind: "bulk", count: 1 }, t)).toBe("1 <task updated>");
    expect(undoMessage({ kind: "bulk", count: 12 }, t)).toBe("12 <tasks updated>");
  });

  test("keys never contain digits or braces", () => {
    const keys: string[] = [];
    const record = (text: string) => { keys.push(text); return text; };
    for (const kind of ["delete", "bulk"] as const) {
      undoMessage({ kind, count: 1 }, record);
      undoMessage({ kind, count: 2 }, record);
      undoActionLabel(kind, record);
    }
    expect(keys.every(key => !/[\d{}]/.test(key))).toBe(true);
  });

  test("the action label depends on the kind", () => {
    expect(undoActionLabel("delete", t)).toBe("<Undo delete>");
    expect(undoActionLabel("bulk", t)).toBe("<Undo last change>");
  });
});

describe("undoFailedMessage", () => {
  test("is the translatable English key, passed through t", () => {
    expect(UNDO_FAILED_KEY).toBe("Couldn't undo: the tasks changed since.");
    expect(undoFailedMessage(text => `<${text}>`)).toBe("<Couldn't undo: the tasks changed since.>");
  });
});
