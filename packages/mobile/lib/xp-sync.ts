import type { Task } from "./planner";

/**
 * What a committed write means for the experience (framework-free, tested). It compares the list before and after:
 *  - a task that is done now and was not before (or is new and done) was just finished: it earns;
 *  - a task still in the list that was done and is not any more was reopened (or its completion undone): it gives back.
 * A task that left the list (deleted or archived) keeps what it gave, so tidying up never costs experience, and a task that
 * returns (undo of a delete, a restore) cannot earn twice because the ledger remembers it.
 */
export type XpChange = { finished: Task[]; reopened: string[] };

export function xpChange(before: readonly Task[], next: readonly Task[]): XpChange {
  const earlier = new Map(before.map(task => [task.id, task]));
  const finished: Task[] = [];
  const reopened: string[] = [];
  for (const task of next) {
    const was = earlier.get(task.id);
    if (task.status === "done") {
      if (was?.status !== "done") finished.push(task);
    } else if (was?.status === "done") {
      reopened.push(task.id);
    }
  }
  return { finished, reopened };
}
