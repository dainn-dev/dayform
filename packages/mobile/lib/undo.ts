import type { Task } from "./planner";

/** What a reversible write did. The value doubles as the UndoBar message key. */
export type UndoKind = "delete" | "bulk";

/** One task that a write added (`before` null), removed (`after` null) or edited. */
export type Change = { id: string; before: Task | null; after: Task | null };

export type UndoState = { kind: UndoKind; changes: Change[]; count: number };

export type UndoResult = { tasks: Task[]; reverted: number; skipped: number };

/** Tasks are flat records, so sorting the top-level keys gives a canonical, order-independent form. */
function canonical(task: Task): string {
  return JSON.stringify(task, Object.keys(task).sort());
}

/** Deep equality by content; property order does not matter and undefined equals absent. */
export function sameTask(a: Task, b: Task): boolean {
  return canonical(a) === canonical(b);
}

function indexById(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map(task => [task.id, task]));
}

/** Every id that was added, edited or removed between two lists. Order is ignored. */
export function diffTasks(before: Task[], after: Task[]): Change[] {
  const beforeById = indexById(before);
  const afterById = indexById(after);
  const changes: Change[] = [];
  for (const [id, was] of beforeById) {
    const now = afterById.get(id) ?? null;
    // Same reference means untouched: skip the (costly) content comparison.
    if (now === was) continue;
    if (now === null || !sameTask(was, now)) changes.push({ id, before: was, after: now });
  }
  for (const [id, now] of afterById) {
    if (!beforeById.has(id)) changes.push({ id, before: null, after: now });
  }
  return changes;
}

/** The task currently stored for the change is exactly what the change produced (or both are absent). */
function untouchedSince(current: Task | undefined, change: Change): boolean {
  if (current === undefined) return change.after === null;
  return change.after !== null && sameTask(current, change.after);
}

/**
 * Reverts each change whose task still looks exactly as the change left it; changes to tasks that were
 * edited afterwards are skipped, so unrelated later edits are never overwritten. Restored tasks that no
 * longer exist are appended; the order of the other tasks is preserved. Returns `current` itself when
 * nothing was reverted.
 */
export function applyUndo(current: Task[], changes: Change[]): UndoResult {
  const currentById = indexById(current);
  const replacements = new Map<string, Task>();
  const removals = new Set<string>();
  let reverted = 0;
  let skipped = 0;
  for (const change of changes) {
    if (!untouchedSince(currentById.get(change.id), change)) {
      skipped += 1;
      continue;
    }
    reverted += 1;
    if (change.before === null) removals.add(change.id);
    else replacements.set(change.id, change.before);
  }
  if (reverted === 0) return { tasks: current, reverted, skipped };
  const kept = current
    .filter(task => !removals.has(task.id))
    .map(task => replacements.get(task.id) ?? task);
  const appended = [...replacements].filter(([id]) => !currentById.has(id)).map(([, task]) => task);
  return { tasks: [...kept, ...appended], reverted, skipped };
}

// These strings are also translation keys (lib/i18n/undo.ts); keep them in sync.
const MESSAGE_KEYS: Record<UndoKind, { one: string; many: string }> = {
  delete: { one: "Task deleted", many: "tasks deleted" },
  bulk: { one: "task updated", many: "tasks updated" },
};
const ACTION_LABEL_KEYS: Record<UndoKind, string> = { delete: "Undo delete", bulk: "Undo last change" };

/** Snackbar text built from translated parts, so no key contains a number: "Task deleted", "3 tasks updated". */
export function undoMessage(undo: Pick<UndoState, "kind" | "count">, t: (text: string) => string): string {
  const keys = MESSAGE_KEYS[undo.kind];
  if (undo.kind === "delete" && undo.count === 1) return t(keys.one);
  return `${undo.count} ${t(undo.count === 1 ? keys.one : keys.many)}`;
}

export function undoActionLabel(kind: UndoKind, t: (text: string) => string): string {
  return t(ACTION_LABEL_KEYS[kind]);
}

/** Shown when "Undo" reverted nothing because every task was edited since. Also a translation key (lib/i18n/undo.ts). */
export const UNDO_FAILED_KEY = "Couldn't undo: the tasks changed since.";

export function undoFailedMessage(t: (text: string) => string): string {
  return t(UNDO_FAILED_KEY);
}
