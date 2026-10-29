import { describe, test, expect } from "bun:test";
import {
  MAX_OCCURRENCES_PER_SERIES,
  applyEdit,
  changeRule,
  createSeries,
  extendSeries,
  keepUntilValid,
  occurrenceDates,
  removeScope,
} from "./recurrence";
import type { Task } from "./planner";
import { taskSchema } from "./task-storage";

// 2026-03-02 is a Monday.
const TODAY = "2026-03-02";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "Stretch", date: TODAY, start: "09:30", duration: 30, status: "todo",
    category: "Wellness", notes: "n", createdAt: "2026-03-01T00:00:00.000Z", ...overrides,
  };
}
const idGen = (...ids: string[]) => { let i = 0; return () => ids[i++] ?? `gen-${i++}`; };
const dates = (list: Task[]) => list.map(t => t.date);
const allValid = (list: Task[]) => list.length > 0 && list.every(t => taskSchema.safeParse(t).success);

describe("monthly rule: dates", () => {
  test("keeps the anchor day-of-month, clamped to the last day of shorter months", () => {
    expect(occurrenceDates("monthly", "2026-01-31", "2026-05-31")).toEqual(
      ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"],
    );
    expect(occurrenceDates("monthly", "2026-01-30", "2026-03-31")).toEqual(["2026-01-30", "2026-02-28", "2026-03-30"]);
  });

  test("clamps to the 29th in a leap year and the 28th otherwise (century rule included)", () => {
    expect(occurrenceDates("monthly", "2028-01-31", "2028-03-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(occurrenceDates("monthly", "2028-01-29", "2028-03-29")).toEqual(["2028-01-29", "2028-02-29", "2028-03-29"]);
    expect(occurrenceDates("monthly", "2027-01-29", "2027-03-29")).toEqual(["2027-01-29", "2027-02-28", "2027-03-29"]);
    expect(occurrenceDates("monthly", "2100-01-31", "2100-02-28")).toEqual(["2100-01-31", "2100-02-28"]);
  });

  test("a leap-day anchor lands on Feb 28 in common years", () => {
    expect(occurrenceDates("monthly", "2028-02-29", "2028-04-30")).toEqual(["2028-02-29", "2028-03-29", "2028-04-29"]);
    expect(occurrenceDates("monthly", "2028-02-29", "2029-03-31", 14).at(-2)).toBe("2029-02-28");
  });

  test("is inclusive on both ends and crosses year boundaries", () => {
    expect(occurrenceDates("monthly", "2026-11-15", "2027-01-15")).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(occurrenceDates("monthly", "2026-11-15", "2026-12-14")).toEqual(["2026-11-15"]);
    expect(occurrenceDates("monthly", "2026-03-02", "2026-03-01")).toEqual([]);
  });

  test("respects the limit and an explicit anchor day (first month before the start is skipped)", () => {
    expect(occurrenceDates("monthly", "2026-01-10", "2026-12-31", 3)).toHaveLength(3);
    expect(occurrenceDates("monthly", "2026-02-28", "2026-04-30", Infinity, 31)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrenceDates("monthly", "2026-03-10", "2026-05-31", Infinity, 5)).toEqual(["2026-04-05", "2026-05-05"]);
    expect(occurrenceDates("monthly", "2026-03-10", "2026-05-31", 0)).toEqual([]);
  });
});

describe("monthly rule: series", () => {
  test("createSeries anchors on the first occurrence: Jan 31 -> Feb 28 -> Mar 31", () => {
    const rows = createSeries(task({ date: "2026-01-31" }), "monthly", "2026-01-31", idGen("M"), 12);
    expect(dates(rows)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(rows.map(t => t.id)).toEqual(["M:2026-01-31", "M:2026-02-28", "M:2026-03-31"]);
    expect(rows.every(t => t.repeat === "monthly")).toBe(true);
    expect(allValid(rows)).toBe(true);
  });

  test("extendSeries never drifts to the clamped day (31 -> 28 -> 31 -> 30 -> 31 -> 30)", () => {
    const first = createSeries(task({ date: "2026-01-31" }), "monthly", "2026-01-31", idGen("M"), 4);
    expect(dates(first)).toEqual(["2026-01-31", "2026-02-28"]);
    const second = extendSeries(first, "2026-02-28");
    expect(dates(second)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    const third = extendSeries(second, "2026-03-31");
    expect(dates(third)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(dates(extendSeries(third, "2026-05-10"))).toEqual(
      ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"],
    );
  });

  test("extendSeries keeps a clamped-only history on its own day", () => {
    const clamped = [task({ id: "M:2026-02-28", date: "2026-02-28", seriesId: "M", repeat: "monthly" })];
    expect(dates(extendSeries(clamped, "2026-02-28"))).toEqual(["2026-02-28", "2026-03-28"]);
  });

  test("a dragged occurrence does not re-anchor the series", () => {
    const rows = createSeries(task({ date: "2026-01-15" }), "monthly", "2026-01-15", idGen("M"), 13);
    const dragged = rows.map(t => (t.date === "2026-03-15" ? { ...t, id: "M:moved", date: "2026-03-20" } : t));
    const result = dates(extendSeries(dragged, "2026-04-20"));
    expect(result).toContain("2026-05-15");
    expect(result).not.toContain("2026-05-20");
  });

  test("changeRule weekly -> monthly keeps a later row that still fires (clamped) and adds the missing ones", () => {
    const weekly = createSeries(task({ date: "2026-01-31" }), "weekly", "2026-01-31", idGen("W"), 12);
    const result = changeRule(weekly, weekly[0], "monthly", "2026-01-31", idGen("x"), 12);
    expect(dates(result)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(result.every(t => t.repeat === "monthly")).toBe(true);
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
  });

  test("a monthly series edited on a clamped occurrence keeps its 31st anchor", () => {
    const rows = createSeries(task({ date: "2026-01-31" }), "monthly", "2026-01-31", idGen("M"), 12);
    const result = changeRule(rows, rows[1], "monthly", "2026-02-28", idGen("x"), 12, "2026-04-15");
    expect(dates(result)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(result.find(t => t.date === "2026-03-31")?.repeatUntil).toBe("2026-04-15");
    expect(result.find(t => t.date === "2026-01-31")?.repeatUntil).toBeUndefined();
  });
});

describe("repeatUntil", () => {
  const until = "2026-03-16";
  const capped = () => createSeries(task({ repeatUntil: until }), "daily", TODAY, idGen("U"));
  const uncapped = () => createSeries(task(), "daily", TODAY, idGen("U"));

  test("createSeries stops at the end date (inclusive) and every occurrence carries it", () => {
    const rows = capped();
    expect(dates(rows).at(-1)).toBe(until);
    expect(rows).toHaveLength(15);
    expect(rows.every(t => t.repeatUntil === until)).toBe(true);
  });

  test("an end date equal to the first date yields one row; weekdays and monthly respect it too", () => {
    expect(dates(createSeries(task({ repeatUntil: TODAY }), "daily", TODAY, idGen("U")))).toEqual([TODAY]);
    expect(dates(createSeries(task({ repeatUntil: "2026-03-10" }), "weekdays", TODAY, idGen("U")))).toEqual(
      ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09", "2026-03-10"],
    );
    const monthly = createSeries(task({ date: "2026-01-31", repeatUntil: "2026-03-30" }), "monthly", "2026-01-31", idGen("U"), 12);
    expect(dates(monthly)).toEqual(["2026-01-31", "2026-02-28"]);
  });

  test("the 120 future-occurrence cap still applies below a far end date", () => {
    const rows = createSeries(task({ repeatUntil: "2030-01-01" }), "daily", TODAY, idGen("U"), 100);
    expect(rows).toHaveLength(MAX_OCCURRENCES_PER_SERIES);
  });

  test("extendSeries never generates beyond the end date and stays idempotent", () => {
    const rows = capped();
    const result = extendSeries(rows, "2026-03-30");
    expect(result).toEqual(rows);
    expect(extendSeries(result, "2026-06-01")).toEqual(rows);
  });

  test("extendSeries fills up to an end date that lies beyond the current rows", () => {
    const short = createSeries(task({ repeatUntil: "2026-05-04" }), "weekly", TODAY, idGen("U"), 1);
    const result = extendSeries(short, "2026-04-01");
    expect(dates(result).at(-1)).toBe("2026-05-04");
    expect(result.every(t => t.repeatUntil === "2026-05-04")).toBe(true);
  });

  test("an end date already in the past adds nothing", () => {
    const rows = createSeries(task({ date: "2026-01-05", repeatUntil: "2026-01-12" }), "daily", "2026-01-05", idGen("U"), 4);
    expect(dates(rows).at(-1)).toBe("2026-01-12");
    expect(extendSeries(rows, TODAY)).toEqual(rows);
  });

  test("new rows follow the latest occurrence's end date even if the template row has another", () => {
    const rows = uncapped();
    const mixed = rows.map(t => (t.date === "2026-04-27" ? { ...t, repeatUntil: "2026-05-04" } : t));
    const result = extendSeries(mixed, "2026-04-20");
    expect(dates(result).at(-1)).toBe("2026-05-04");
    expect(result.slice(rows.length).every(t => t.repeatUntil === "2026-05-04")).toBe(true);
  });

  test("clearing the end date resumes extension", () => {
    const rows = capped();
    const cleared = changeRule(rows, rows[3], "daily", TODAY, idGen("x"), 8, null);
    expect(dates(cleared).at(-1)).toBe("2026-04-27");
    const laterRows = cleared.filter(t => t.date! > "2026-03-05");
    expect(laterRows.length).toBeGreaterThan(0);
    expect(laterRows.every(t => (t.repeatUntil ?? null) === null)).toBe(true);
    expect(dates(extendSeries(cleared, "2026-04-20")).at(-1)).toBe("2026-06-15");
  });

  test("shortening the end date removes later occurrences and stamps the rest", () => {
    const rows = uncapped();
    const result = changeRule(rows, rows[3], "daily", TODAY, idGen("x"), 8, "2026-03-10");
    expect(dates(result).at(-1)).toBe("2026-03-10");
    expect(result).toHaveLength(9);
    expect(result.slice(3).every(t => t.repeatUntil === "2026-03-10")).toBe(true);
    expect(result.slice(0, 3).every(t => t.repeatUntil === undefined)).toBe(true);
    expect(allValid(result)).toBe(true);
  });

  test("an end date equal to the edited occurrence's date removes everything after it", () => {
    const rows = uncapped();
    expect(dates(changeRule(rows, rows[3], "daily", TODAY, idGen("x"), 8, "2026-03-05")).at(-1)).toBe("2026-03-05");
  });

  test("surviving later occurrences keep their status", () => {
    const rows = uncapped().map(t => (t.date === "2026-03-06" ? { ...t, status: "done" as const } : t));
    const result = changeRule(rows, rows[0], "daily", TODAY, idGen("x"), 8, "2026-03-10");
    expect(result.find(t => t.date === "2026-03-06")).toMatchObject({ status: "done", repeatUntil: "2026-03-10" });
  });

  test("extending the end date adds the missing occurrences from today on", () => {
    const rows = capped();
    const result = changeRule(rows, rows[0], "daily", TODAY, idGen("x"), 8, "2026-03-25");
    expect(dates(result).at(-1)).toBe("2026-03-25");
    expect(result).toHaveLength(24);
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
  });

  test("omitting the end date argument keeps the edited occurrence's end date", () => {
    const rows = capped();
    const result = changeRule(rows, rows[2], "weekly", TODAY, idGen("x"));
    expect(dates(result)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-11"]);
    expect(result.every(t => t.repeatUntil === until)).toBe(true);
  });

  test("a plain task gains a series with an end date", () => {
    const plain = task({ id: "plain" });
    const result = changeRule([plain], plain, "weekly", TODAY, idGen("N"), 8, "2026-03-23");
    expect(dates(result)).toEqual([TODAY, "2026-03-09", "2026-03-16", "2026-03-23"]);
    expect(result.every(t => t.repeatUntil === "2026-03-23")).toBe(true);
    expect(allValid(result)).toBe(true);
  });

  test("ending the series (rule null) clears the end date on every remaining row", () => {
    const rows = capped();
    const result = changeRule(rows, rows[3], null, TODAY, idGen("x"));
    expect(result).toHaveLength(4);
    expect(result.every(t => t.repeatUntil === null)).toBe(true);
    expect(allValid(result)).toBe(true);
  });

  test("deleting 'following' detaches the earlier rows and clears their end date", () => {
    const result = removeScope(capped(), capped()[3], "following");
    expect(result.every(t => t.repeat === null && t.repeatUntil === null)).toBe(true);
    expect(allValid(result)).toBe(true);
  });

  test("moving an occurrence past the end date lifts its end date to its new date", () => {
    const rows = capped();
    const moved = applyEdit(rows, rows[2], { date: "2026-03-20" }, "this");
    const row = moved.find(t => t.id === rows[2].id)!;
    expect(row).toMatchObject({ date: "2026-03-20", repeatUntil: "2026-03-20" });
    expect(taskSchema.safeParse(row).success).toBe(true);
    expect(extendSeries(moved, "2026-03-30")).toEqual(moved);
  });

  test("moving an occurrence within the end date leaves it alone", () => {
    const rows = capped();
    const moved = applyEdit(rows, rows[2], { date: "2026-03-10" }, "this");
    expect(moved.find(t => t.id === rows[2].id)?.repeatUntil).toBe(until);
  });

  test("keepUntilValid only touches tasks whose date passed the end date", () => {
    const fine = task({ seriesId: "S", repeat: "daily", repeatUntil: TODAY });
    expect(keepUntilValid(fine)).toBe(fine);
    expect(keepUntilValid(task())).toEqual(task());
    expect(keepUntilValid(task({ date: null, start: null, repeatUntil: "2026-01-01" }))).toEqual(task({ date: null, start: null, repeatUntil: "2026-01-01" }));
    expect(keepUntilValid({ ...fine, date: "2026-03-09" }).repeatUntil).toBe("2026-03-09");
  });

  test("does not mutate its input", () => {
    const rows = capped();
    const copy = structuredClone(rows);
    changeRule(rows, rows[3], "daily", TODAY, idGen("x"), 8, "2026-03-10");
    changeRule(rows, rows[3], "monthly", TODAY, idGen("x"), 8, null);
    extendSeries(rows, "2026-03-30");
    expect(rows).toEqual(copy);
  });
});

describe("repeatUntil guards", () => {
  test("changeRule refuses an end date before the edited occurrence's date", () => {
    const rows = createSeries(task(), "daily", TODAY, idGen("G"));
    expect(() => changeRule(rows, rows[3], "daily", TODAY, idGen("x"), 8, "2026-03-04")).toThrow(/end date/);
  });

  test("moving a series row to the backlog detaches it and drops its end date", () => {
    const rows = createSeries(task({ repeatUntil: "2026-03-16" }), "daily", TODAY, idGen("G"));
    const moved = applyEdit(rows, rows[2], { date: null, start: null }, "this");
    expect(moved[2]).toMatchObject({ date: null, seriesId: null, repeat: null, repeatUntil: null });
    expect(allValid(moved)).toBe(true);
  });
});
