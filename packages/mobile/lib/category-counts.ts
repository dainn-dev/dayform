import type { Task } from "./planner";

/** How many tasks use each category id. Ids come from stored data, so a Map (no prototype keys) is used. */
export function countTasksByCategory(tasks: readonly Pick<Task, "category">[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
  return counts;
}

export function taskCountOf(counts: ReadonlyMap<string, number>, id: string): number {
  return counts.get(id) ?? 0;
}
