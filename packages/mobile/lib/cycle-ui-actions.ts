import { MAX_PERIOD_SPAN_DAYS, type CycleFailure, type CycleState, type Period } from "./cycle-model";
import { daysBetween } from "./cycle-date";
import { addDays } from "./planner";
import { tx } from "./cycle-ui-text";

/** What a tap on a calendar day can do, in the order the buttons are shown. */
export type DayAction = "start-here" | "end-here" | "edit-period" | "remove-period";

/** The dialog the cycle screen has open. `edit.period === null` adds a past period. */
export type DialogTarget =
  | { kind: "day"; date: string }
  | { kind: "edit"; period: Period | null }
  | { kind: "remove"; period: Period }
  | { kind: "erase-all" };

/**
 * The last day the UI treats a period as covering. An open period is assumed to run up to today, but no longer than
 * the longest span the model accepts, so one that was forgotten does not swallow every later day.
 */
export function coveredEnd(period: Period, today: string): string {
  if (period.end !== undefined) return period.end;
  const limit = addDays(period.start, MAX_PERIOD_SPAN_DAYS);
  const reach = today < limit ? today : limit;
  return reach < period.start ? period.start : reach;
}

/** The logged period that covers `date`, or null. */
export function periodAt(state: CycleState, date: string, today: string): Period | null {
  return state.periods.find(period => period.start <= date && date <= coveredEnd(period, today)) ?? null;
}

/** The most recent period that has no end yet, has begun and is still within the span an end can be set for. */
export function openPeriod(state: CycleState, today: string): Period | null {
  const open = state.periods.filter(period => period.end === undefined && period.start <= today
    && today <= addDays(period.start, MAX_PERIOD_SPAN_DAYS));
  return open.at(-1) ?? null;
}

export type QuickActions = { canStart: boolean; open: Period | null };

/** The two big buttons: "Period started today" (not while today is already inside a period) and "Period ended". */
export function quickActions(state: CycleState, today: string): QuickActions {
  return { canStart: periodAt(state, today, today) === null, open: openPeriod(state, today) };
}

/** Actions for a tapped day. Future days offer none: only today and earlier can be logged. */
export function dayActions(state: CycleState, date: string, today: string): DayAction[] {
  if (date > today) return [];
  const period = periodAt(state, date, today);
  if (period === null) return ["start-here"];
  const actions: DayAction[] = [];
  if (period.end === undefined && date > period.start) actions.push("end-here");
  actions.push("edit-period", "remove-period");
  return actions;
}

export type PeriodRow = { period: Period; ongoing: boolean; days: number };

/** Logged periods, newest first, with their length in days (an open one counts up to today). */
export function periodRows(state: CycleState, today: string): PeriodRow[] {
  return [...state.periods].reverse().map(period => ({
    period,
    ongoing: period.end === undefined,
    days: daysBetween(period.start, coveredEnd(period, today)) + 1,
  }));
}

/** The end date a new period editor starts with: the usual length after the start, never after today. */
export function suggestedEnd(start: string, periodLength: number, today: string): string {
  const end = addDays(start, Math.max(0, periodLength - 1));
  return end > today ? today : end;
}

const FAILURE_TEXT: Readonly<Record<CycleFailure | "write-failed" | "locked", string>> = {
  "invalid-date": tx("That date is not valid."),
  "future": tx("A period cannot start in the future."),
  "too-old": tx("That date is too far in the past."),
  "invalid-range": tx("The end cannot be before the start."),
  "too-long": tx("That period is too long. Check the end date."),
  "overlap": tx("That overlaps a period you already logged."),
  "limit": tx("You have reached the limit of logged periods. Delete old ones first."),
  "unknown-period": tx("That period no longer exists."),
  "invalid-value": tx("That value is not valid."),
  "write-failed": tx("Could not save. Please try again."),
  "locked": tx("Changes are turned off because the saved data could not be read safely."),
};

export const failureText = (reason: CycleFailure | "write-failed" | "locked"): string => FAILURE_TEXT[reason];

/** Month navigation inside the years the model accepts. */
export const MIN_CALENDAR_YEAR = 1900;
export const MAX_CALENDAR_YEAR = 2199;
export type MonthRef = { year: number; month: number };

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + delta;
  const year = Math.floor(index / 12);
  if (year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR) return ref;
  return { year, month: (index % 12) + 1 };
}
