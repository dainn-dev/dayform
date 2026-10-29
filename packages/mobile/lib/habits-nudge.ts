import { isDone } from "./habits-history";
import { addDays, dateKey, type Task } from "./planner";

export const DEFAULT_STALE_DAYS = 14;
export const MAX_STALE_IDS = 50;

export type StaleTasks = {
  /** How many unfinished tasks are at least `minDays` old (not capped). */
  count: number;
  /** Ids of the oldest ones, oldest first, at most `MAX_STALE_IDS`. */
  ids: readonly string[];
};

function compareOldestFirst(a: Task, b: Task): number {
  if (a.date !== b.date) return (a.date ?? "") < (b.date ?? "") ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/**
 * Unfinished tasks whose day is `minDays` or more in the past (today excluded) and that are not occurrences
 * of a recurring series. Backlog tasks have no date and are never counted.
 */
export function stalePastTasks(history: readonly Task[], now: Date, minDays = DEFAULT_STALE_DAYS): StaleTasks {
  const days = Number.isFinite(minDays) ? Math.max(1, Math.floor(minDays)) : 1;
  const cutoff = addDays(dateKey(now), -days);
  const stale = history.filter(task => !isDone(task) && task.date !== null && task.date <= cutoff && !task.seriesId);
  stale.sort(compareOldestFirst);
  return { count: stale.length, ids: stale.slice(0, MAX_STALE_IDS).map(task => task.id) };
}
