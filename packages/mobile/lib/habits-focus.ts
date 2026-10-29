import { isDone } from "./habits-history";
import { addDays, dateKey, minutes, type Task } from "./planner";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const WINDOW_HOURS = 2;

export const FOCUS_LOOKBACK_DAYS = 56;
export const FOCUS_MIN_SAMPLE = 20;
export const FOCUS_MIN_SHARE = 0.35;

export type FocusHours = {
  /** First hour of the two-hour window, 0..22. */
  startHour: number;
  /** `startHour + 2`, 2..24. */
  endHour: number;
  /** Fraction (0..1) of all completed minutes that fall inside the window. */
  share: number;
  /** Number of finished scheduled tasks the result is based on. */
  sample: number;
};

export type FocusOptions = { days?: number; minSample?: number; minShare?: number };

/** Completed minutes per clock hour, plus how many tasks were counted. */
function minutesPerHour(history: readonly Task[], since: string, today: string): { perHour: number[]; sample: number } {
  const perHour = new Array<number>(HOURS_PER_DAY).fill(0);
  let sample = 0;
  for (const task of history) {
    if (!isDone(task) || task.date === null || task.start === null || task.date < since || task.date > today) continue;
    const from = minutes(task.start);
    if (!(from >= 0 && from < MINUTES_PER_DAY) || !Number.isFinite(task.duration) || task.duration <= 0) continue;
    const to = Math.min(from + task.duration, MINUTES_PER_DAY);
    sample += 1;
    for (let hour = Math.floor(from / MINUTES_PER_HOUR); hour * MINUTES_PER_HOUR < to; hour += 1) {
      const hourStart = hour * MINUTES_PER_HOUR;
      perHour[hour]! += Math.min(to, hourStart + MINUTES_PER_HOUR) - Math.max(from, hourStart);
    }
  }
  return { perHour, sample };
}

/**
 * The two-hour window (aligned to the hour) holding the largest share of the minutes of finished scheduled tasks
 * in the last 56 days (today included). Null with fewer than 20 tasks or when the best share is under 35 percent.
 * Ties prefer the window that starts on its busier hour, then the earlier one.
 */
export function focusHours(history: readonly Task[], now: Date, options: FocusOptions = {}): FocusHours | null {
  const { days = FOCUS_LOOKBACK_DAYS, minSample = FOCUS_MIN_SAMPLE, minShare = FOCUS_MIN_SHARE } = options;
  const today = dateKey(now);
  const { perHour, sample } = minutesPerHour(history, addDays(today, -(days - 1)), today);
  const total = perHour.reduce((sum, value) => sum + value, 0);
  if (sample < minSample || total === 0) return null;
  let best = { startHour: 0, windowMinutes: -1, firstHour: -1 };
  for (let startHour = 0; startHour <= HOURS_PER_DAY - WINDOW_HOURS; startHour += 1) {
    const windowMinutes = perHour[startHour]! + perHour[startHour + 1]!;
    const firstHour = perHour[startHour]!;
    if (windowMinutes > best.windowMinutes || (windowMinutes === best.windowMinutes && firstHour > best.firstHour)) {
      best = { startHour, windowMinutes, firstHour };
    }
  }
  const share = best.windowMinutes / total;
  if (share < minShare) return null;
  return { startHour: best.startHour, endHour: best.startHour + WINDOW_HOURS, share, sample };
}

export type FocusDescription = {
  startHour: number;
  endHour: number;
  /** Window start as HH:mm, ready for `formatTime`. */
  from: string;
  /** Window end as HH:mm; the window that ends at 24 ends at "00:00" (midnight). */
  to: string;
  /** `share` as a whole percentage, 0..100. */
  sharePercent: number;
  sample: number;
};

const hourLabel = (hour: number): string => `${String(hour % HOURS_PER_DAY).padStart(2, "0")}:00`;

/** UI-ready data for a focus window; the caller formats the times with the user's 12h/24h setting. */
export function describeWindow(window: FocusHours): FocusDescription {
  return {
    startHour: window.startHour,
    endHour: window.endHour,
    from: hourLabel(window.startHour),
    to: hourLabel(window.endHour),
    sharePercent: Math.round(window.share * 100),
    sample: window.sample,
  };
}
