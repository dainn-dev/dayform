import { daysBetween } from "./cycle-date";

/**
 * Types and limits of the private period tracker. This is health data: it is stored only on the device
 * (`dayform.cycle.v1`), is off by default and never leaves the phone except in the user's own backup file.
 */
export const CYCLE_KEY = "dayform.cycle.v1";

export const MAX_PERIODS = 240;
export const MAX_PERIOD_SPAN_DAYS = 14;
export const MAX_PERIOD_AGE_YEARS = 10;
/** Bound on raw periods judged when parsing, so a hostile file cannot make the parser loop for long. */
export const RAW_PERIOD_CAP = 2000;

export const CYCLE_LENGTH_MIN = 21;
export const CYCLE_LENGTH_MAX = 45;
export const DEFAULT_CYCLE_LENGTH = 28;
export const PERIOD_LENGTH_MIN = 1;
export const PERIOD_LENGTH_MAX = 10;
export const DEFAULT_PERIOD_LENGTH = 5;
export const REMINDER_DAYS_BEFORE_MIN = 0;
export const REMINDER_DAYS_BEFORE_MAX = 3;
export const DEFAULT_REMINDER_DAYS_BEFORE = 1;
export const DEFAULT_REMINDER_TIME = "09:00";
/** Seconds the screen stays unlocked after the last unlock or activity; 0 locks every time the screen is left. */
export const LOCK_TIMEOUTS = [0, 30, 60, 300] as const;
export type LockTimeout = (typeof LOCK_TIMEOUTS)[number];
export const DEFAULT_LOCK_TIMEOUT: LockTimeout = 60;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One period. `end` (inclusive) is missing while it is still going on. */
export type Period = { start: string; end?: string };

export type CycleDefaults = { cycleLength: number; periodLength: number };
export type CycleReminders = {
  /** Days before the predicted start to notify (0 = on the day). */
  daysBefore: number;
  /** Local wall-clock `HH:mm`. */
  time: string;
  notifyLate: boolean;
  notifyFertile: boolean;
  /** Notification text that says nothing about what the app is for. */
  neutralText: boolean;
};
export type CycleLock = { enabled: boolean; timeoutSec: number };

export type CycleState = {
  enabled: boolean;
  /** The "this is an estimate, not contraception" notice was accepted. */
  acknowledged: boolean;
  paused: boolean;
  /** Canonical order: by `start`, newest last, no duplicates or overlaps. */
  periods: Period[];
  defaults: CycleDefaults;
  reminders: CycleReminders;
  lock: CycleLock;
  showOnTimeline: boolean;
};

/** Key order here is the canonical JSON order, so a saved state reads back byte for byte. */
export const DEFAULT_CYCLE_STATE: CycleState = {
  enabled: false,
  acknowledged: false,
  paused: false,
  periods: [],
  defaults: { cycleLength: DEFAULT_CYCLE_LENGTH, periodLength: DEFAULT_PERIOD_LENGTH },
  reminders: {
    daysBefore: DEFAULT_REMINDER_DAYS_BEFORE, time: DEFAULT_REMINDER_TIME,
    notifyLate: true, notifyFertile: false, neutralText: true,
  },
  lock: { enabled: true, timeoutSec: DEFAULT_LOCK_TIMEOUT },
  showOnTimeline: false,
};

export type CycleFailure =
  | "invalid-date" | "future" | "too-old" | "invalid-range" | "too-long"
  | "overlap" | "limit" | "unknown-period" | "invalid-value";
export type CycleResult = { ok: true; state: CycleState } | { ok: false; reason: CycleFailure };

/** The last day a period occupies: its end, or only its start while it is open. */
export function periodExtent(period: Period): string {
  return period.end ?? period.start;
}

/** Two periods share a day (a duplicate included). Dates compare as strings: `YYYY-MM-DD` sorts chronologically. */
export function periodsOverlap(a: Period, b: Period): boolean {
  return a.start <= periodExtent(b) && b.start <= periodExtent(a);
}

/** An end before the start, or a span longer than 14 days. Both dates must already be valid. */
export function periodSpanFailure(period: Period): "invalid-range" | "too-long" | null {
  if (period.end === undefined) return null;
  if (period.end < period.start) return "invalid-range";
  return daysBetween(period.start, period.end) > MAX_PERIOD_SPAN_DAYS ? "too-long" : null;
}

/** A fresh period object with keys in canonical order (`end` only when present). */
export function makePeriod(period: Period): Period {
  return period.end === undefined ? { start: period.start } : { start: period.start, end: period.end };
}

export function comparePeriods(a: Period, b: Period): number {
  if (a.start === b.start) return 0;
  return a.start < b.start ? -1 : 1;
}
