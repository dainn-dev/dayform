import { describe, expect, test } from "bun:test";
import { DEFAULT_CYCLE_STATE, type Period } from "./cycle";
import { cycleStats } from "./cycle-stats";
import { MIN_CYCLE_BAR_PX, chartSummary, cycleBars } from "./cycle-ui-chart";
import { fillPlaceholders } from "./text-template";

const stats = (periods: Period[]) => cycleStats({ ...DEFAULT_CYCLE_STATE, enabled: true, periods });

describe("cycleBars", () => {
  test("is empty without a full cycle", () => {
    expect(cycleBars(stats([{ start: "2026-03-01" }]), 100)).toEqual([]);
  });

  test("scales against the longest cycle from a zero baseline", () => {
    const bars = cycleBars(stats([{ start: "2026-01-01" }, { start: "2026-01-29" }, { start: "2026-03-05" }]), 100);
    expect(bars.map(bar => bar.length)).toEqual([28, 35]);
    expect(bars.map(bar => bar.heightPx)).toEqual([80, 100]);
  });

  test("keeps a minimum height", () => {
    const bars = cycleBars(stats([{ start: "2026-01-01" }, { start: "2026-01-29" }]), 1);
    expect(bars[0]?.heightPx).toBe(MIN_CYCLE_BAR_PX);
  });
});

describe("chartSummary", () => {
  test("gives an empty-state sentence and then the figures", () => {
    expect(chartSummary(stats([])).text).toContain("at least two periods");
    const summary = chartSummary(stats([{ start: "2026-01-01" }, { start: "2026-01-29" }, { start: "2026-03-05" }]));
    expect(fillPlaceholders(summary.text, summary.values)).toBe("Last 2 cycles: average 31.5 days, shortest 28, longest 35.");
  });
});
