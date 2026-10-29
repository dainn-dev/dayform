import { describe, expect, test } from "bun:test";
import { DEFAULT_CYCLE_STATE, type CycleState, type Period } from "./cycle";
import { predict } from "./cycle-predict";
import { safeDaysView, summaryOf } from "./cycle-ui-summary";
import { fillPlaceholders } from "./text-template";

const formatDate = (key: string) => `<${key}>`;
const identity = (text: string) => text;
const on = (periods: Period[], extra: Partial<CycleState> = {}): CycleState => ({ ...DEFAULT_CYCLE_STATE, enabled: true, periods, ...extra });
const text = (f: { text: string; values: Readonly<Record<string, string>> } | null) => (f === null ? null : fillPlaceholders(f.text, f.values));
/** Periods exactly 28 days apart, ending with `last`. */
function every28(last: string, count: number): Period[] {
  const [y, m, d] = last.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(y, m - 1, d - 28 * (count - 1 - i), 12);
    return { start: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` };
  });
}

describe("summaryOf", () => {
  test("off, paused and no data are plain idle sentences", () => {
    expect(summaryOf(predict(DEFAULT_CYCLE_STATE, "2026-03-10"), DEFAULT_CYCLE_STATE, formatDate).headline.text).toBe("Tracking is off");
    const paused = on([{ start: "2026-03-01" }], { paused: true });
    expect(summaryOf(predict(paused, "2026-03-10"), paused, formatDate).headline.text).toBe("Tracking is paused");
    const empty = on([]);
    const view = summaryOf(predict(empty, "2026-03-10"), empty, formatDate);
    expect(view.tone).toBe("idle");
    expect(view.headline.text).toBe("Not enough data yet");
  });

  test("shows the expected date with its likely range", () => {
    const state = on([{ start: "2026-03-01" }]);
    const view = summaryOf(predict(state, "2026-03-10"), state, formatDate);
    expect(view.tone).toBe("next");
    expect(text(view.headline)).toBe("Next period expected <2026-03-29>");
    expect(text(view.detail)).toContain("<2026-03-26>");
  });

  test("says today and tomorrow in words", () => {
    const state = on([{ start: "2026-03-01" }]);
    expect(summaryOf(predict(state, "2026-03-29"), state, formatDate).headline.text).toBe("Next period expected today");
    expect(summaryOf(predict(state, "2026-03-28"), state, formatDate).headline.text).toBe("Next period expected tomorrow");
  });

  test("counts late days, singular and plural", () => {
    const state = on([{ start: "2026-03-01" }]);
    const one = summaryOf(predict(state, "2026-03-30"), state, formatDate);
    expect(one.tone).toBe("late");
    expect(text(one.headline)).toBe("1 day late");
    expect(text(summaryOf(predict(state, "2026-04-02"), state, formatDate).headline)).toBe("4 days late");
  });

  test("a stale history asks for a new entry", () => {
    const state = on([{ start: "2025-01-01" }]);
    expect(text(summaryOf(predict(state, "2026-03-10"), state, formatDate).detail)).toContain("long time");
  });
});

describe("safeDaysView", () => {
  test("is hidden with a plain reason when there is not enough data", () => {
    const state = on([{ start: "2026-03-01" }]);
    const view = safeDaysView(predict(state, "2026-03-10").safeDays, formatDate, identity);
    expect(view.visible).toBe(false);
    if (!view.visible) expect(view.reason.text).toContain("enough regular data");
  });

  test("is shown with its method and fertile range for six regular cycles", () => {
    const state = on(every28("2026-03-01", 7));
    const view = safeDaysView(predict(state, "2026-03-10").safeDays, formatDate, identity);
    expect(view.visible).toBe(true);
    if (view.visible) {
      expect(text(view.method)).toBe("Method: Ogino-Knaus (rhythm) method");
      expect(text(view.fertileRange)).toMatch(/^Fertile days this cycle: <2026-\d\d-\d\d> to <2026-\d\d-\d\d> \(cycle days 10 to 17\)$/);
    }
  });

  test("uses Standard Days for three regular cycles", () => {
    const state = on(every28("2026-03-01", 4));
    const view = safeDaysView(predict(state, "2026-03-10").safeDays, formatDate, text => `[${text}]`);
    expect(view.visible).toBe(true);
    if (view.visible) expect(text(view.method)).toBe("Method: [Standard Days method]");
  });

  test("describes the other days as lower-risk by estimate, never as safe", () => {
    const state = on(every28("2026-03-01", 7));
    const view = safeDaysView(predict(state, "2026-03-10").safeDays, formatDate, identity);
    expect(view.visible).toBe(true);
    if (view.visible) {
      expect(text(view.others)).toContain("lower-risk");
      expect(text(view.others)).toContain("not a guarantee");
      expect(view.others.text.toLowerCase()).not.toContain("safe");
    }
  });

  test("no reason sentence calls any day safe", () => {
    for (const reason of ["not-enough-cycles", "irregular", "paused", "disabled", "no-data", "late", "ok"] as const) {
      const view = safeDaysView({ kind: null, fertile: null, cycleDays: null, reason }, formatDate, identity);
      if (!view.visible) expect(view.reason.text.toLowerCase()).not.toContain("safe");
    }
  });

  test("every non-ok reason has a sentence", () => {
    for (const reason of ["not-enough-cycles", "irregular", "paused", "disabled", "no-data", "late", "ok"] as const) {
      const view = safeDaysView({ kind: null, fertile: null, cycleDays: null, reason }, formatDate, identity);
      expect(view.visible).toBe(false);
    }
  });
});
