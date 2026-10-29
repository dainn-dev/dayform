import type { Task } from "./planner";

/**
 * Unfinished work of a past day that can be moved to today: scheduled, not done, and not part of a
 * recurring series (a series already has its own occurrence for today, so moving one would duplicate it).
 * Dates are `YYYY-MM-DD`, so comparing them as strings is a calendar comparison.
 */
function isCarryOver(task: Task, day: string, today: string): boolean {
  return day < today && task.date === day && task.start !== null && task.status !== "done" && task.seriesId == null;
}

export function carryOverCandidates(tasks: Task[], day: string, today: string): Task[] {
  return tasks.filter(task => isCarryOver(task, day, today));
}

/**
 * Builds the store update that moves a past day's unfinished tasks to today, keeping their time and
 * length. It re-derives the tasks from the list it is given, so it is safe inside the store's write
 * queue, and it returns the same list when nothing needs moving so no write happens.
 */
export function carryOverUpdate(day: string, today: string): (tasks: Task[]) => Task[] {
  return tasks => {
    if (!tasks.some(task => isCarryOver(task, day, today))) return tasks;
    return tasks.map(task => (isCarryOver(task, day, today) ? { ...task, date: today } : task));
  };
}
