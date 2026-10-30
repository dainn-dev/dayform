import { describe, expect, test } from "bun:test";
import {
  MAX_SPECIAL_DAYS, MAX_SPECIAL_TITLE, addSpecialDay, countText, daysBetween, generateSpecialDayId, mergeSpecialDaysState,
  nextOccurrence, occurrenceDate, occurrencesInRange, parseSpecialDaysText, removeSpecialDay, specialLabel, updateSpecialDay,
  type SpecialDay, type SpecialDayInput, type SpecialDaysState,
} from "./special-days";

const EMPTY: SpecialDaysState = { items: [] };
const input = (patch: Partial<SpecialDayInput> = {}): SpecialDayInput => ({
  title: "Linh", kind: "birthday", calendar: "solar", month: 3, day: 15, startYear: 1995, remind: "none", ...patch,
});
const item = (id: string, patch: Partial<SpecialDayInput> = {}): SpecialDay => ({ id, ...input(patch) });
const say = (text: string) => text;

describe("generateSpecialDayId", () => {
  test("is s_ plus eight lowercase letters or digits and varies", () => {
    const first = generateSpecialDayId();
    expect(first).toMatch(/^s_[a-z0-9]{8}$/);
    expect(generateSpecialDayId()).not.toBe(first);
  });
});

describe("addSpecialDay", () => {
  test("adds a valid day with a fresh id and trims the title", () => {
    const result = addSpecialDay(EMPTY, input({ title: "  Sinh nhật   Linh " }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.items).toHaveLength(1);
    expect(result.state.items[0].title).toBe("Sinh nhật Linh");
    expect(result.id).toBe(result.state.items[0].id);
  });

  test("refuses an empty title or one made of invisible characters", () => {
    expect(addSpecialDay(EMPTY, input({ title: "   " }))).toEqual({ ok: false, reason: "invalid-title" });
    expect(addSpecialDay(EMPTY, input({ title: "​‮" }))).toEqual({ ok: false, reason: "invalid-title" });
  });

  test("cuts a long title to the limit", () => {
    const result = addSpecialDay(EMPTY, input({ title: "x".repeat(MAX_SPECIAL_TITLE + 20) }));
    expect(result.ok && result.state.items[0].title.length).toBe(MAX_SPECIAL_TITLE);
  });

  test("refuses dates that do not exist", () => {
    expect(addSpecialDay(EMPTY, input({ month: 13 }))).toEqual({ ok: false, reason: "invalid-date" });
    expect(addSpecialDay(EMPTY, input({ month: 4, day: 31 }))).toEqual({ ok: false, reason: "invalid-date" });
    expect(addSpecialDay(EMPTY, input({ month: 2, day: 30 }))).toEqual({ ok: false, reason: "invalid-date" });
    expect(addSpecialDay(EMPTY, input({ calendar: "lunar", month: 1, day: 31 }))).toEqual({ ok: false, reason: "invalid-date" });
    expect(addSpecialDay(EMPTY, input({ day: 0 }))).toEqual({ ok: false, reason: "invalid-date" });
  });

  test("allows 29 February and the 30th of a lunar month", () => {
    expect(addSpecialDay(EMPTY, input({ month: 2, day: 29 })).ok).toBe(true);
    expect(addSpecialDay(EMPTY, input({ calendar: "lunar", month: 12, day: 30 })).ok).toBe(true);
  });

  test("refuses a start year outside 1900-2100", () => {
    expect(addSpecialDay(EMPTY, input({ startYear: 1800 }))).toEqual({ ok: false, reason: "invalid-date" });
    expect(addSpecialDay(EMPTY, input({ startYear: null })).ok).toBe(true);
  });

  test("stops at the limit", () => {
    const full: SpecialDaysState = { items: Array.from({ length: MAX_SPECIAL_DAYS }, (_, i) => item(`s_${String(i).padStart(8, "0")}`)) };
    expect(addSpecialDay(full, input())).toEqual({ ok: false, reason: "limit" });
  });

  test("never changes the state it was given", () => {
    const before = { items: [item("s_aaaaaaaa")] };
    const snapshot = JSON.stringify(before);
    addSpecialDay(before, input());
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("updateSpecialDay and removeSpecialDay", () => {
  const state: SpecialDaysState = { items: [item("s_aaaaaaaa"), item("s_bbbbbbbb", { title: "Mẹ", month: 7 })] };

  test("updates only the given fields of one day", () => {
    const result = updateSpecialDay(state, "s_bbbbbbbb", { title: "Mẹ yêu", remind: "same-day" });
    expect(result.ok && result.state.items[1]).toEqual({ ...state.items[1], title: "Mẹ yêu", remind: "same-day" });
    expect(result.ok && result.state.items[0]).toBe(state.items[0]);
  });

  test("an unknown id and an invalid patch are refused", () => {
    expect(updateSpecialDay(state, "s_zzzzzzzz", { title: "x" })).toEqual({ ok: false, reason: "unknown" });
    expect(updateSpecialDay(state, "s_aaaaaaaa", { month: 2, day: 31 })).toEqual({ ok: false, reason: "invalid-date" });
    expect(updateSpecialDay(state, "s_aaaaaaaa", { title: " " })).toEqual({ ok: false, reason: "invalid-title" });
  });

  test("removes by id", () => {
    const result = removeSpecialDay(state, "s_aaaaaaaa");
    expect(result.ok && result.state.items.map(entry => entry.id)).toEqual(["s_bbbbbbbb"]);
    expect(removeSpecialDay(state, "s_zzzzzzzz")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("parseSpecialDaysText", () => {
  test("reads a saved state back", () => {
    const state: SpecialDaysState = { items: [item("s_aaaaaaaa", { remind: "day-before" })] };
    expect(parseSpecialDaysText(JSON.stringify(state))).toEqual({ valid: true, lossy: false, state });
  });

  test("text that is not JSON, or not an object, is invalid and empty", () => {
    expect(parseSpecialDaysText("{nope")).toMatchObject({ valid: false, state: EMPTY });
    expect(parseSpecialDaysText("[1,2]")).toMatchObject({ valid: false, state: EMPTY });
    expect(parseSpecialDaysText("null")).toMatchObject({ valid: false, state: EMPTY });
  });

  test("drops bad records, keeps good ones and says it lost something", () => {
    const good = item("s_aaaaaaaa");
    const text = JSON.stringify({ items: [good, { id: "bad" }, 5, { ...good, id: "s_bbbbbbbb", month: 13 }, null] });
    expect(parseSpecialDaysText(text)).toEqual({ valid: true, lossy: true, state: { items: [good] } });
  });

  test("a repeated id keeps the first", () => {
    const first = item("s_aaaaaaaa", { title: "Một" });
    const text = JSON.stringify({ items: [first, { ...first, title: "Hai" }] });
    expect(parseSpecialDaysText(text)).toMatchObject({ lossy: true, state: { items: [first] } });
  });

  test("a bad reminder falls back to none without losing the day", () => {
    const text = JSON.stringify({ items: [{ ...item("s_aaaaaaaa"), remind: "weekly" }] });
    expect(parseSpecialDaysText(text)).toMatchObject({ lossy: false, state: { items: [{ remind: "none" }] } });
  });

  test("keeps at most the limit", () => {
    const many = Array.from({ length: MAX_SPECIAL_DAYS + 5 }, (_, i) => item(`s_${String(i).padStart(8, "0")}`));
    const parsed = parseSpecialDaysText(JSON.stringify({ items: many }));
    expect(parsed.state.items).toHaveLength(MAX_SPECIAL_DAYS);
    expect(parsed.lossy).toBe(true);
  });

  test("an object without items is an empty state", () => {
    expect(parseSpecialDaysText("{}")).toEqual({ valid: true, lossy: false, state: EMPTY });
  });
});

describe("mergeSpecialDaysState", () => {
  const current: SpecialDaysState = { items: [item("s_aaaaaaaa", { title: "Hiện tại" })] };
  const incoming: SpecialDaysState = { items: [item("s_aaaaaaaa", { title: "Trong tệp" }), item("s_bbbbbbbb", { title: "Mới" })] };

  test("merge keeps what is there and adds what is new", () => {
    expect(mergeSpecialDaysState(current, incoming, "merge").items.map(entry => entry.title)).toEqual(["Hiện tại", "Mới"]);
  });

  test("replace takes the file's days", () => {
    expect(mergeSpecialDaysState(current, incoming, "replace")).toEqual(incoming);
  });

  test("merge does not go over the limit", () => {
    const full: SpecialDaysState = { items: Array.from({ length: MAX_SPECIAL_DAYS }, (_, i) => item(`s_${String(i).padStart(8, "0")}`)) };
    expect(mergeSpecialDaysState(full, incoming, "merge").items).toHaveLength(MAX_SPECIAL_DAYS);
  });

  test("merging nothing returns the same state object", () => {
    expect(mergeSpecialDaysState(current, EMPTY, "merge")).toBe(current);
  });
});

describe("occurrenceDate", () => {
  test("a solar day falls on the same month and day every year", () => {
    expect(occurrenceDate(item("s_a", { month: 3, day: 15 }), 2026)).toBe("2026-03-15");
    expect(occurrenceDate(item("s_a", { month: 3, day: 15 }), 2031)).toBe("2031-03-15");
  });

  test("29 February moves to the 28th in a year that is not a leap year", () => {
    expect(occurrenceDate(item("s_a", { month: 2, day: 29 }), 2026)).toBe("2026-02-28");
    expect(occurrenceDate(item("s_a", { month: 2, day: 29 }), 2028)).toBe("2028-02-29");
  });

  test("a lunar day is converted: the first day of the lunar year is Tết", () => {
    expect(occurrenceDate(item("s_a", { calendar: "lunar", month: 1, day: 1 }), 2026)).toBe("2026-02-17");
    expect(occurrenceDate(item("s_a", { calendar: "lunar", month: 8, day: 15 }), 2026)).toBe("2026-09-25");
  });

  test("the 30th of a lunar month that has 29 days falls on the 29th", () => {
    let found = false;
    for (let year = 2020; year <= 2030 && !found; year += 1) {
      for (let month = 1; month <= 12 && !found; month += 1) {
        const ordinary = occurrenceDate(item("s_a", { calendar: "lunar", month, day: 29 }), year);
        const thirty = occurrenceDate(item("s_a", { calendar: "lunar", month, day: 30 }), year);
        if (ordinary !== null && thirty === ordinary) found = true;
      }
    }
    expect(found).toBe(true);
  });

  test("a year outside the supported range has no date", () => {
    expect(occurrenceDate(item("s_a", { calendar: "lunar" }), 1700)).toBeNull();
  });
});

describe("occurrencesInRange", () => {
  const days = [
    item("s_solar", { title: "Linh", month: 3, day: 15, startYear: 1995 }),
    item("s_lunar", { title: "Giỗ ông", kind: "memorial", calendar: "lunar", month: 8, day: 15, startYear: 2010 }),
  ];

  test("finds a solar day and counts the years", () => {
    const found = occurrencesInRange(days, "2026-03-10", "2026-03-20");
    expect(Object.keys(found)).toEqual(["2026-03-15"]);
    expect(found["2026-03-15"][0]).toMatchObject({ date: "2026-03-15", years: 31 });
  });

  test("finds a lunar day on its solar date", () => {
    const found = occurrencesInRange(days, "2026-09-20", "2026-09-30");
    expect(Object.keys(found)).toEqual(["2026-09-25"]);
    expect(found["2026-09-25"][0].item.id).toBe("s_lunar");
    expect(found["2026-09-25"][0].years).toBe(16);
  });

  test("a range that crosses New Year finds days on both sides", () => {
    const edge = [item("s_a", { month: 12, day: 31 }), item("s_b", { month: 1, day: 1 })];
    expect(Object.keys(occurrencesInRange(edge, "2026-12-30", "2027-01-02"))).toEqual(["2026-12-31", "2027-01-01"]);
  });

  test("a lunar day of the last lunar month shows up in the next solar year's range", () => {
    // Lunar 23/12 (ông Táo) of lunar year 2025 falls in February 2026 solar? No: January 2026. Check the boundary.
    const kitchen = [item("s_a", { calendar: "lunar", month: 12, day: 23 })];
    const found = occurrencesInRange(kitchen, "2026-01-01", "2026-03-01");
    expect(Object.keys(found)).toHaveLength(1);
  });

  test("two days on one date are both listed", () => {
    const same = [item("s_a", { title: "A" }), item("s_b", { title: "B" })];
    expect(occurrencesInRange(same, "2026-03-15", "2026-03-15")["2026-03-15"]).toHaveLength(2);
  });

  test("an empty list or an empty range finds nothing", () => {
    expect(occurrencesInRange([], "2026-01-01", "2026-12-31")).toEqual({});
    expect(occurrencesInRange(days, "2026-04-01", "2026-03-01")).toEqual({});
  });

  test("a start year in the future gives no count", () => {
    const future = [item("s_a", { startYear: 2030 })];
    expect(occurrencesInRange(future, "2026-03-15", "2026-03-15")["2026-03-15"][0].years).toBeNull();
  });

  test("no start year gives no count", () => {
    const none = [item("s_a", { startYear: null })];
    expect(occurrencesInRange(none, "2026-03-15", "2026-03-15")["2026-03-15"][0].years).toBeNull();
  });
});

describe("nextOccurrence", () => {
  test("is today when the day is today", () => {
    expect(nextOccurrence(item("s_a", { month: 3, day: 15 }), "2026-03-15")).toMatchObject({ date: "2026-03-15", daysUntil: 0, years: 31 });
  });

  test("looks into next year once this year's date has passed", () => {
    expect(nextOccurrence(item("s_a", { month: 3, day: 15 }), "2026-03-16")).toMatchObject({ date: "2027-03-15", years: 32 });
  });

  test("works for a lunar day", () => {
    expect(nextOccurrence(item("s_a", { calendar: "lunar", month: 1, day: 1, startYear: null }), "2026-01-01")).toMatchObject({ date: "2026-02-17", daysUntil: 47, years: null });
  });
});

describe("daysBetween", () => {
  test("counts calendar days, also across a month and a year end", () => {
    expect(daysBetween("2026-03-15", "2026-03-15")).toBe(0);
    expect(daysBetween("2026-03-15", "2026-03-20")).toBe(5);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-03-20", "2026-03-15")).toBe(-5);
  });
});

describe("labels", () => {
  test("a birthday says the age, other kinds say the years", () => {
    expect(countText("birthday", 30, say)).toBe("turns 30");
    expect(countText("wedding", 10, say)).toBe("10 years");
    expect(countText("memorial", 5, say)).toBe("5 years");
    expect(countText("custom", 3, say)).toBe("3 years");
  });

  test("nothing is said for an unknown count or the year of the event itself", () => {
    expect(countText("birthday", null, say)).toBe("");
    expect(countText("birthday", 0, say)).toBe("");
  });

  test("the label is the title plus the count", () => {
    expect(specialLabel(item("s_a", { title: "Linh" }), 30, say)).toBe("Linh (turns 30)");
    expect(specialLabel(item("s_a", { title: "Linh" }), null, say)).toBe("Linh");
  });
});
