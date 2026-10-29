import { describe, test, expect } from "bun:test";
import {
  MAX_OCCURRENCES_PER_SERIES,
  applyEdit,
  changeRule,
  createSeries,
  extendSeries,
  occurrenceDates,
  removeScope,
  scopeTargets,
} from "./recurrence";
import { addDays, fromKey, type Task } from "./planner";
import { taskSchema } from "./task-storage";

// 2026-03-02 is a Monday, 2026-03-07 a Saturday, 2028-02-29 a Tuesday (leap day).
const TODAY = "2026-03-02";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "Stretch", date: TODAY, start: "09:30", duration: 30, status: "todo",
    category: "Wellness", notes: "n", createdAt: "2026-03-01T00:00:00.000Z", ...overrides,
  };
}
const idGen = (...ids: string[]) => { let i = 0; return () => ids[i++] ?? `gen-${i++}`; };
const dates = (list: Task[]) => list.map(t => t.date);
const weekday = (key: string) => fromKey(key).getDay();
const isWeekend = (key: string) => [0, 6].includes(weekday(key));
const series = (rule: "daily" | "weekdays" | "weekly" = "daily", date = TODAY, id = "S") =>
  createSeries(task({ date }), rule, TODAY, idGen(id));

/** `count` daily rows of series "P", ending the day before TODAY (all in the past). */
function pastRows(count: number): Task[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(TODAY, i - count);
    return task({ id: `P:${date}`, date, seriesId: "P", repeat: "daily" });
  });
}

describe("occurrenceDates", () => {
  test("daily is inclusive on both ends", () => {
    expect(occurrenceDates("daily", "2026-03-02", "2026-03-04")).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
    expect(occurrenceDates("daily", "2026-03-02", "2026-03-02")).toEqual(["2026-03-02"]);
  });

  test("returns nothing when the end is before the start", () => {
    expect(occurrenceDates("daily", "2026-03-02", "2026-03-01")).toEqual([]);
  });

  test("crosses month and year boundaries", () => {
    expect(occurrenceDates("daily", "2026-01-30", "2026-02-02")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
    expect(occurrenceDates("daily", "2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  test("handles leap day and non-leap February", () => {
    expect(occurrenceDates("daily", "2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(occurrenceDates("daily", "2027-02-28", "2027-03-01")).toEqual(["2027-02-28", "2027-03-01"]);
  });

  test("weekdays skips Saturday and Sunday", () => {
    expect(occurrenceDates("weekdays", "2026-03-06", "2026-03-10")).toEqual(["2026-03-06", "2026-03-09", "2026-03-10"]);
  });

  test("weekdays starting on a weekend yields only later weekdays (start itself excluded)", () => {
    expect(occurrenceDates("weekdays", "2026-03-07", "2026-03-10")).toEqual(["2026-03-09", "2026-03-10"]);
    expect(occurrenceDates("weekdays", "2026-03-08", "2026-03-09")).toEqual(["2026-03-09"]);
  });

  test("weekly keeps the weekday of the start date across month, year and leap day", () => {
    expect(occurrenceDates("weekly", "2026-12-28", "2027-01-18")).toEqual(["2026-12-28", "2027-01-04", "2027-01-11", "2027-01-18"]);
    expect(occurrenceDates("weekly", "2028-02-22", "2028-03-07")).toEqual(["2028-02-22", "2028-02-29", "2028-03-07"]);
    for (const d of occurrenceDates("weekly", "2026-03-04", "2026-09-01")) expect(weekday(d)).toBe(weekday("2026-03-04"));
  });

  test("respects the optional limit", () => {
    expect(occurrenceDates("daily", "2026-03-02", "2026-12-31", 3)).toHaveLength(3);
  });

  test("an unknown rule fails loudly instead of acting like daily", () => {
    expect(() => occurrenceDates("monthly" as never, "2026-03-02", "2026-03-09")).toThrow(/monthly/);
  });

  test("throws on malformed or impossible dates", () => {
    expect(() => occurrenceDates("daily", "03/02/2026", "2026-03-04")).toThrow("Invalid");
    expect(() => occurrenceDates("daily", "2026-03-02", "2026-02-31")).toThrow("Invalid");
  });
});

describe("createSeries", () => {
  test("throws a clear error when the template has no date", () => {
    expect(() => createSeries(task({ date: null, start: null }), "daily", TODAY, idGen("S"))).toThrow(/date/);
  });

  test("daily covers the template date through today + 8 weeks inclusive", () => {
    const result = series("daily");
    expect(result).toHaveLength(57);
    expect(result[0].date).toBe(TODAY);
    expect(result.at(-1)?.date).toBe("2026-04-27");
  });

  test("weekly and weekdays horizon lengths", () => {
    expect(series("weekly")).toHaveLength(9);
    const weekdays = series("weekdays");
    expect(weekdays).toHaveLength(41);
    expect(weekdays.length).toBeGreaterThan(0);
    expect(weekdays.every(t => ![0, 6].includes(weekday(t.date!)))).toBe(true);
  });

  test("weekly keeps the template weekday", () => {
    const result = series("weekly", "2026-03-04");
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) expect(weekday(t.date!)).toBe(3);
  });

  test("weekdays template on a Saturday keeps that first occurrence, then continues on Mondays-Fridays", () => {
    const result = series("weekdays", "2026-03-07");
    expect(dates(result).slice(0, 4)).toEqual(["2026-03-07", "2026-03-09", "2026-03-10", "2026-03-11"]);
  });

  test("ids are deterministic, unique and every record validates against the store schema", () => {
    const result = series("daily", TODAY, "abc");
    expect(result[0].id).toBe("abc:2026-03-02");
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(t => t.id === `abc:${t.date}` && t.seriesId === "abc" && t.repeat === "daily")).toBe(true);
    expect(result.every(t => taskSchema.safeParse(t).success)).toBe(true);
    expect(series("daily", TODAY, "abc")).toEqual(result);
  });

  test("copies content; only the first occurrence keeps the template status", () => {
    const result = createSeries(task({ status: "done", remind: 10, notes: "x", category: "Work", duration: 20 }), "weekly", TODAY, idGen("S"));
    expect(result[0].status).toBe("done");
    expect(result.slice(1).length).toBeGreaterThan(0);
    expect(result.slice(1).every(t => t.status === "todo")).toBe(true);
    for (const t of result) {
      expect(t).toMatchObject({ title: "Stretch", start: "09:30", duration: 20, category: "Work", notes: "x", remind: 10 });
    }
  });

  test("calls newSeriesId exactly once", () => {
    let calls = 0;
    createSeries(task(), "daily", TODAY, () => `s${++calls}`);
    expect(calls).toBe(1);
  });

  test("a template after the horizon yields only itself; a past template still reaches the horizon", () => {
    expect(dates(series("daily", "2027-01-01"))).toEqual(["2027-01-01"]);
    const past = createSeries(task({ date: "2026-02-20" }), "weekly", TODAY, idGen("S"));
    expect(past[0].date).toBe("2026-02-20");
    expect(past.at(-1)?.date).toBe("2026-04-24");
  });

  test("honours horizonWeeks and never exceeds MAX_OCCURRENCES_PER_SERIES", () => {
    expect(createSeries(task(), "daily", TODAY, idGen("S"), 2)).toHaveLength(15);
    expect(MAX_OCCURRENCES_PER_SERIES).toBe(120);
    expect(createSeries(task(), "daily", TODAY, idGen("S"), 100)).toHaveLength(120);
    expect(createSeries(task({ date: "2026-03-07" }), "weekdays", TODAY, idGen("S"), 100)).toHaveLength(120);
  });

  test("the cap applies to today-or-later rows; past backfill is bounded separately", () => {
    const result = createSeries(task({ date: "2025-01-01" }), "daily", TODAY, idGen("S"), 100);
    const future = result.filter(t => t.date! >= TODAY);
    expect(future).toHaveLength(MAX_OCCURRENCES_PER_SERIES);
    expect(result.filter(t => t.date! < TODAY).length).toBeLessThanOrEqual(MAX_OCCURRENCES_PER_SERIES);
    expect(result[0].date).toBe("2025-01-01");
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
  });

  test("a far-past weekly template backfills on its weekday and reaches the horizon", () => {
    const result = createSeries(task({ date: "2026-02-20" }), "weekly", "2026-06-01", idGen("S"));
    expect(result.every(t => weekday(t.date!) === 5)).toBe(true);
    expect(result.at(-1)?.date).toBe("2026-07-24");
    expect(result.filter(t => t.date! >= "2026-06-01")).toHaveLength(8);
  });

  test("does not mutate the template", () => {
    const template = task();
    const copy = structuredClone(template);
    createSeries(template, "daily", TODAY, idGen("S"));
    expect(template).toEqual(copy);
  });
});

describe("extendSeries", () => {
  const later = "2026-03-30";

  test("appends occurrences after the latest one up to the new horizon", () => {
    const base = series("daily");
    const result = extendSeries(base, later);
    expect(result).toHaveLength(base.length + 28);
    expect(result.at(-1)?.date).toBe("2026-05-25");
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
    expect(result.slice(0, base.length)).toEqual(base);
  });

  test("is idempotent and returns a new array even when nothing is added", () => {
    const once = extendSeries(series("weekdays"), later);
    const twice = extendSeries(once, later);
    expect(twice).toEqual(once);
    expect(twice).not.toBe(once);
  });

  test("never fills gaps: a deleted middle occurrence stays deleted", () => {
    const base = series("daily").filter(t => t.date !== "2026-03-10");
    const result = extendSeries(base, later);
    expect(dates(result)).not.toContain("2026-03-10");
  });

  test("known limitation: deleting the LAST occurrence lets it be regenerated", () => {
    const base = series("daily");
    const last = base.at(-1)!;
    const result = extendSeries(base.slice(0, -1), TODAY);
    expect(result.at(-1)?.id).toBe(last.id);
  });

  test("new occurrences copy the latest occurrence's content, with status todo", () => {
    const base = series("weekly").map((t, i, all) => (i === all.length - 1 ? { ...t, title: "Edited", status: "done" as const, remind: 5 } : t));
    const added = extendSeries(base, later).slice(base.length);
    expect(added.length).toBeGreaterThan(0);
    for (const t of added) expect(t).toMatchObject({ title: "Edited", status: "todo", remind: 5, seriesId: "S", repeat: "weekly" });
  });

  test("weekly continues on the latest occurrence's weekday", () => {
    const result = extendSeries(series("weekly", "2026-03-04"), later);
    expect(result.length).toBeGreaterThan(9);
    for (const t of result) expect(weekday(t.date!)).toBe(3);
  });

  test("extends each series independently and leaves plain tasks alone", () => {
    const plain = task({ id: "plain", date: "2026-03-03" });
    const noDate = task({ id: "backlog", date: null, start: null });
    const a = createSeries(task({ id: "a" }), "weekly", TODAY, idGen("A"));
    const b = createSeries(task({ id: "b", title: "Other" }), "daily", TODAY, idGen("B"), 1);
    const result = extendSeries([plain, noDate, ...a, ...b], TODAY);
    expect(result).toContain(plain);
    expect(result).toContain(noDate);
    expect(result.filter(t => t.seriesId === "A")).toHaveLength(9);
    expect(result.filter(t => t.seriesId === "B")).toHaveLength(57);
  });

  test("does not extend a series that already has the maximum number of future occurrences", () => {
    const full = createSeries(task(), "daily", TODAY, idGen("S"), 100);
    expect(extendSeries(full, TODAY, 100)).toHaveLength(120);
    const nearFull = full.slice(0, 118);
    expect(extendSeries(nearFull, TODAY, 100)).toHaveLength(120);
  });

  test("the cap counts only today-or-later rows: a series with 150 past rows still extends", () => {
    const past = pastRows(150);
    expect(past.length).toBe(150);
    const result = extendSeries(past, TODAY);
    const added = result.slice(past.length);
    expect(added).toHaveLength(57);
    expect(added[0].date).toBe(TODAY);
    expect(added.at(-1)?.date).toBe("2026-04-27");
  });

  test("room is the cap minus the rows dated today or later; past rows reduce nothing", () => {
    const rows = [...pastRows(150), ...createSeries(task(), "daily", TODAY, idGen("P"), 100).slice(0, 100)];
    const result = extendSeries(rows, TODAY, 100);
    expect(result.length).toBe(rows.length + 20);
    expect(result.filter(t => t.date! >= TODAY)).toHaveLength(MAX_OCCURRENCES_PER_SERIES);
  });

  test("after a long absence no past-dated occurrence is generated", () => {
    const base = series("daily");
    const away = "2026-09-01";
    const added = extendSeries(base, away).slice(base.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].date).toBe(away);
    expect(added.every(t => t.date! >= away && t.status === "todo")).toBe(true);
    expect(added.at(-1)?.date).toBe("2026-10-27");
  });

  test("long absence keeps the weekly weekday and the weekdays rule", () => {
    const away = "2026-09-01";
    const weekly = extendSeries(series("weekly"), away).slice(9);
    expect(weekly.length).toBeGreaterThan(0);
    expect(weekly.every(t => weekday(t.date!) === 1 && t.date! >= away)).toBe(true);
    const weekdays = extendSeries(series("weekdays"), away).slice(41);
    expect(weekdays.length).toBeGreaterThan(0);
    expect(weekdays.every(t => !isWeekend(t.date!) && t.date! >= away)).toBe(true);
  });

  test("a weekly series does not re-anchor to the weekday its latest occurrence was dragged to", () => {
    const base = series("weekly")
      .map(t => (t.date === "2026-04-20" ? { ...t, title: "Template" } : t))
      .map(t => (t.date === "2026-04-27" ? { ...t, date: "2026-04-29", title: "Dragged" } : t));
    const added = extendSeries(base, "2026-04-28").slice(base.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].date).toBe("2026-05-04");
    expect(added.every(t => weekday(t.date!) === 1 && t.title === "Template" && t.status === "todo")).toBe(true);
  });

  test("falls back to the latest occurrence when none matches the rule", () => {
    const lone = createSeries(task({ date: "2026-03-07", title: "Sat" }), "weekdays", TODAY, idGen("S"), 0);
    expect(lone).toHaveLength(1);
    const added = extendSeries(lone, TODAY).slice(1);
    expect(added[0].date).toBe("2026-03-09");
    expect(added.every(t => t.title === "Sat" && !isWeekend(t.date!))).toBe(true);
  });

  test("the weekly weekday is the majority weekday of the series; ties go to the earliest", () => {
    const moved = series("weekly").map((t, i) => (i === 1 ? { ...t, date: "2026-03-11" } : t));
    const added = extendSeries(moved, "2026-04-28").slice(moved.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(t => weekday(t.date!) === 1)).toBe(true);
    const tied = extendSeries([moved[0], moved[1]], "2026-03-12").slice(2);
    expect(tied.length).toBeGreaterThan(0);
    expect(tied.every(t => weekday(t.date!) === 1)).toBe(true);
  });

  test("only the rule of the latest occurrence decides the weekly weekday", () => {
    const oldDaily = series("daily").slice(0, 5);
    const weeklyTail = series("weekly", "2026-03-09").map(t => ({ ...t, id: t.id.replace("S:", "S:w") }));
    const added = extendSeries([...oldDaily, ...weeklyTail], "2026-05-05").slice(oldDaily.length + weeklyTail.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(t => t.repeat === "weekly" && weekday(t.date!) === 1)).toBe(true);
  });

  test("skips a date whose deterministic id is already taken by a moved occurrence", () => {
    const base = series("daily", TODAY, "S");
    const taken = [...base.slice(0, -1), { ...base.at(-1)!, id: "S:2026-04-28" }];
    const result = extendSeries(taken, TODAY);
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
    expect(dates(result)).not.toContain("2026-04-28");
  });

  test("handles an empty list and does not mutate its input", () => {
    expect(extendSeries([], TODAY)).toEqual([]);
    const base = series("daily");
    const copy = structuredClone(base);
    extendSeries(base, later);
    extendSeries(base, "2027-01-01");
    expect(base).toEqual(copy);
  });
});

describe("scopeTargets", () => {
  const all = [...series("daily", TODAY, "S"), task({ id: "plain" })];
  const middle = all[10];

  test("this returns only that occurrence", () => {
    expect(scopeTargets(all, middle, "this").map(t => t.id)).toEqual([middle.id]);
  });

  test("following returns the same series from that date on", () => {
    const targets = scopeTargets(all, middle, "following");
    expect(targets).toHaveLength(57 - 10);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(t => t.seriesId === "S" && t.date! >= middle.date!)).toBe(true);
  });

  test("all returns the whole series and nothing else", () => {
    expect(scopeTargets(all, middle, "all")).toHaveLength(57);
  });

  test("a non-series task is always its own single target", () => {
    const plain = all.at(-1)!;
    for (const scope of ["this", "following", "all"] as const) expect(scopeTargets(all, plain, scope)).toEqual([plain]);
  });
});

describe("applyEdit", () => {
  const base = series("daily", TODAY, "S");
  const target = base[5];

  test("this applies the whole patch including date, start and status to one occurrence", () => {
    const result = applyEdit(base, target, { title: "Solo", date: "2026-03-20", start: "10:00", status: "done" }, "this");
    const changed = result.filter((t, i) => t !== base[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ id: target.id, title: "Solo", date: "2026-03-20", start: "10:00", status: "done", seriesId: "S" });
  });

  test("this never changes the id", () => {
    expect(applyEdit(base, target, { id: "hacked" }, "this").some(t => t.id === "hacked")).toBe(false);
  });

  test("following changes content fields only, never date, status, id or createdAt", () => {
    const patch = { title: "New", start: "11:00", duration: 50, category: "Work" as const, notes: "z", remind: 15,
      date: "2030-01-01", status: "done" as const, id: "x", createdAt: "nope" };
    const result = applyEdit(base, target, patch, "following");
    expect(result).toHaveLength(base.length);
    result.forEach((t, i) => {
      const before = base[i];
      expect({ id: t.id, date: t.date, status: t.status, createdAt: t.createdAt })
        .toEqual({ id: before.id, date: before.date, status: before.status, createdAt: before.createdAt });
    });
    const edited = result.slice(5);
    expect(edited.length).toBeGreaterThan(0);
    for (const t of edited) expect(t).toMatchObject({ title: "New", start: "11:00", duration: 50, category: "Work", notes: "z", remind: 15 });
    result.slice(0, 5).forEach((t, i) => expect(t).toBe(base[i]));
  });

  test("all edits every occurrence, earlier ones included", () => {
    const result = applyEdit(base, target, { title: "Everything", status: "done" }, "all");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(t => t.title === "Everything")).toBe(true);
    expect(result.every((t, i) => t.status === base[i].status)).toBe(true);
  });

  test("clearing remind with null applies and undefined patch values are ignored", () => {
    const withRemind = applyEdit(base, target, { remind: 10 }, "all");
    const cleared = applyEdit(withRemind, target, { remind: null, title: undefined }, "all");
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared.every(t => t.remind === null && t.title === "Stretch")).toBe(true);
  });

  test("a non-series task is edited as this, whatever the scope", () => {
    const list = [task({ id: "a" }), task({ id: "b" })];
    const result = applyEdit(list, list[0], { title: "T", date: "2026-04-01", status: "done" }, "all");
    expect(result[0]).toMatchObject({ title: "T", date: "2026-04-01", status: "done" });
    expect(result[1]).toBe(list[1]);
  });

  test("moving an occurrence to the backlog detaches it from the series", () => {
    const [moved] = applyEdit(base, base[0], { date: null, start: null }, "this");
    expect(moved).toMatchObject({ date: null, start: null, seriesId: null, repeat: null });
    expect(taskSchema.safeParse(moved).success).toBe(true);
  });

  test("clearing start clears a reminder so the record stays valid", () => {
    const [edited] = applyEdit([task({ remind: 5 })], task(), { date: null, start: null }, "this");
    expect(edited.remind).toBeNull();
    expect(taskSchema.safeParse(edited).success).toBe(true);
  });

  test("does not mutate its input", () => {
    const copy = structuredClone(base);
    applyEdit(base, target, { title: "X" }, "all");
    applyEdit(base, target, { date: "2026-05-01" }, "this");
    expect(base).toEqual(copy);
  });
});

describe("removeScope", () => {
  const plain = task({ id: "plain" });
  const base = [...series("daily", TODAY, "S"), plain];
  const target = base[10];

  test("this removes one occurrence", () => {
    const result = removeScope(base, target, "this");
    expect(result).toHaveLength(base.length - 1);
    expect(result.map(t => t.id)).not.toContain(target.id);
  });

  test("all removes the entire series but keeps other tasks", () => {
    expect(removeScope(base, target, "all")).toEqual([plain]);
  });

  test("following removes the series from that date and detaches earlier ones so they are not regenerated", () => {
    const result = removeScope(base, target, "following");
    const kept = result.filter(t => t.id !== "plain");
    expect(kept).toHaveLength(10);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every(t => t.seriesId === null && t.repeat === null)).toBe(true);
    expect(extendSeries(result, "2026-06-01")).toEqual(result);
  });

  test("a non-series task is removed as this", () => {
    expect(removeScope(base, plain, "all")).toHaveLength(base.length - 1);
  });

  test("does not mutate its input", () => {
    const copy = structuredClone(base);
    removeScope(base, target, "following");
    expect(base).toEqual(copy);
  });
});

describe("changeRule", () => {
  const base = series("weekly", TODAY, "S");
  const target = base[3];

  test("switches the following occurrences to the new rule under the same series id", () => {
    const result = changeRule(base, target, "daily", TODAY, idGen("unused"));
    const mine = result.filter(t => t.seriesId === "S");
    expect(dates(mine.slice(0, 4))).toEqual(dates(base.slice(0, 4)));
    expect(result.find(t => t.id === target.id)).toMatchObject({ repeat: "daily", seriesId: "S" });
    expect(mine.slice(4).length).toBeGreaterThan(0);
    expect(mine.slice(4).every(t => t.repeat === "daily" && t.id === `S:${t.date}`)).toBe(true);
    expect(dates(mine).sort().at(-1)).toBe("2026-04-27");
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
  });

  test("the edited task keeps its id, status and content; new occurrences are todo", () => {
    const done = base.map(t => (t.id === target.id ? { ...t, status: "done" as const, title: "Mine" } : t));
    const result = changeRule(done, done[3], "weekdays", TODAY, idGen("x"));
    expect(result.find(t => t.id === target.id)).toMatchObject({ status: "done", title: "Mine" });
    const created = result.filter(t => t.date! > target.date! && !done.some(d => d.id === t.id));
    expect(created.length).toBeGreaterThan(0);
    expect(created.every(t => t.status === "todo" && t.title === "Mine" && t.repeat === "weekdays")).toBe(true);
  });

  test("later occurrences still on the new rule keep their status and edits; only the rule is updated", () => {
    const edited = base.map(t => (t.date === "2026-04-06" ? { ...t, status: "done" as const, title: "Edited", notes: "mine" } : t));
    const result = changeRule(edited, edited[1], "weekdays", TODAY, idGen("x"));
    const kept = result.find(t => t.id === "S:2026-04-06");
    expect(kept).toMatchObject({ status: "done", title: "Edited", notes: "mine", repeat: "weekdays", seriesId: "S" });
    expect(result.filter(t => t.status === "done")).toHaveLength(1);
    expect(result.filter(t => t.date === "2026-04-06")).toHaveLength(1);
  });

  test("deletes only the dates the new rule no longer fires and adds only the missing ones", () => {
    const daily = series("daily", TODAY, "D").map(t =>
      t.date === "2026-03-04" ? { ...t, status: "done" as const } : t.date === "2026-03-07" ? { ...t, status: "done" as const, title: "Sat" } : t);
    const result = changeRule(daily, daily[0], "weekdays", TODAY, idGen("x"));
    const mine = result.filter(t => t.seriesId === "D");
    expect(mine.some(t => isWeekend(t.date!))).toBe(false);
    expect(mine.find(t => t.date === "2026-03-04")?.status).toBe("done");
    expect(mine).toHaveLength(41);
    const survivors = daily.filter(t => !isWeekend(t.date!));
    expect(survivors.length).toBeGreaterThan(0);
    for (const t of survivors) expect(result.find(r => r.id === t.id)).toMatchObject({ status: t.status, title: t.title });
  });

  test("daily to weekly keeps only later occurrences on the anchor weekday and adds none", () => {
    const daily = series("daily", TODAY, "D").map(t => (t.date === "2026-03-16" ? { ...t, status: "done" as const } : t));
    const result = changeRule(daily, daily[0], "weekly", TODAY, idGen("x"));
    expect(result).toHaveLength(9);
    expect(result.every(t => weekday(t.date!) === 1)).toBe(true);
    expect(result.find(t => t.date === "2026-03-16")?.status).toBe("done");
  });

  test("never adds occurrences dated before today", () => {
    const old = createSeries(task({ date: "2026-01-05" }), "weekly", "2026-01-05", idGen("S"), 1);
    const result = changeRule(old, old[0], "daily", TODAY, idGen("x"));
    const added = result.filter(t => !old.some(o => o.id === t.id));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(t => t.date! >= TODAY)).toBe(true);
  });

  test("to null ends the series: later occurrences removed, task and earlier ones become plain", () => {
    const result = changeRule(base, target, null, TODAY, idGen("x"));
    expect(result).toHaveLength(4);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(t => t.seriesId === null && t.repeat === null)).toBe(true);
    expect(extendSeries(result, "2026-09-01")).toEqual(result);
  });

  test("a plain task becomes recurring with a new series id and keeps its own id", () => {
    const plain = task({ id: "plain", status: "in_progress" });
    const result = changeRule([plain], plain, "weekly", TODAY, idGen("NEW"));
    expect(result).toHaveLength(9);
    expect(result[0]).toMatchObject({ id: "plain", seriesId: "NEW", repeat: "weekly", status: "in_progress" });
    expect(result[1].id).toBe("NEW:2026-03-09");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(t => taskSchema.safeParse(t).success)).toBe(true);
  });

  test("a plain task with rule null is unchanged", () => {
    const plain = task({ id: "plain" });
    expect(changeRule([plain], plain, null, TODAY, idGen("x"))).toEqual([plain]);
  });

  test("a backlog task cannot become recurring", () => {
    const backlog = task({ date: null, start: null });
    expect(() => changeRule([backlog], backlog, "daily", TODAY, idGen("x"))).toThrow(/date/);
  });

  test("an unknown task leaves the list unchanged", () => {
    expect(changeRule(base, task({ id: "ghost" }), "daily", TODAY, idGen("x"))).toEqual(base);
  });

  test("respects the cap on today-or-later rows, kept occurrences included", () => {
    const long = createSeries(task(), "weekly", TODAY, idGen("S"), 100);
    const result = changeRule(long, long[5], "daily", TODAY, idGen("x"), 100);
    const future = result.filter(t => t.seriesId === "S" && t.date! >= TODAY);
    expect(future).toHaveLength(MAX_OCCURRENCES_PER_SERIES);
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
  });

  test("past rows do not count towards the cap", () => {
    const rows = [...pastRows(150), task({ id: "P:now", date: TODAY, seriesId: "P", repeat: "weekly" })];
    const result = changeRule(rows, rows.at(-1)!, "daily", TODAY, idGen("x"));
    expect(result.length).toBe(150 + 57);
  });

  test("does not mutate its input", () => {
    const copy = structuredClone(base);
    changeRule(base, target, "daily", TODAY, idGen("x"));
    changeRule(base, target, null, TODAY, idGen("x"));
    changeRule(base, base[0], "weekdays", TODAY, idGen("x"));
    expect(base).toEqual(copy);
  });
});
