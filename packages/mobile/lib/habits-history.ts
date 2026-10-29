import type { Task } from "./planner";

const DAY_LENGTH = 10; // "YYYY-MM-DD"

export function isDone(task: Task): boolean {
  return task.status === "done";
}

/**
 * Sortable "when" of a task: its local date, or the day it was created for backlog tasks.
 * Plain string comparison orders these correctly (YYYY-MM-DD). Empty when nothing is known.
 */
export function recencyKey(task: Task): string {
  return task.date ?? (task.createdAt || "").slice(0, DAY_LENGTH);
}

/** Plain code-unit order: the keys are ISO dates and ids, and this sort runs on every render for big lists. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareRecentFirst(a: Task, b: Task): number {
  const byDay = compareText(recencyKey(b), recencyKey(a));
  if (byDay !== 0) return byDay;
  const byCreation = compareText(b.createdAt || "", a.createdAt || "");
  return byCreation !== 0 ? byCreation : compareText(a.id, b.id);
}

/** The `limit` most recent tasks, newest first (a new array; the input is not touched). */
export function mostRecent(tasks: readonly Task[], limit: number): Task[] {
  return [...tasks].sort(compareRecentFirst).slice(0, limit);
}
