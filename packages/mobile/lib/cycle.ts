import { isDateKey, yearsAgo } from "./cycle-date";
import {
  CYCLE_LENGTH_MAX,
  CYCLE_LENGTH_MIN,
  LOCK_TIMEOUTS,
  MAX_PERIODS,
  MAX_PERIOD_AGE_YEARS,
  PERIOD_LENGTH_MAX,
  PERIOD_LENGTH_MIN,
  REMINDER_DAYS_BEFORE_MAX,
  REMINDER_DAYS_BEFORE_MIN,
  TIME_PATTERN,
  comparePeriods,
  makePeriod,
  periodSpanFailure,
  periodsOverlap,
  type CycleDefaults,
  type CycleFailure,
  type CycleLock,
  type CycleReminders,
  type CycleResult,
  type CycleState,
  type Period,
} from "./cycle-model";

// The model, limits and parsing live in cycle-model.ts and cycle-parse.ts; this file is the public entry point.
export * from "./cycle-model";
export { cycleStateSchema, parseCycleState, parseCycleText, type ParsedCycle } from "./cycle-parse";

const fail = (reason: CycleFailure): CycleResult => ({ ok: false, reason });
const ok = (state: CycleState): CycleResult => ({ ok: true, state });
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Rebuilds a state with its keys in canonical order, so JSON.stringify of any result is canonical. */
function rebuild(state: CycleState, patch: Partial<CycleState>): CycleState {
  const next = { ...state, ...patch };
  return {
    enabled: next.enabled,
    acknowledged: next.acknowledged,
    paused: next.paused,
    periods: next.periods,
    defaults: next.defaults,
    reminders: next.reminders,
    lock: next.lock,
    showOnTimeline: next.showOnTimeline,
  };
}

/** True when the tracker holds anything worth exporting in a backup: it is switched on or has a logged period. */
export function hasCycleData(state: CycleState): boolean {
  return state.enabled || state.periods.length > 0;
}

// --- Periods ---------------------------------------------------------------------------------------------------

/**
 * Why a period cannot be recorded, or null. Rules: real calendar dates; start not after `today` and not more than
 * 10 years back; end not before start and at most 14 days after it.
 */
export function validatePeriod(period: Period, today: string): CycleFailure | null {
  if (!isDateKey(period.start) || (period.end !== undefined && !isDateKey(period.end))) return "invalid-date";
  if (period.start > today) return "future";
  if (period.start < yearsAgo(today, MAX_PERIOD_AGE_YEARS)) return "too-old";
  return periodSpanFailure(period);
}

function withPeriods(state: CycleState, others: readonly Period[], added: Period): CycleResult {
  if (others.some(other => periodsOverlap(other, added))) return fail("overlap");
  if (others.length >= MAX_PERIODS) return fail("limit");
  return ok(rebuild(state, { periods: [...others, makePeriod(added)].sort(comparePeriods) }));
}

export function addPeriod(state: CycleState, period: Period, today: string): CycleResult {
  const failure = validatePeriod(period, today);
  return failure === null ? withPeriods(state, state.periods, period) : fail(failure);
}

/** Replaces the period that starts on `originalStart`. */
export function updatePeriod(state: CycleState, originalStart: string, next: Period, today: string): CycleResult {
  if (!state.periods.some(period => period.start === originalStart)) return fail("unknown-period");
  const failure = validatePeriod(next, today);
  if (failure !== null) return fail(failure);
  return withPeriods(state, state.periods.filter(period => period.start !== originalStart), next);
}

export function removePeriod(state: CycleState, start: string): CycleResult {
  if (!state.periods.some(period => period.start === start)) return fail("unknown-period");
  return ok(rebuild(state, { periods: state.periods.filter(period => period.start !== start) }));
}

// --- Switches and settings -------------------------------------------------------------------------------------

function setFlag(state: CycleState, key: "enabled" | "acknowledged" | "paused" | "showOnTimeline", value: boolean): CycleResult {
  if (typeof value !== "boolean") return fail("invalid-value");
  return state[key] === value ? ok(state) : ok(rebuild(state, { [key]: value }));
}

export const setEnabled = (state: CycleState, enabled: boolean): CycleResult => setFlag(state, "enabled", enabled);
export const acknowledge = (state: CycleState): CycleResult => setFlag(state, "acknowledged", true);
export const setPaused = (state: CycleState, paused: boolean): CycleResult => setFlag(state, "paused", paused);
export const setShowOnTimeline = (state: CycleState, show: boolean): CycleResult => setFlag(state, "showOnTimeline", show);

export function updateDefaults(state: CycleState, patch: Partial<CycleDefaults>): CycleResult {
  const cycleLength = patch.cycleLength ?? state.defaults.cycleLength;
  const periodLength = patch.periodLength ?? state.defaults.periodLength;
  if (!isWhole(cycleLength, CYCLE_LENGTH_MIN, CYCLE_LENGTH_MAX) || !isWhole(periodLength, PERIOD_LENGTH_MIN, PERIOD_LENGTH_MAX)) {
    return fail("invalid-value");
  }
  if (cycleLength === state.defaults.cycleLength && periodLength === state.defaults.periodLength) return ok(state);
  return ok(rebuild(state, { defaults: { cycleLength, periodLength } }));
}

export function updateReminders(state: CycleState, patch: Partial<CycleReminders>): CycleResult {
  const current = state.reminders;
  const next: CycleReminders = {
    daysBefore: patch.daysBefore ?? current.daysBefore,
    time: patch.time ?? current.time,
    notifyLate: patch.notifyLate ?? current.notifyLate,
    notifyFertile: patch.notifyFertile ?? current.notifyFertile,
    neutralText: patch.neutralText ?? current.neutralText,
  };
  const valid =
    isWhole(next.daysBefore, REMINDER_DAYS_BEFORE_MIN, REMINDER_DAYS_BEFORE_MAX) &&
    typeof next.time === "string" && TIME_PATTERN.test(next.time) &&
    [next.notifyLate, next.notifyFertile, next.neutralText].every(value => typeof value === "boolean");
  if (!valid) return fail("invalid-value");
  const unchanged = (Object.keys(next) as Array<keyof CycleReminders>).every(key => next[key] === current[key]);
  return unchanged ? ok(state) : ok(rebuild(state, { reminders: next }));
}

export function updateLock(state: CycleState, patch: Partial<CycleLock>): CycleResult {
  const enabled = patch.enabled ?? state.lock.enabled;
  const timeoutSec = patch.timeoutSec ?? state.lock.timeoutSec;
  if (typeof enabled !== "boolean" || !(LOCK_TIMEOUTS as readonly number[]).includes(timeoutSec)) return fail("invalid-value");
  if (enabled === state.lock.enabled && timeoutSec === state.lock.timeoutSec) return ok(state);
  return ok(rebuild(state, { lock: { enabled, timeoutSec } }));
}

// --- Backup ----------------------------------------------------------------------------------------------------

/**
 * Applies a backup's tracker data. `replace` takes it as it is. `merge` keeps every current setting and only adds
 * the periods that neither duplicate nor overlap one already there (the newest 240 are kept).
 */
export function mergeCycleState(current: CycleState, incoming: CycleState, mode: "merge" | "replace"): CycleState {
  if (mode === "replace") return incoming;
  const merged: Period[] = [...current.periods];
  for (const period of incoming.periods) {
    if (!merged.some(existing => periodsOverlap(existing, period))) merged.push(period);
  }
  const periods = merged.sort(comparePeriods).slice(-MAX_PERIODS);
  const unchanged = periods.length === current.periods.length && periods.every((period, i) => period === current.periods[i]);
  return unchanged ? current : rebuild(current, { periods });
}
