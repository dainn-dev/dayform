import { isDone } from "./habits-history";
import { MIN_TYPED_LENGTH, normalizeTitle, taskTitleKey } from "./habits-title";
import { addDays, dateKey, fromKey, type Repeat, type Task } from "./planner";

const WEEKLY_LOOKBACK_WEEKS = 4;
const DAYS_PER_WEEK = 7;
const WEEKLY_WINDOW_DAYS = WEEKLY_LOOKBACK_WEEKS * DAYS_PER_WEEK;
const WEEKLY_MIN = 3;
const WEEKDAYS_WINDOW = 5;
const WEEKDAYS_MIN = 4;
const DAILY_WINDOW = DAYS_PER_WEEK;
const DAILY_MIN = 6;
const SUNDAY = 0;
const SATURDAY = 6;

export type SuggestedRepeat = Extract<Repeat, "weekly" | "weekdays" | "daily">;

export type RepeatSuggestion = {
  repeat: SuggestedRepeat;
  /** 0 = Sunday .. 6 = Saturday (as `Date.getDay()`) for "weekly"; null otherwise. */
  weekday: number | null;
  /** In how many of the `window` periods the task was done (days for daily/weekdays, weeks for weekly). */
  occurrences: number;
  window: number;
};

const weekdayOf = (key: string): number => fromKey(key).getDay();
const isWeekday = (key: string): boolean => {
  const day = weekdayOf(key);
  return day !== SUNDAY && day !== SATURDAY;
};

/** Day keys from `today` going back, `count` of them (only Monday to Friday when `weekdaysOnly`). */
function recentDays(today: string, count: number, weekdaysOnly: boolean): string[] {
  const keys: string[] = [];
  for (let back = 0; keys.length < count; back += 1) {
    const key = addDays(today, -back);
    if (!weekdaysOnly || isWeekday(key)) keys.push(key);
  }
  return keys;
}

const countDone = (keys: readonly string[], days: ReadonlySet<string>): number => keys.filter(key => days.has(key)).length;

function weeklySuggestion(today: string, days: ReadonlySet<string>): RepeatSuggestion | null {
  const perWeekday = new Array<number>(DAYS_PER_WEEK).fill(0);
  for (const key of recentDays(today, WEEKLY_WINDOW_DAYS, false)) {
    if (days.has(key)) perWeekday[weekdayOf(key)]! += 1;
  }
  const best = Math.max(...perWeekday);
  if (best < WEEKLY_MIN) return null;
  return { repeat: "weekly", weekday: perWeekday.indexOf(best), occurrences: best, window: WEEKLY_LOOKBACK_WEEKS };
}

/**
 * Whether a finished task titled exactly like `typed` (normalised) has a habit: done on 6 of the last 7 days
 * ("daily"), on 4 of the last 5 weekdays ("weekdays"), or on the same weekday in 3 of the last 4 weeks ("weekly"),
 * counting today. Null when none of those holds, or when any of those tasks already belongs to a recurring series.
 */
export function suggestRepeat(typed: string, history: readonly Task[], now: Date): RepeatSuggestion | null {
  const title = normalizeTitle(typed);
  if (title.length < MIN_TYPED_LENGTH) return null;
  const today = dateKey(now);
  const since = addDays(today, -(WEEKLY_WINDOW_DAYS - 1));
  const days = new Set<string>();
  for (const task of history) {
    if (!isDone(task) || task.date === null || task.date < since || task.date > today) continue;
    if (taskTitleKey(task) !== title) continue;
    if (task.seriesId || task.repeat) return null;
    days.add(task.date);
  }
  const daily = countDone(recentDays(today, DAILY_WINDOW, false), days);
  if (daily >= DAILY_MIN) return { repeat: "daily", weekday: null, occurrences: daily, window: DAILY_WINDOW };
  const weekdays = countDone(recentDays(today, WEEKDAYS_WINDOW, true), days);
  if (weekdays >= WEEKDAYS_MIN) return { repeat: "weekdays", weekday: null, occurrences: weekdays, window: WEEKDAYS_WINDOW };
  return weeklySuggestion(today, days);
}
