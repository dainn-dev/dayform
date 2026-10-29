import { minutes, type Task } from "./planner";

export type ExploreFilter = "all" | "active" | "done";
export type TaskStats = { todo: number; scheduled: number; done: number };
export type ExploreSections = { backlog: Task[]; scheduled: Task[] };

type Slot = { id: string; date: string; start: number; end: number };

function toSlots(tasks: readonly Task[]): Slot[] {
  const slots: Slot[] = [];
  for (const task of tasks) {
    if (!task.date || !task.start) continue;
    const start = minutes(task.start);
    slots.push({ id: task.id, date: task.date, start, end: start + task.duration });
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.end - b.end);
}

/**
 * Ids of scheduled tasks that overlap at least one other scheduled task on the same day
 * (same definition as `overlaps()` in planner.ts). Sort + sweep, O(n log n).
 *
 * Within a day sorted by start, task i overlaps an earlier task iff the largest end so far is past its start,
 * and overlaps a later task iff the next task starts before i ends.
 */
export function conflictIds(tasks: readonly Task[]): Set<string> {
  const slots = toSlots(tasks);
  const flagged = new Set<string>();
  let dayStart = 0;
  while (dayStart < slots.length) {
    let dayEnd = dayStart;
    while (dayEnd < slots.length && slots[dayEnd].date === slots[dayStart].date) dayEnd += 1;
    flagDay(slots, dayStart, dayEnd, flagged);
    dayStart = dayEnd;
  }
  return flagged;
}

function flagDay(slots: readonly Slot[], from: number, to: number, flagged: Set<string>): void {
  let maxEnd = Number.NEGATIVE_INFINITY;
  let maxEndId: string | null = null;
  for (let i = from; i < to; i += 1) {
    const slot = slots[i];
    if (maxEnd > slot.start) {
      flagged.add(slot.id);
      if (maxEndId !== null) flagged.add(maxEndId);
    }
    if (i + 1 < to && slots[i + 1].start < slot.end) flagged.add(slot.id);
    if (slot.end > maxEnd) { maxEnd = slot.end; maxEndId = slot.id; }
  }
}

/** Header stats, always computed from the full (unfiltered) list. */
export function taskStats(tasks: readonly Task[]): TaskStats {
  let todo = 0, scheduled = 0, done = 0;
  for (const task of tasks) {
    if (task.status === "done") done += 1; else todo += 1;
    if (task.start) scheduled += 1;
  }
  return { todo, scheduled, done };
}

export function matchesFilter(task: Task, filter: ExploreFilter): boolean {
  if (filter === "all") return true;
  return filter === "done" ? task.status === "done" : task.status !== "done";
}

function byDateThenStart(a: Task, b: Task): number {
  return (a.date ?? "").localeCompare(b.date ?? "") || (a.start ?? "").localeCompare(b.start ?? "");
}

/** Splits the filtered tasks into the backlog and the scheduled list (sorted by date, then start). */
export function buildExploreSections(tasks: readonly Task[], filter: ExploreFilter): ExploreSections {
  const visible = tasks.filter(task => matchesFilter(task, filter));
  return {
    backlog: visible.filter(task => !task.start),
    scheduled: visible.filter(task => task.start).sort(byDateThenStart),
  };
}
