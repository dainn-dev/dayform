import { periodExtent, type CycleState, type Period } from "./cycle-model";
import { daysBetween } from "./cycle-date";
import { averagePeriodLength, predict, LUTEAL_DAYS, FERTILE_DAYS_AFTER_OVULATION, FERTILE_DAYS_BEFORE_OVULATION } from "./cycle-predict";
import { addDays, dateKey, weekDays, weekStartOf, type WeekStart } from "./planner";

/*
 * What the month calendar and the Timeline week strip show for each day. Priority: logged period > predicted
 * period > fertile > safe-estimate. Only a logged period is ever shown for a past day. The last logged cycle is
 * projected forward at most MAX_PROJECTED_CYCLES times, because the error of an average grows with every cycle.
 * Nothing is projected while the period is late, paused, disabled or the history is stale (see predict()).
 */
export const MAX_PROJECTED_CYCLES = 2;
const DAYS_PER_WEEK = 7;

export type CalendarKind = "period" | "predicted-period" | "fertile" | "safe-estimate" | "none";
export type CalendarDay = { date: string; inMonth: boolean; isToday: boolean; kind: CalendarKind; logged: boolean };
export type WeekMark = { date: string; kind: CalendarKind };

type DayRange = { first: number; last: number };
type Plan = {
  lastStart: string;
  cycleLength: number;
  periodLength: number;
  /** The most recent period has no end yet, so its remaining days are expected. */
  lastPeriodOpen: boolean;
  /** 0-based days of a cycle that are fertile by the general estimate. */
  fertile: DayRange;
  /** 0-based days of a cycle that are fertile by the calendar method; present only when safe days apply. */
  method: DayRange | null;
};

const within = (day: number, range: DayRange): boolean => day >= range.first && day <= range.last;

function buildPlan(state: CycleState, today: string): Plan | null {
  const prediction = predict(state, today);
  const { lastStart, cycleLength, nextStart } = prediction;
  if (lastStart === null || cycleLength === null || nextStart === null || prediction.late) return null;
  const last = state.periods.find(period => period.start === lastStart);
  const periodLength = Math.max(1, Math.round(averagePeriodLength(state.periods) ?? state.defaults.periodLength));
  const ovulationDay = cycleLength - LUTEAL_DAYS;
  const { cycleDays } = prediction.safeDays;
  return {
    lastStart, cycleLength, periodLength,
    lastPeriodOpen: last !== undefined && last.end === undefined,
    fertile: { first: ovulationDay - FERTILE_DAYS_BEFORE_OVULATION, last: ovulationDay + FERTILE_DAYS_AFTER_OVULATION },
    method: cycleDays === null ? null : { first: cycleDays.first - 1, last: cycleDays.last - 1 },
  };
}

function projectedKind(plan: Plan, date: string): CalendarKind {
  const offset = daysBetween(plan.lastStart, date);
  const cycle = Math.floor(offset / plan.cycleLength);
  if (cycle > MAX_PROJECTED_CYCLES) return "none";
  const day = offset - cycle * plan.cycleLength;
  if (day < plan.periodLength && (cycle >= 1 || plan.lastPeriodOpen)) return "predicted-period";
  if (within(day, plan.fertile) || (plan.method !== null && within(day, plan.method))) return "fertile";
  return plan.method === null ? "none" : "safe-estimate";
}

const isLogged = (periods: readonly Period[], date: string): boolean =>
  periods.some(period => period.start <= date && date <= periodExtent(period));

function classifier(state: CycleState, today: string): (date: string) => CalendarKind {
  const plan = buildPlan(state, today);
  return date => {
    if (isLogged(state.periods, date)) return "period";
    return plan === null || date < today ? "none" : projectedKind(plan, date);
  };
}

/** Whole weeks (rows of 7) covering `month` (1-12), starting on `weekStart`. */
export function monthGrid(year: number, month: number, weekStart: WeekStart, state: CycleState, today: string): CalendarDay[][] {
  const first = dateKey(new Date(year, month - 1, 1, 12));
  const last = dateKey(new Date(year, month, 0, 12));
  const gridStart = weekStartOf(first, weekStart);
  const weekCount = Math.ceil((daysBetween(gridStart, last) + 1) / DAYS_PER_WEEK);
  const classify = classifier(state, today);
  return Array.from({ length: weekCount }, (_, week) =>
    weekDays(addDays(gridStart, week * DAYS_PER_WEEK)).map(date => {
      const kind = classify(date);
      return { date, inMonth: date >= first && date <= last, isToday: date === today, kind, logged: kind === "period" };
    }));
}

/**
 * One mark per date, in order, for the Timeline week strip. Everything is "none" unless the user chose to show the
 * tracker on the Timeline and it is enabled and not paused.
 */
export function weekMarks(dates: readonly string[], state: CycleState, today: string): WeekMark[] {
  if (!state.showOnTimeline || !state.enabled || state.paused) return dates.map(date => ({ date, kind: "none" }));
  const classify = classifier(state, today);
  return dates.map(date => ({ date, kind: classify(date) }));
}
