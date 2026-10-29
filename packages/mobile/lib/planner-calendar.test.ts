import { describe, expect, test } from "bun:test";
import { addDays, formatTime, mondayOf, resolveTimeFormat, weekDays, weekStartOf } from "./planner";

// 2026-10-24 is a Saturday, 2026-10-25 a Sunday, 2026-10-26 a Monday.
describe("weekStartOf", () => {
  test("mon agrees with mondayOf for every day of a week", () => {
    for (let i = 0; i < 7; i += 1) {
      const key = addDays("2026-10-26", i);
      expect(weekStartOf(key, "mon")).toBe(mondayOf(key));
    }
  });

  test("sun: Sunday starts its own week, Saturday belongs to the week before", () => {
    expect(weekStartOf("2026-10-25", "sun")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-31", "sun")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-24", "sun")).toBe("2026-10-18");
    expect(weekStartOf("2026-10-26", "sun")).toBe("2026-10-25");
  });

  test("sat: Saturday starts its own week, Friday belongs to the week before", () => {
    expect(weekStartOf("2026-10-24", "sat")).toBe("2026-10-24");
    expect(weekStartOf("2026-10-30", "sat")).toBe("2026-10-24");
    expect(weekStartOf("2026-10-23", "sat")).toBe("2026-10-17");
    expect(weekStartOf("2026-10-25", "sat")).toBe("2026-10-24");
  });

  test("crosses month and year boundaries", () => {
    expect(weekStartOf("2026-04-01", "sun")).toBe("2026-03-29");
    expect(weekStartOf("2026-01-01", "sun")).toBe("2025-12-28");
    expect(weekStartOf("2026-01-01", "sat")).toBe("2025-12-27");
    expect(weekStartOf("2025-01-01", "mon")).toBe("2024-12-30");
  });

  test("handles the leap day", () => {
    expect(weekStartOf("2028-02-29", "mon")).toBe("2028-02-28");
    expect(weekStartOf("2028-02-29", "sun")).toBe("2028-02-27");
    expect(weekStartOf("2028-02-29", "sat")).toBe("2028-02-26");
    expect(weekStartOf("2028-03-01", "sun")).toBe("2028-02-27");
  });

  test("is idempotent", () => {
    for (const start of ["mon", "sun", "sat"] as const) {
      const first = weekStartOf("2026-10-29", start);
      expect(weekStartOf(first, start)).toBe(first);
    }
  });
});

describe("weekDays", () => {
  test("returns seven consecutive keys from the start", () => {
    expect(weekDays("2026-10-25")).toEqual([
      "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31",
    ]);
  });
  test("spans a year end and a leap day", () => {
    expect(weekDays("2025-12-28")[6]).toBe("2026-01-03");
    expect(weekDays("2028-02-26")[3]).toBe("2028-02-29");
  });
});

describe("resolveTimeFormat", () => {
  test("auto follows the language: Vietnamese 24h, English 12h", () => {
    expect(resolveTimeFormat("auto", "vi")).toBe("24h");
    expect(resolveTimeFormat("auto", "en")).toBe("12h");
  });
  test("an explicit choice wins over the language", () => {
    expect(resolveTimeFormat("12h", "vi")).toBe("12h");
    expect(resolveTimeFormat("24h", "en")).toBe("24h");
  });
});

describe("formatTime", () => {
  test("24h returns the stored value unchanged", () => {
    expect(formatTime("09:30", "24h")).toBe("09:30");
    expect(formatTime("00:00", "24h")).toBe("00:00");
  });
  test("12h uses AM/PM", () => {
    expect(formatTime("09:30", "12h")).toBe("9:30 AM");
    expect(formatTime("00:05", "12h")).toBe("12:05 AM");
    expect(formatTime("12:00", "12h")).toBe("12:00 PM");
    expect(formatTime("23:59", "12h")).toBe("11:59 PM");
  });
});
