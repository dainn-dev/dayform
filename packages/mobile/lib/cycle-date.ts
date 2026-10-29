/**
 * Strict local-calendar helpers for the cycle tracker. Dates are `YYYY-MM-DD` wall-clock strings; differences are
 * computed with integer civil-calendar arithmetic (no `Date`), so DST changes and time zones cannot shift a count.
 * Adding days to a key stays with `addDays` from planner.ts.
 */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const FEBRUARY = 2;
/** Years outside this range are never real entries; it keeps absurd values out of the arithmetic. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2199;

const DAYS_PER_ERA = 146097;
const DAYS_PER_YEAR = 365;
const YEARS_PER_ERA = 400;
const EPOCH_SHIFT = 719468;
const MONTH_SHIFT_FEB_FIRST = 9;
const MONTH_SHIFT_MAR_FIRST = -3;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return month === FEBRUARY && isLeapYear(year) ? MONTH_LENGTHS[1] + 1 : MONTH_LENGTHS[month - 1];
}

/** True only for a real calendar date written as zero-padded `YYYY-MM-DD` (2026-02-30 is refused). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Days since 1970-01-01 of a valid key (civil-from-days algorithm; the key must already be valid). */
export function dayNumber(key: string): number {
  const [rawYear, month, day] = key.split("-").map(Number);
  const year = month <= FEBRUARY ? rawYear - 1 : rawYear;
  const era = Math.floor(year / YEARS_PER_ERA);
  const yearOfEra = year - era * YEARS_PER_ERA;
  const shiftedMonth = month + (month > FEBRUARY ? MONTH_SHIFT_MAR_FIRST : MONTH_SHIFT_FEB_FIRST);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * DAYS_PER_YEAR + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - EPOCH_SHIFT;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The same month and day `years` earlier (a leap day becomes February 28 when that year has none). */
export function yearsAgo(key: string, years: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const target = year - years;
  const safeDay = Math.min(day, daysInMonth(target, month));
  return `${String(target).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}
