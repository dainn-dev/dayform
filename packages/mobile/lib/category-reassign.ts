import type { Task } from "./planner";

/**
 * Moves every task of category `fromId` to `toId`. Immutable: changed tasks are copies, every other task keeps
 * its reference (so the undo diff stays cheap). When nothing changes the SAME array is returned, which the
 * tasks store treats as "no write needed". The archive is never part of this list and is not touched.
 */
export function reassignCategory(tasks: readonly Task[], fromId: string, toId: string): Task[] {
  if (fromId === toId || !tasks.some(task => task.category === fromId)) return tasks as Task[];
  return tasks.map(task => (task.category === fromId ? { ...task, category: toId } : task));
}

export type MutateTasks = (update: (tasks: Task[]) => Task[]) => Promise<boolean>;
export type RemoveCategory = (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>;

export type DeleteOutcome =
  | { ok: true }
  /** The tasks could not be moved (write failed or blocked): the category was NOT deleted. */
  | { ok: false; stage: "tasks" }
  /** The tasks were moved but the category could not be removed. */
  | { ok: false; stage: "category"; reason: string };

/**
 * Deletes a custom category without orphaning tasks: first one write moves its tasks to `targetId`; only after
 * that succeeds is the category removed. The move is deliberately NOT undoable: undo would put the tasks back on
 * a category that no longer exists.
 */
export async function deleteCategoryWithTasks(input: {
  id: string;
  targetId: string;
  mutateTasks: MutateTasks;
  removeCategory: RemoveCategory;
}): Promise<DeleteOutcome> {
  const { id, targetId, mutateTasks, removeCategory } = input;
  let moved = false;
  try {
    moved = await mutateTasks(tasks => reassignCategory(tasks, id, targetId));
  } catch {
    moved = false;
  }
  if (!moved) return { ok: false, stage: "tasks" };
  try {
    const removed = await removeCategory(id);
    return removed.ok ? { ok: true } : { ok: false, stage: "category", reason: removed.reason };
  } catch {
    return { ok: false, stage: "category", reason: "write-failed" };
  }
}
