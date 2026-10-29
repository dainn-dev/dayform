import type { CycleState } from "./cycle-model";
import { averagePeriodLength, cycleEntries, type CycleEntry } from "./cycle-predict";

/** Bars shown by the cycle history chart. */
export const STATS_CYCLES = 12;
const TENTHS = 10;

export type CycleStats = {
  /** The latest cycles, oldest first (the chart draws them left to right). */
  lengths: CycleEntry[];
  average: number | null;
  shortest: number | null;
  longest: number | null;
  periodLengthAverage: number | null;
};

/** History figures for the chart. Works on the logged data whether or not predictions are switched on. */
export function cycleStats(state: CycleState): CycleStats {
  const lengths = cycleEntries(state.periods).slice(-STATS_CYCLES);
  const periodLengthAverage = averagePeriodLength(state.periods);
  if (lengths.length === 0) return { lengths, average: null, shortest: null, longest: null, periodLengthAverage };
  const values = lengths.map(entry => entry.length);
  const average = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * TENTHS) / TENTHS;
  return { lengths, average, shortest: Math.min(...values), longest: Math.max(...values), periodLengthAverage };
}
