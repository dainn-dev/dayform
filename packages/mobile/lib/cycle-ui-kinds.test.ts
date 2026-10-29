import { describe, expect, test } from "bun:test";
import type { CalendarDay, CalendarKind } from "./cycle-calendar";
import { KIND_META, dayLabel, legendKinds, markLabel, timelineKind, withMarkLabel } from "./cycle-ui-kinds";

const identity = (text: string) => text;
const mark = (text: string) => `~${text}`;
const day = (kind: CalendarKind, inMonth = true): CalendarDay => ({ date: "2026-03-03", inMonth, isToday: false, kind, logged: kind === "period" });

describe("kind metadata", () => {
  test("every kind has its own shape and palette group", () => {
    const metas = Object.values(KIND_META);
    expect(new Set(metas.map(meta => meta.shape)).size).toBe(metas.length);
    expect(new Set(metas.map(meta => meta.group)).size).toBe(metas.length);
  });
});

describe("legendKinds", () => {
  test("always lists the period and only the other kinds that appear in the month", () => {
    expect(legendKinds([[day("none")]])).toEqual(["period"]);
    expect(legendKinds([[day("fertile"), day("predicted-period")]])).toEqual(["period", "predicted-period", "fertile"]);
  });

  test("ignores days outside the shown month", () => {
    expect(legendKinds([[day("safe-estimate", false)]])).toEqual(["period"]);
  });

  test("lists safe days only when the grid shows them", () => {
    expect(legendKinds([[day("safe-estimate")]])).toContain("safe-estimate");
  });
});

describe("dayLabel", () => {
  test("names the date, today and the kind", () => {
    expect(dayLabel(identity, "Tuesday 3 March", "period", false)).toBe("Tuesday 3 March, Period");
    expect(dayLabel(identity, "Tuesday 3 March", "fertile", true)).toBe("Tuesday 3 March, today, Fertile days (estimate)");
    expect(dayLabel(identity, "Tuesday 3 March", "none", true)).toBe("Tuesday 3 March, today");
    expect(dayLabel(identity, "Tuesday 3 March", "none", false)).toBe("Tuesday 3 March");
  });

  test("translates the template and the kind separately", () => {
    expect(dayLabel(mark, "D", "period", false)).toBe("~D, ~Period");
  });
});

describe("Timeline marks", () => {
  test("the safe-days estimate is never shown on the Timeline", () => {
    expect(timelineKind("safe-estimate")).toBe("none");
    expect(timelineKind("period")).toBe("period");
    expect(timelineKind("fertile")).toBe("fertile");
    expect(timelineKind("predicted-period")).toBe("predicted-period");
  });

  test("labels", () => {
    expect(markLabel(identity, "period")).toBe("Cycle: Period");
    expect(withMarkLabel(identity, "Tuesday", "period")).toBe("Tuesday. Cycle: Period");
    expect(withMarkLabel(identity, "Tuesday", "none")).toBe("Tuesday");
  });
});
