// Pure geometry and formatting helpers for the Stats charts (no React Native, unit-tested).

/** Smallest visible bar height in px for a day that has planned time. */
export const MIN_BAR_PX = 4;

export type BarLayout = { plannedPx: number; donePx: number };

export function maxPlannedMinutes(days: readonly { plannedMinutes: number }[]): number {
  return days.reduce((max, day) => Math.max(max, day.plannedMinutes), 0);
}

/** Planned bar height relative to the busiest day; the done fill is its share of the planned bar. */
export function barLayout(plannedMinutes: number, doneMinutes: number, maxMinutes: number, heightPx: number): BarLayout {
  if (plannedMinutes <= 0 || maxMinutes <= 0) return { plannedPx: 0, donePx: 0 };
  const plannedPx = Math.max(MIN_BAR_PX, Math.round((plannedMinutes / maxMinutes) * heightPx));
  const doneShare = Math.min(1, doneMinutes / plannedMinutes);
  return { plannedPx, donePx: Math.round(plannedPx * doneShare) };
}

/** Category bar length as a fraction (0..1) of the longest category bar. */
export function categoryShare(minutes: number, maxMinutes: number): number {
  return maxMinutes > 0 ? minutes / maxMinutes : 0;
}

export function percentLabel(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

/** Month chart axis: label the 1st and every 5th day. */
export function showMonthTick(dayOfMonth: number): boolean {
  return dayOfMonth === 1 || dayOfMonth % 5 === 0;
}
