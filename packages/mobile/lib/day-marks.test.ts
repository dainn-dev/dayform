import { describe, expect, test } from "bun:test";
import { dayMarks, markKinds, marksLine } from "./day-marks";
import type { SpecialDay } from "./special-days";

const special = (id: string, patch: Partial<SpecialDay> = {}): SpecialDay => ({
  id, title: "Linh", kind: "birthday", calendar: "solar", month: 9, day: 25, startYear: 1996, remind: "none", ...patch,
});

describe("dayMarks: holidays", () => {
  test("marks the days that have a holiday, named in the language", () => {
    const week = ["2026-09-24", "2026-09-25", "2026-09-26"];
    expect(dayMarks(week, { holidays: true, language: "vi" })).toEqual({
      "2026-09-25": [{ id: "mid-autumn", kind: "holiday", label: "Tết Trung thu (15/8 ÂL)", userText: false }],
    });
    expect(dayMarks(week, { holidays: true, language: "en" })["2026-09-25"]?.[0].label).toBe("Mid-Autumn Festival (15/8 lunar)");
  });

  test("marks no holiday when the setting is off", () => {
    expect(dayMarks(["2026-09-02", "2026-09-25"], { holidays: false, language: "vi" })).toEqual({});
  });

  test("an empty list of days is fine", () => {
    expect(dayMarks([], { holidays: true, language: "en" })).toEqual({});
  });

  test("only the chosen groups are marked", () => {
    const keys = ["2026-09-02", "2026-09-25", "2026-10-20"];
    expect(Object.keys(dayMarks(keys, { holidays: true, language: "en", groups: new Set(["traditional"] as const) }))).toEqual(["2026-09-25"]);
    expect(Object.keys(dayMarks(keys, { holidays: true, language: "en", groups: new Set(["national", "occasion"] as const) }))).toEqual(["2026-09-02", "2026-10-20"]);
  });
});

describe("dayMarks: the user's special days", () => {
  test("marks a special day with its count, ahead of a holiday on the same day", () => {
    const marks = dayMarks(["2026-09-25"], { holidays: true, language: "en", specials: [special("s_aaaaaaaa")] })["2026-09-25"];
    expect(marks.map(mark => mark.kind)).toEqual(["special", "holiday"]);
    expect(marks[0]).toEqual({ id: "s_aaaaaaaa", kind: "special", label: "Linh (turns 30)", userText: true });
  });

  test("special days are marked even when holidays are off", () => {
    const found = dayMarks(["2026-09-25"], { holidays: false, language: "vi", specials: [special("s_aaaaaaaa")] });
    expect(found["2026-09-25"].map(mark => mark.kind)).toEqual(["special"]);
  });

  test("uses the interface translator for the count words", () => {
    const t = (text: string) => (text === "turns {count}" ? "{count} tuổi" : text);
    expect(dayMarks(["2026-09-25"], { holidays: false, language: "vi", specials: [special("s_a")], t })["2026-09-25"][0].label).toBe("Linh (30 tuổi)");
  });

  test("a lunar special day lands on its solar date", () => {
    const memorial = special("s_b", { title: "Giỗ ông", kind: "memorial", calendar: "lunar", month: 8, day: 15, startYear: 2010 });
    expect(dayMarks(["2026-09-24", "2026-09-25"], { holidays: false, language: "vi", specials: [memorial] })["2026-09-25"][0].label).toBe("Giỗ ông (16 years)");
  });

  test("the days do not have to be in order", () => {
    const found = dayMarks(["2026-09-26", "2026-09-25", "2026-09-24"], { holidays: false, language: "en", specials: [special("s_a")] });
    expect(Object.keys(found)).toEqual(["2026-09-25"]);
  });
});

describe("marksLine and markKinds", () => {
  test("joins the labels with a dot", () => {
    const marks = dayMarks(["2026-02-17"], { holidays: true, language: "vi" })["2026-02-17"];
    expect(marksLine(marks)).toBe("Mùng 1 Tết Nguyên Đán");
    expect(marksLine([...marks, { id: "x", kind: "special", label: "Khác", userText: true }])).toBe("Mùng 1 Tết Nguyên Đán · Khác");
  });

  test("is empty without marks", () => {
    expect(marksLine(undefined)).toBe("");
    expect(marksLine([])).toBe("");
  });

  test("says which kinds a day has", () => {
    const both = dayMarks(["2026-09-25"], { holidays: true, language: "en", specials: [special("s_a")] })["2026-09-25"];
    expect(markKinds(both)).toEqual({ holiday: true, special: true });
    expect(markKinds(undefined)).toEqual({ holiday: false, special: false });
  });
});
