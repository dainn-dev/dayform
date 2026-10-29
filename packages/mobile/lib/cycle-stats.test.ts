import { describe, test, expect } from "bun:test";
import { DEFAULT_CYCLE_STATE, type Period } from "./cycle";
import { cycleStats } from "./cycle-stats";
import { addDays } from "./planner";

function startsFrom(first: string, gaps: number[], ends: Array<number | null> = []): Period[] {
  const periods: Period[] = [];
  let start = first;
  [0, ...gaps].forEach((gap, i) => {
    start = addDays(start, gap);
    const length = ends[i];
    periods.push(length == null ? { start } : { start, end: addDays(start, length - 1) });
  });
  return periods;
}
const withPeriods = (periods: Period[]) => ({ ...DEFAULT_CYCLE_STATE, periods });

describe("cycleStats", () => {
  test("is empty for no data", () => {
    expect(cycleStats(DEFAULT_CYCLE_STATE)).toEqual({
      lengths: [], average: null, shortest: null, longest: null, periodLengthAverage: null,
    });
    expect(cycleStats(withPeriods([{ start: "2026-01-01" }])).lengths).toEqual([]);
  });

  test("lists each cycle with its start, oldest first, plus average, shortest and longest", () => {
    const stats = cycleStats(withPeriods(startsFrom("2026-01-01", [28, 30, 26])));
    expect(stats.lengths).toEqual([
      { start: "2026-01-01", length: 28 }, { start: "2026-01-29", length: 30 }, { start: "2026-02-28", length: 26 },
    ]);
    expect(stats).toMatchObject({ average: 28, shortest: 26, longest: 30 });
  });

  test("keeps the last 12 cycles and computes the figures from those", () => {
    const stats = cycleStats(withPeriods(startsFrom("2025-01-01", [40, ...Array.from({ length: 12 }, () => 28)])));
    expect(stats.lengths).toHaveLength(12);
    expect(stats.lengths.every(entry => entry.length === 28)).toBe(true);
    expect(stats).toMatchObject({ average: 28, shortest: 28, longest: 28 });
  });

  test("the average is rounded to one decimal", () => {
    expect(cycleStats(withPeriods(startsFrom("2026-01-01", [28, 29, 28]))).average).toBe(28.3);
  });

  test("ignored gaps are left out", () => {
    const stats = cycleStats(withPeriods(startsFrom("2026-01-01", [28, 90, 10, 30])));
    expect(stats.lengths.map(entry => entry.length)).toEqual([28, 30]);
  });

  test("the period length average counts closed periods only, over all of them", () => {
    const periods = startsFrom("2026-01-01", [28, 28, 28], [5, 4, null, 5]);
    expect(cycleStats(withPeriods(periods)).periodLengthAverage).toBe(4.7);
  });
});
