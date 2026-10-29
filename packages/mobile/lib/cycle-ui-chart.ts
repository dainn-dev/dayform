import type { CycleStats } from "./cycle-stats";
import { fill, tx, type Fill } from "./cycle-ui-text";

/** Smallest visible bar, so a short cycle never disappears. */
export const MIN_CYCLE_BAR_PX = 6;

export type CycleBar = { start: string; length: number; heightPx: number };

/** Bar heights against the longest cycle shown (the baseline is zero days, so lengths compare honestly). */
export function cycleBars(stats: CycleStats, chartHeightPx: number): CycleBar[] {
  const longest = stats.longest ?? 0;
  if (longest <= 0) return [];
  return stats.lengths.map(entry => ({
    start: entry.start,
    length: entry.length,
    heightPx: Math.max(MIN_CYCLE_BAR_PX, Math.round((entry.length / longest) * chartHeightPx)),
  }));
}

/** The chart's accessible summary, or the empty-state sentence when fewer than one full cycle is logged. */
export function chartSummary(stats: CycleStats): Fill {
  if (stats.average === null || stats.shortest === null || stats.longest === null) {
    return fill(tx("Log at least two periods to see how long your cycles are."));
  }
  return fill(tx("Last {count} cycles: average {average} days, shortest {shortest}, longest {longest}."), {
    count: String(stats.lengths.length), average: String(stats.average), shortest: String(stats.shortest), longest: String(stats.longest),
  });
}
