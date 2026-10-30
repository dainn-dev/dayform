import { addDays, fromKey, type Task } from "./planner";

/** Calendar days of the Scheduled list shown at first (today and tomorrow), and added per page. */
export const INITIAL_DAYS = 2;
export const DAYS_PER_PAGE = 2;
const MS_PER_DAY = 86_400_000;

export type ScheduledPage = {
  /** Tasks dated today .. `windowEnd`, in the order given. */
  upcoming: Task[];
  /** Tasks dated before today. */
  earlier: Task[];
  earlierCount: number;
  /** True when a scheduled task is dated after `windowEnd`. */
  hasMore: boolean;
  /** Last day of the window ('YYYY-MM-DD'). */
  windowEnd: string;
};

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). `fromKey` is local noon, so DST cannot skew it. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / MS_PER_DAY);
}

/** Splits scheduled tasks (sorted by date) into earlier / the window `today .. today + daysShown - 1` / later. Backlog tasks are ignored. */
export function pageScheduled(scheduled: readonly Task[], today: string, daysShown: number): ScheduledPage {
  const windowEnd = addDays(today, Math.max(1, daysShown) - 1);
  const earlier: Task[] = [];
  const upcoming: Task[] = [];
  let hasMore = false;
  for (const task of scheduled) {
    if (!task.date) continue;
    if (task.date < today) earlier.push(task);
    else if (task.date <= windowEnd) upcoming.push(task);
    else hasMore = true;
  }
  return { upcoming, earlier, earlierCount: earlier.length, hasMore, windowEnd };
}

/** The rows to render: the window, preceded by the earlier tasks when the user expanded them. */
export function shownScheduled(page: ScheduledPage, showEarlier: boolean): Task[] {
  return showEarlier ? [...page.earlier, ...page.upcoming] : page.upcoming;
}

/** `from`, or `from` plus whole pages, whichever first covers `needed` days. */
function coverDays(needed: number, from: number): number {
  return needed <= from ? from : from + Math.ceil((needed - from) / DAYS_PER_PAGE) * DAYS_PER_PAGE;
}

/** The first scheduled date after `boundary` (from `boundary` on when `inclusive`), or null. */
function firstDateFrom(scheduled: readonly Task[], boundary: string, inclusive: boolean): string | null {
  let best: string | null = null;
  for (const task of scheduled) {
    const date = task.date;
    if (!date || (inclusive ? date < boundary : date <= boundary)) continue;
    if (best === null || date < best) best = date;
  }
  return best;
}

/** Days to show first: two, extended in pages until the first upcoming task day is inside the window. */
export function initialDays(scheduled: readonly Task[], today: string): number {
  const first = firstDateFrom(scheduled, today, true);
  return first === null ? INITIAL_DAYS : coverDays(daysBetween(today, first) + 1, INITIAL_DAYS);
}

/** Days to show after loading the next page; empty stretches are skipped so a page always gains a task. Unchanged when nothing is later. */
export function nextDays(scheduled: readonly Task[], today: string, current: number): number {
  const next = firstDateFrom(scheduled, addDays(today, current - 1), false);
  return next === null ? current : coverDays(daysBetween(today, next) + 1, current + DAYS_PER_PAGE);
}
