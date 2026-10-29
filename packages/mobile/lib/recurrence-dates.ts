import { addDays, dateKey, fromKey, type Repeat } from "./planner";

/**
 * Calendar math of the repeat rules: which dates a rule fires on. Pure and framework-free;
 * `recurrence.ts` builds the materialised series on top of it.
 */

export const DAYS_PER_WEEK = 7;
const SATURDAY = 6;
const SUNDAY = 0;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** What a rule needs from its first occurrence: the weekday (weekly) and the day-of-month (monthly). */
export type Anchor = { weekday: number; monthDay: number };

/** How a rule walks the calendar: by day steps (optionally skipping weekends) or by calendar month. */
type RuleSpec = { kind: "days"; step: number; weekdaysOnly: boolean } | { kind: "monthly" };

function assertNever(value: never): never {
  throw new Error(`Unhandled repeat rule: ${String(value)}`);
}

function assertDateKey(value: string): void {
  if (!DATE_PATTERN.test(value) || dateKey(fromKey(value)) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
}

export function weekdayOf(key: string): number {
  return fromKey(key).getDay();
}

export function dayOfMonth(key: string): number {
  return fromKey(key).getDate();
}

function isWeekend(key: string): boolean {
  const day = weekdayOf(key);
  return day === SATURDAY || day === SUNDAY;
}

function ruleSpec(rule: Repeat): RuleSpec {
  switch (rule) {
    case "daily": return { kind: "days", step: 1, weekdaysOnly: false };
    case "weekdays": return { kind: "days", step: 1, weekdaysOnly: true };
    case "weekly": return { kind: "days", step: DAYS_PER_WEEK, weekdaysOnly: false };
    case "monthly": return { kind: "monthly" };
    default: return assertNever(rule);
  }
}

/** `monthDay` of the given month, clamped to the month's last day. `month` may overflow (Date normalises it). */
function monthlyDate(monthDay: number, year: number, month: number): string {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return dateKey(new Date(year, month, Math.min(monthDay, lastDay), 12));
}

/** Monthly dates in [from, to], at most `limit`. */
function monthlyDates(monthDay: number, from: string, to: string, limit: number): string[] {
  const start = fromKey(from);
  const result: string[] = [];
  for (let i = 0; result.length < limit; i++) {
    const day = monthlyDate(monthDay, start.getFullYear(), start.getMonth() + i);
    if (day > to) break;
    if (day >= from) result.push(day);
  }
  return result;
}

/** Whether `rule`, anchored on `anchor`, fires on `day` (a day not before the anchor). */
export function firesOn(rule: Repeat, anchor: Anchor, day: string): boolean {
  const spec = ruleSpec(rule);
  if (spec.kind === "monthly") {
    const date = fromKey(day);
    return day === monthlyDate(anchor.monthDay, date.getFullYear(), date.getMonth());
  }
  if (spec.weekdaysOnly && isWeekend(day)) return false;
  return spec.step === 1 || weekdayOf(day) === anchor.weekday;
}

/**
 * Dates on which `rule` fires from `startDate` to `toDate`, both inclusive (at most `limit`).
 * daily = every day; weekdays = Monday-Friday only (a weekend `startDate` is therefore NOT
 * included); weekly = the same weekday as `startDate`; monthly = day-of-month `monthDay`
 * (default: that of `startDate`), clamped to the last day of shorter months (31st -> 30th/28th/29th).
 */
export function occurrenceDates(
  rule: Repeat,
  startDate: string,
  toDate: string,
  limit = Infinity,
  monthDay = dayOfMonth(startDate),
): string[] {
  assertDateKey(startDate);
  assertDateKey(toDate);
  const spec = ruleSpec(rule);
  if (spec.kind === "monthly") return monthlyDates(monthDay, startDate, toDate, limit);
  const result: string[] = [];
  for (let day = startDate; day <= toDate && result.length < limit; day = addDays(day, spec.step)) {
    if (spec.weekdaysOnly && isWeekend(day)) continue;
    result.push(day);
  }
  return result;
}
