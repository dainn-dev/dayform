import { describe, expect, test } from "bun:test";
import { checkDraft, defaultCalendar, describeDate, draftFromDay, emptyDraft, sortByNext, untilText, type SpecialDraft } from "./special-day-draft";
import type { SpecialDay } from "./special-days";

const say = (text: string) => text;
const day = (id: string, patch: Partial<SpecialDay> = {}): SpecialDay => ({
  id, title: "Linh", kind: "birthday", calendar: "solar", month: 3, day: 15, startYear: 1995, remind: "none", ...patch,
});
const draft = (patch: Partial<SpecialDraft> = {}): SpecialDraft => ({ ...emptyDraft("birthday"), title: "Linh", day: "15", month: "3", year: "1995", ...patch });

describe("emptyDraft and defaultCalendar", () => {
  test("a memorial day starts on the lunar calendar, the others on the solar one", () => {
    expect(defaultCalendar("memorial")).toBe("lunar");
    expect(defaultCalendar("birthday")).toBe("solar");
    expect(defaultCalendar("wedding")).toBe("solar");
    expect(defaultCalendar("custom")).toBe("solar");
    expect(emptyDraft("memorial")).toMatchObject({ kind: "memorial", calendar: "lunar", title: "", day: "", month: "", year: "", remind: "none" });
  });

  test("a new birthday asks for a reminder on the day by default", () => {
    expect(emptyDraft("birthday").remind).toBe("same-day");
    expect(emptyDraft("custom").remind).toBe("none");
  });
});

describe("draftFromDay", () => {
  test("turns a saved day into text fields and back", () => {
    const saved = day("s_aaaaaaaa", { remind: "day-before", startYear: null, calendar: "lunar", month: 8, day: 15 });
    const filled = draftFromDay(saved);
    expect(filled).toEqual({ title: "Linh", kind: "birthday", calendar: "lunar", day: "15", month: "8", year: "", remind: "day-before" });
    const checked = checkDraft(filled);
    expect(checked.ok && checked.input).toEqual({ title: "Linh", kind: "birthday", calendar: "lunar", month: 8, day: 15, startYear: null, remind: "day-before" });
  });
});

describe("checkDraft", () => {
  test("a good draft becomes an input", () => {
    expect(checkDraft(draft())).toEqual({
      ok: true,
      input: { title: "Linh", kind: "birthday", calendar: "solar", month: 3, day: 15, startYear: 1995, remind: "same-day" },
    });
  });

  test("the year is optional", () => {
    const checked = checkDraft(draft({ year: "" }));
    expect(checked.ok && checked.input.startYear).toBeNull();
  });

  test("an empty title is a title problem", () => {
    expect(checkDraft(draft({ title: "  " }))).toEqual({ ok: false, field: "title" });
  });

  test("a missing, non-numeric or impossible day or month is a date problem", () => {
    expect(checkDraft(draft({ day: "" }))).toEqual({ ok: false, field: "date" });
    expect(checkDraft(draft({ month: "" }))).toEqual({ ok: false, field: "date" });
    expect(checkDraft(draft({ day: "ab" }))).toEqual({ ok: false, field: "date" });
    expect(checkDraft(draft({ day: "31", month: "4" }))).toEqual({ ok: false, field: "date" });
    expect(checkDraft(draft({ month: "13" }))).toEqual({ ok: false, field: "date" });
    expect(checkDraft(draft({ day: "1.5" }))).toEqual({ ok: false, field: "date" });
  });

  test("a year that is not four digits in range is a year problem", () => {
    expect(checkDraft(draft({ year: "95" }))).toEqual({ ok: false, field: "year" });
    expect(checkDraft(draft({ year: "1800" }))).toEqual({ ok: false, field: "year" });
    expect(checkDraft(draft({ year: "abcd" }))).toEqual({ ok: false, field: "year" });
  });

  test("the 30th is fine on the lunar calendar and not on the solar one in February", () => {
    expect(checkDraft(draft({ calendar: "lunar", day: "30", month: "2" })).ok).toBe(true);
    expect(checkDraft(draft({ calendar: "solar", day: "30", month: "2" }))).toEqual({ ok: false, field: "date" });
  });

  test("spaces around the numbers are ignored", () => {
    expect(checkDraft(draft({ day: " 15 ", month: " 3 ", year: " 1995 " })).ok).toBe(true);
  });
});

describe("describeDate", () => {
  test("a solar day is day/month, a lunar one says so", () => {
    expect(describeDate(day("s_a"), say)).toBe("15/3");
    expect(describeDate(day("s_a", { calendar: "lunar", month: 8 }), say)).toBe("15/8 lunar");
  });
});

describe("untilText", () => {
  test("says today, tomorrow or how many days", () => {
    expect(untilText(0, say)).toBe("Today");
    expect(untilText(1, say)).toBe("Tomorrow");
    expect(untilText(12, say)).toBe("in 12 days");
  });
});

describe("sortByNext", () => {
  test("puts the nearest day first and says how far away each one is", () => {
    const list = [day("s_far", { month: 12, day: 1 }), day("s_near", { month: 3, day: 20 }), day("s_today", { month: 3, day: 15 })];
    const sorted = sortByNext(list, "2026-03-15");
    expect(sorted.map(entry => entry.item.id)).toEqual(["s_today", "s_near", "s_far"]);
    expect(sorted.map(entry => entry.next?.daysUntil)).toEqual([0, 5, 261]);
  });

  test("an empty list is empty", () => {
    expect(sortByNext([], "2026-03-15")).toEqual([]);
  });

  test("equal distances keep their order", () => {
    const sorted = sortByNext([day("s_b", { title: "B" }), day("s_a", { title: "A" })], "2026-03-15");
    expect(sorted.map(entry => entry.item.id)).toEqual(["s_b", "s_a"]);
  });
});
