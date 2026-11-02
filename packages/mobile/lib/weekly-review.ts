import { addDays, type Category, type Task, type WeekStart } from "./planner";
import { computeStats, weekRange, type DateRange } from "./stats";
import { focusMinutesIn, type FocusLogEntry } from "./focus";

/**
 * The look back at one week: what got done against what was planned, how it compares with the week before, where the
 * time went, and the unfinished work that can be moved on with one tap. Pure; `today` decides which days are over.
 */
export type WeekReview = {
  range: DateRange;
  scheduledCount: number;
  doneCount: number;
  /** 0..1, or null when nothing was scheduled. */
  completionRate: number | null;
  doneMinutes: number;
  focusMinutes: number;
  /** The week before, for "compared with last week". */
  previous: { scheduledCount: number; doneCount: number; doneMinutes: number };
  /** The day with the most finished minutes (earliest on a tie); null when nothing was finished. */
  bestDay: string | null;
  /** The category with the most finished minutes; null when nothing was finished. */
  topCategory: { id: Category; doneMinutes: number } | null;
  /** Scheduled, unfinished, not part of a series, on a day before `today`: these can be moved on. */
  unfinished: Task[];
};

function isMovable(task: Task, range: DateRange, today: string): boolean {
  return task.date !== null && task.start !== null && task.date >= range.from && task.date <= range.to && task.date < today
    && task.status !== "done" && task.seriesId == null;
}

export function reviewWeek(tasks: readonly Task[], anchor: string, today: string, weekStart: WeekStart, focusLog: readonly FocusLogEntry[]): WeekReview {
  const range = weekRange(anchor, weekStart);
  const stats = computeStats(tasks, range, today);
  const before = computeStats(tasks, weekRange(addDays(range.from, -1), weekStart), today);
  let bestDay: string | null = null;
  let bestMinutes = 0;
  for (const day of stats.perDay) {
    if (day.doneMinutes > bestMinutes) { bestDay = day.date; bestMinutes = day.doneMinutes; }
  }
  let topCategory: WeekReview["topCategory"] = null;
  for (const [id, entry] of Object.entries(stats.perCategory)) {
    if (entry.doneMinutes > (topCategory?.doneMinutes ?? 0)) topCategory = { id, doneMinutes: entry.doneMinutes };
  }
  return {
    range,
    scheduledCount: stats.scheduledCount,
    doneCount: stats.doneCount,
    completionRate: stats.completionRate,
    doneMinutes: stats.doneMinutes,
    focusMinutes: focusMinutesIn(focusLog, range.from, range.to).total,
    previous: { scheduledCount: before.scheduledCount, doneCount: before.doneCount, doneMinutes: before.doneMinutes },
    bestDay,
    topCategory,
    unfinished: tasks.filter(task => isMovable(task, range, today)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.start ?? "").localeCompare(b.start ?? "")),
  };
}

/** Where a task of the reviewed week goes: the same weekday a week later, or today when that is already past. */
export function movedDate(date: string, today: string): string {
  const next = addDays(date, 7);
  return next < today ? today : next;
}

/** The store update that moves the given unfinished tasks on. Re-derives them from the list it is given; the same list comes back when nothing qualifies. */
export function moveOnUpdate(ids: readonly string[], range: DateRange, today: string): (tasks: Task[]) => Task[] {
  const wanted = new Set(ids);
  return tasks => {
    if (!tasks.some(task => wanted.has(task.id) && isMovable(task, range, today))) return tasks;
    return tasks.map(task => (wanted.has(task.id) && isMovable(task, range, today) ? { ...task, date: movedDate(task.date as string, today) } : task));
  };
}
