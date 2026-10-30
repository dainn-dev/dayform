import { describe, expect, test } from "bun:test";
import { lunarDaysInMonth, lunarToSolar, solarToLunar, type LunarDate } from "./lunar";

const lunar = (day: number, month: number, year: number, leap = false): LunarDate => ({ day, month, year, leap });

// Dates every Vietnamese calendar agrees on: the first day of the lunar new year (Tết Nguyên Đán).
const TET: ReadonlyArray<readonly [number, string]> = [
  [2017, "2017-01-28"], [2018, "2018-02-16"], [2019, "2019-02-05"], [2020, "2020-01-25"], [2021, "2021-02-12"],
  [2022, "2022-02-01"], [2023, "2023-01-22"], [2024, "2024-02-10"], [2025, "2025-01-29"], [2026, "2026-02-17"],
  [2027, "2027-02-06"], [2028, "2028-01-26"],
];

describe("solarToLunar", () => {
  test.each(TET)("Tết %i is 1/1 on %s", (year, key) => {
    expect(solarToLunar(key)).toEqual(lunar(1, 1, year));
  });

  test("the day before Tết is the last day of the previous lunar year", () => {
    const eve = solarToLunar("2026-02-16");
    expect(eve.month).toBe(12);
    expect(eve.year).toBe(2025);
    expect([29, 30]).toContain(eve.day);
  });

  test("known festivals: Giỗ Tổ Hùng Vương 10/3, Trung thu 15/8, Vu Lan 15/7", () => {
    expect(solarToLunar("2024-04-18")).toEqual(lunar(10, 3, 2024));
    expect(solarToLunar("2025-04-07")).toEqual(lunar(10, 3, 2025));
    expect(solarToLunar("2024-09-17")).toEqual(lunar(15, 8, 2024));
    expect(solarToLunar("2025-10-06")).toEqual(lunar(15, 8, 2025));
    expect(solarToLunar("2026-09-25")).toEqual(lunar(15, 8, 2026));
    expect(solarToLunar("2025-09-06")).toEqual(lunar(15, 7, 2025));
  });

  test("2023 had a leap second month (nhuận tháng 2)", () => {
    expect(solarToLunar("2023-02-20")).toEqual(lunar(1, 2, 2023));
    expect(solarToLunar("2023-03-22")).toEqual(lunar(1, 2, 2023, true));
    expect(solarToLunar("2023-04-20")).toEqual(lunar(1, 3, 2023));
    expect(solarToLunar("2023-04-29")).toEqual(lunar(10, 3, 2023));
  });

  test("the lunar day advances by one on consecutive days", () => {
    const first = solarToLunar("2026-03-01");
    const next = solarToLunar("2026-03-02");
    expect(next.day).toBe(first.day + 1);
    expect(next.month).toBe(first.month);
  });
});

describe("lunarToSolar", () => {
  test.each(TET)("Tết %i falls on %s", (year, key) => {
    expect(lunarToSolar(lunar(1, 1, year))).toBe(key);
  });

  test("a leap month converts only in a year that has it", () => {
    expect(lunarToSolar(lunar(1, 2, 2023, true))).toBe("2023-03-22");
    expect(lunarToSolar(lunar(1, 2, 2024, true))).toBeNull();
    expect(lunarToSolar(lunar(1, 5, 2023, true))).toBeNull();
  });

  test("round trip: every day of 2024 to 2027 converts back to itself", () => {
    const start = new Date(2024, 0, 1, 12);
    for (let offset = 0; offset < 4 * 366; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      expect(lunarToSolar(solarToLunar(key))).toBe(key);
    }
  });

  test("rejects a day or month that does not exist", () => {
    expect(lunarToSolar(lunar(0, 1, 2025))).toBeNull();
    expect(lunarToSolar(lunar(31, 1, 2025))).toBeNull();
    expect(lunarToSolar(lunar(1, 13, 2025))).toBeNull();
    expect(lunarToSolar(lunar(1, 1, 1800))).toBeNull();
  });
});

describe("lunarDaysInMonth", () => {
  test("a lunar month has 29 or 30 days and the next month starts right after", () => {
    for (let month = 1; month <= 12; month += 1) {
      const days = lunarDaysInMonth(month, 2026, false)!;
      expect([29, 30]).toContain(days);
      const last = lunarToSolar(lunar(days, month, 2026))!;
      const afterKey = new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1, Number(last.slice(8, 10)) + 1, 12);
      const after = solarToLunar(`${afterKey.getFullYear()}-${String(afterKey.getMonth() + 1).padStart(2, "0")}-${String(afterKey.getDate()).padStart(2, "0")}`);
      expect(after.day).toBe(1);
    }
  });

  test("is null for a leap month the year does not have", () => {
    expect(lunarDaysInMonth(2, 2023, true)).not.toBeNull();
    expect(lunarDaysInMonth(2, 2024, true)).toBeNull();
  });
});
