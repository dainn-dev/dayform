// Pure statistics for the Stats tab. Dates are local YYYY-MM-DD strings (never UTC), weeks start on the user's chosen day (Monday by default).
import { addDays, categories, dateKey, fromKey, weekStartOf, type Category, type Task, type WeekStart } from "./planner";

export type DateRange = { from: string; to: string };
export type RangeKind = "week" | "month";
export type CategoryStats = { plannedMinutes: number; doneMinutes: number; count: number };
export type DayStats = { date: string; plannedMinutes: number; doneMinutes: number; scheduledCount: number; doneCount: number };
export type Stats = {
  scheduledCount: number;
  doneCount: number;
  /** 0..1, or null when nothing is scheduled in the range. */
  completionRate: number | null;
  plannedMinutes: number;
  doneMinutes: number;
  /** Keyed by category id: the built-ins always, plus any other id (custom, hidden, deleted) that a counted task uses. */
  perCategory: Record<Category, CategoryStats>;
  /** One entry for every date of the range, zero-filled. */
  perDay: DayStats[];
  /** Day with the most planned minutes (earliest on a tie); null when nothing is scheduled. */
  busiestDay: string | null;
  streak: number;
};

/** The seven days of the week containing `anchor`, starting on `weekStart` (Monday by default). */
export function weekRange(anchor: string, weekStart: WeekStart = "mon"): DateRange {
  const from = weekStartOf(anchor, weekStart);
  return { from, to: addDays(from, 6) };
}

/** 1st..last day of the month containing `anchor` (leap years included). */
export function monthRange(anchor: string): DateRange {
  const [year, month] = anchor.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const prefix = anchor.slice(0, 7);
  return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

/** The week or month `delta` steps away from the one containing `anchor`. */
export function shiftRange(kind: RangeKind, anchor: string, delta: number, weekStart: WeekStart = "mon"): DateRange {
  if (kind === "week") return weekRange(addDays(anchor, delta * 7), weekStart);
  const date = fromKey(`${anchor.slice(0, 7)}-01`);
  date.setMonth(date.getMonth() + delta);
  return monthRange(dateKey(date));
}

/**
 * The anchor to show after midnight moved "today" from `previousToday` to `today`: a user who was looking
 * at the range containing the old today follows to the new one; anyone browsing elsewhere stays put.
 */
export function followToday(kind: RangeKind, anchor: string, previousToday: string, today: string, weekStart: WeekStart = "mon"): string {
  const range = kind === "week" ? weekRange(anchor, weekStart) : monthRange(anchor);
  return previousToday >= range.from && previousToday <= range.to ? today : anchor;
}

function datesIn(range: DateRange): string[] {
  const dates: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) dates.push(day);
  return dates;
}

const isScheduled = (task: Task): task is Task & { date: string } => task.date !== null && task.start !== null;

/**
 * Streak rule: consecutive days with at least one done scheduled task, counted backwards from `today`.
 * If today has none yet, the streak still counts from yesterday (the day is not over), otherwise it is 0.
 */
function streakOf(tasks: readonly Task[], today: string): number {
  const doneDays = new Set(tasks.filter(task => isScheduled(task) && task.status === "done").map(task => task.date));
  let day = doneDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (doneDays.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

const EMPTY_CATEGORY: CategoryStats = { plannedMinutes: 0, doneMinutes: 0, count: 0 };

/** Every built-in id (so existing consumers always find them), in their fixed order; other ids are added as tasks use them. */
function emptyCategories(): Map<string, CategoryStats> {
  return new Map(categories.map(category => [category, EMPTY_CATEGORY]));
}

function busiest(perDay: readonly DayStats[]): string | null {
  let best: DayStats | null = null;
  for (const day of perDay) {
    if (day.scheduledCount === 0) continue;
    if (!best || day.plannedMinutes > best.plannedMinutes) best = day;
  }
  return best ? best.date : null;
}

export function computeStats(tasks: readonly Task[], range: DateRange, today: string): Stats {
  const days = new Map<string, DayStats>(datesIn(range).map(date => [date, { date, plannedMinutes: 0, doneMinutes: 0, scheduledCount: 0, doneCount: 0 }]));
  const perCategory = emptyCategories();
  for (const task of tasks) {
    const day = isScheduled(task) ? days.get(task.date) : undefined;
    if (!day) continue;
    const isDone = task.status === "done";
    const doneMinutes = isDone ? task.duration : 0;
    days.set(day.date, {
      ...day,
      plannedMinutes: day.plannedMinutes + task.duration,
      doneMinutes: day.doneMinutes + doneMinutes,
      scheduledCount: day.scheduledCount + 1,
      doneCount: day.doneCount + (isDone ? 1 : 0),
    });
    const entry = perCategory.get(task.category) ?? EMPTY_CATEGORY;
    perCategory.set(task.category, {
      plannedMinutes: entry.plannedMinutes + task.duration,
      doneMinutes: entry.doneMinutes + doneMinutes,
      count: entry.count + 1,
    });
  }
  const perDay = [...days.values()];
  const sum = (pick: (day: DayStats) => number) => perDay.reduce((total, day) => total + pick(day), 0);
  const scheduledCount = sum(day => day.scheduledCount);
  const doneCount = sum(day => day.doneCount);
  return {
    scheduledCount,
    doneCount,
    completionRate: scheduledCount === 0 ? null : doneCount / scheduledCount,
    plannedMinutes: sum(day => day.plannedMinutes),
    doneMinutes: sum(day => day.doneMinutes),
    // fromEntries defines own properties, so even an id such as "__proto__" stays plain data.
    perCategory: Object.fromEntries(perCategory),
    perDay,
    busiestDay: busiest(perDay),
    streak: streakOf(tasks, today),
  };
}
