import { describe, test, expect } from "bun:test";
import { dayNumber, daysBetween, daysInMonth, isDateKey, isLeapYear, yearsAgo } from "./cycle-date";
import { addDays } from "./planner";

describe("isLeapYear / daysInMonth", () => {
  test("follows the Gregorian rules", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });

  test("month lengths including February", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("isDateKey", () => {
  test("accepts real calendar dates", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-12-31")).toBe(true);
  });

  test("rejects impossible, malformed and non-string values", () => {
    for (const bad of ["2026-02-30", "2026-02-29", "2100-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-01-00"]) {
      expect(isDateKey(bad)).toBe(false);
    }
    for (const bad of ["2026-1-01", "26-01-01", "2026/01/01", " 2026-01-01", "2026-01-01T00:00", "", "1899-12-31", "2200-01-01"]) {
      expect(isDateKey(bad)).toBe(false);
    }
    for (const bad of [null, undefined, 20260101, {}, []]) expect(isDateKey(bad)).toBe(false);
  });
});

describe("dayNumber / daysBetween", () => {
  test("the epoch is day 0", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("1969-12-31")).toBe(-1);
  });

  test("counts across leap days, month ends and year boundaries", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(daysBetween("2026-03-01", "2026-01-01")).toBe(-59);
    expect(daysBetween("2000-03-01", "2000-03-01")).toBe(0);
  });

  test("agrees with planner addDays over a range that crosses DST changes", () => {
    for (const start of ["2026-03-07", "2026-03-28", "2026-10-24", "2026-10-31", "2026-04-04"]) {
      for (let n = 0; n <= 5; n += 1) expect(daysBetween(start, addDays(start, n))).toBe(n);
    }
  });
});

describe("yearsAgo", () => {
  test("keeps the month and day", () => {
    expect(yearsAgo("2026-10-29", 10)).toBe("2016-10-29");
  });

  test("a leap day lands on February 28 of a non-leap year", () => {
    expect(yearsAgo("2024-02-29", 10)).toBe("2014-02-28");
    expect(yearsAgo("2024-02-29", 4)).toBe("2020-02-29");
  });
});
