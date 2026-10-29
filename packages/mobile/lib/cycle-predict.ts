import { comparePeriods, type CycleState, type Period } from "./cycle-model";
import { daysBetween } from "./cycle-date";
import { addDays } from "./planner";

/*
 * Calendar-method estimates. Everything here is an ESTIMATE from the dates the user logged; it is not medical
 * advice and not contraception. All functions are pure: "today" is always passed in.
 *
 * Cycle length  = days between two consecutive logged period starts. A gap under 15 or over 60 days is a missed
 *                 entry or a pause, not a cycle, and is ignored.
 * Average       = mean of the most recent 6 cycle lengths, clamped to 21..45 (the default cycle length when no
 *                 cycle is known). The next start is the last start plus the rounded average.
 * Ovulation     ~ next start - 14 days (a fixed luteal phase). Fertile window = ovulation - 5 .. ovulation + 1.
 * Spread        = half the range of the recent cycles, 1..7 days (3 days when fewer than 2 cycles are known).
 * Safe days     = the fertile days of a published calendar method, produced only when the data supports it:
 *   - fewer than 3 cycles: nothing ("not-enough-cycles");
 *   - any of the last 12 cycles outside 21..45, or longest - shortest > 9: nothing ("irregular");
 *   - 3 to 5 cycles, all within 26..32: Standard Days (cycle days 8..19 counted from the last start);
 *   - 6 or more cycles: Ogino-Knaus on the last 12 (first fertile day = shortest - 18, last = longest - 11);
 *   - 3 to 5 cycles that are regular but not all within 26..32: nothing yet ("not-enough-cycles").
 * Late         = today is after the predicted start. Estimates for the cycle in progress are then withheld
 *                ("late"), and more than 60 days late the history is stale ("no-data").
 */
export const MIN_CYCLE_GAP_DAYS = 15;
export const MAX_CYCLE_GAP_DAYS = 60;
export const AVERAGE_WINDOW_CYCLES = 6;
export const SAFE_DAYS_WINDOW_CYCLES = 12;
export const REGULAR_CYCLE_MIN = 21;
export const REGULAR_CYCLE_MAX = 45;
export const MAX_REGULAR_SPREAD_DAYS = 9;
export const STANDARD_DAYS_MIN_CYCLES = 3;
export const OGINO_MIN_CYCLES = 6;
export const STANDARD_DAYS_FIRST = 8;
export const STANDARD_DAYS_LAST = 19;
export const STANDARD_CYCLE_MIN = 26;
export const STANDARD_CYCLE_MAX = 32;
export const OGINO_FIRST_OFFSET = 18;
export const OGINO_LAST_OFFSET = 11;
export const LUTEAL_DAYS = 14;
export const FERTILE_DAYS_BEFORE_OVULATION = 5;
export const FERTILE_DAYS_AFTER_OVULATION = 1;
const DEFAULT_SPREAD_DAYS = 3;
const MIN_SPREAD_DAYS = 1;
const MAX_SPREAD_DAYS = 7;
const TENTHS = 10;

export type CycleEntry = { start: string; length: number };
export type DateRange = { start: string; end: string };
export type SafeDaysReason = "ok" | "not-enough-cycles" | "irregular" | "paused" | "disabled" | "no-data" | "late";
export type SafeDays = {
  kind: "standard-days" | "ogino" | null;
  /** Fertile days of the cycle that began on `lastStart`; every other day of it is the "safe-estimate". */
  fertile: DateRange | null;
  /** The same range as 1-based cycle days counted from `lastStart`. */
  cycleDays: { first: number; last: number } | null;
  reason: SafeDaysReason;
};
export type Prediction = {
  nextStart: string | null;
  nextRangeEarliest: string | null;
  nextRangeLatest: string | null;
  /** Mean of the recent cycles (one decimal), clamped to 21..45. */
  averageLength: number | null;
  /** `averageLength` rounded to whole days: the length used for every date. */
  cycleLength: number | null;
  /** Every usable cycle length on record. */
  cycleCount: number;
  lastStart: string | null;
  /** Negative while the period is late. */
  daysUntilNext: number | null;
  late: boolean;
  daysLate: number;
  ovulation: string | null;
  fertileWindow: DateRange | null;
  safeDays: SafeDays;
};

const round1 = (value: number): number => Math.round(value * TENTHS) / TENTHS;
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Each gap between consecutive period starts that is a plausible cycle, tagged with the earlier start. */
export function cycleEntries(periods: readonly Period[]): CycleEntry[] {
  const sorted = [...periods].sort(comparePeriods);
  const entries: CycleEntry[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const length = daysBetween(sorted[i - 1].start, sorted[i].start);
    if (length >= MIN_CYCLE_GAP_DAYS && length <= MAX_CYCLE_GAP_DAYS) entries.push({ start: sorted[i - 1].start, length });
  }
  return entries;
}

export function cycleLengths(periods: readonly Period[]): number[] {
  return cycleEntries(periods).map(entry => entry.length);
}

/** Mean length in days (both ends counted) of the periods that have an end, to one decimal; null when none. */
export function averagePeriodLength(periods: readonly Period[]): number | null {
  const lengths = periods.flatMap(period => (period.end === undefined ? [] : [daysBetween(period.start, period.end) + 1]));
  return lengths.length === 0 ? null : round1(mean(lengths));
}

function noSafeDays(reason: SafeDaysReason): SafeDays {
  return { kind: null, fertile: null, cycleDays: null, reason };
}

function inactive(reason: SafeDaysReason): Prediction {
  return {
    nextStart: null, nextRangeEarliest: null, nextRangeLatest: null, averageLength: null, cycleLength: null, cycleCount: 0,
    lastStart: null, daysUntilNext: null, late: false, daysLate: 0, ovulation: null, fertileWindow: null,
    safeDays: noSafeDays(reason),
  };
}

function cycleDaysRange(kind: "standard-days" | "ogino", lengths: readonly number[]): { first: number; last: number } {
  if (kind === "standard-days") return { first: STANDARD_DAYS_FIRST, last: STANDARD_DAYS_LAST };
  return { first: Math.min(...lengths) - OGINO_FIRST_OFFSET, last: Math.max(...lengths) - OGINO_LAST_OFFSET };
}

function pickMethod(lengths: readonly number[]): "standard-days" | "ogino" | SafeDaysReason {
  if (lengths.length < STANDARD_DAYS_MIN_CYCLES) return "not-enough-cycles";
  const recent = lengths.slice(-SAFE_DAYS_WINDOW_CYCLES);
  const outOfRange = recent.some(length => length < REGULAR_CYCLE_MIN || length > REGULAR_CYCLE_MAX);
  if (outOfRange || Math.max(...recent) - Math.min(...recent) > MAX_REGULAR_SPREAD_DAYS) return "irregular";
  if (lengths.length >= OGINO_MIN_CYCLES) return "ogino";
  const standard = recent.every(length => length >= STANDARD_CYCLE_MIN && length <= STANDARD_CYCLE_MAX);
  return standard ? "standard-days" : "not-enough-cycles";
}

function safeDaysFor(lengths: readonly number[], lastStart: string): SafeDays {
  const method = pickMethod(lengths);
  if (method !== "standard-days" && method !== "ogino") return noSafeDays(method);
  const cycleDays = cycleDaysRange(method, lengths.slice(-SAFE_DAYS_WINDOW_CYCLES));
  const fertile = { start: addDays(lastStart, cycleDays.first - 1), end: addDays(lastStart, cycleDays.last - 1) };
  return { kind: method, fertile, cycleDays, reason: "ok" };
}

function spreadFor(recent: readonly number[]): number {
  if (recent.length < 2) return DEFAULT_SPREAD_DAYS;
  const halfRange = Math.ceil((Math.max(...recent) - Math.min(...recent)) / 2);
  return clamp(halfRange, MIN_SPREAD_DAYS, MAX_SPREAD_DAYS);
}

export function predict(state: CycleState, today: string): Prediction {
  if (!state.enabled) return inactive("disabled");
  if (state.paused) return inactive("paused");
  const known = state.periods.filter(period => period.start <= today).sort(comparePeriods);
  const lastStart = known.at(-1)?.start;
  if (lastStart === undefined) return inactive("no-data");

  const lengths = cycleLengths(known);
  const recent = lengths.slice(-AVERAGE_WINDOW_CYCLES);
  const average = recent.length === 0
    ? state.defaults.cycleLength
    : clamp(mean(recent), REGULAR_CYCLE_MIN, REGULAR_CYCLE_MAX);
  const cycleLength = Math.round(average);
  const base = {
    ...inactive("no-data"), averageLength: round1(average), cycleLength, cycleCount: lengths.length, lastStart,
  };

  const nextStart = addDays(lastStart, cycleLength);
  const daysUntilNext = daysBetween(today, nextStart);
  const daysLate = Math.max(0, -daysUntilNext);
  if (daysLate > MAX_CYCLE_GAP_DAYS) return base;

  const spread = spreadFor(recent);
  const late = daysLate > 0;
  const ovulation = addDays(nextStart, -LUTEAL_DAYS);
  return {
    ...base,
    nextStart,
    nextRangeEarliest: addDays(nextStart, -spread),
    nextRangeLatest: addDays(nextStart, spread),
    daysUntilNext,
    late,
    daysLate,
    ovulation: late ? null : ovulation,
    fertileWindow: late ? null : {
      start: addDays(ovulation, -FERTILE_DAYS_BEFORE_OVULATION),
      end: addDays(ovulation, FERTILE_DAYS_AFTER_OVULATION),
    },
    safeDays: late ? noSafeDays("late") : safeDaysFor(lengths, lastStart),
  };
}
