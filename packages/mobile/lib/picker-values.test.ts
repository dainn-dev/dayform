import { describe, test, expect } from "bun:test";
import { dateToPicker, pickerToDate, pickerToTime, timeToPicker } from "./picker-values";

const FALLBACK = new Date(2026, 2, 2, 8, 15);

describe("picker values", () => {
  test("round-trips a date key through a local Date", () => {
    expect(pickerToDate(dateToPicker("2026-03-04", FALLBACK))).toBe("2026-03-04");
    expect(pickerToDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  test("round-trips an HH:mm time through a local Date", () => {
    expect(pickerToTime(timeToPicker("13:45", FALLBACK))).toBe("13:45");
    expect(pickerToTime(new Date(2026, 2, 2, 9, 5))).toBe("09:05");
    expect(pickerToTime(new Date(2026, 2, 2, 0, 0))).toBe("00:00");
  });

  test("falls back to the given moment when the typed value is invalid", () => {
    expect(pickerToDate(dateToPicker("nope", FALLBACK))).toBe("2026-03-02");
    expect(pickerToDate(dateToPicker("2026-02-30", FALLBACK))).toBe("2026-03-02");
    expect(pickerToTime(timeToPicker("25:99", FALLBACK))).toBe("08:15");
  });

  test("the date picker value keeps the current time of day for the time picker", () => {
    const picked = timeToPicker("07:30", FALLBACK);
    expect(pickerToDate(picked)).toBe("2026-03-02");
  });
});
