import { describe, expect, test } from "bun:test";
import { dayWindowFromMinutes, dayWindowPatch, isDayWindowValid, stepDayWindow } from "./day-window";

describe("dayWindowFromMinutes", () => {
  test("converts stored minutes to whole hours", () => {
    expect(dayWindowFromMinutes(360, 1320)).toEqual({ startHour: 6, endHour: 22 });
    expect(dayWindowFromMinutes(0, 1440)).toEqual({ startHour: 0, endHour: 24 });
  });
});

describe("stepDayWindow", () => {
  const base = { startHour: 6, endHour: 22 };
  test("moves one edge by whole hours and leaves the other alone", () => {
    expect(stepDayWindow(base, "start", 1)).toEqual({ startHour: 7, endHour: 22 });
    expect(stepDayWindow(base, "end", -1)).toEqual({ startHour: 6, endHour: 21 });
  });
  test("does not mutate its input", () => {
    stepDayWindow(base, "start", 1);
    expect(base).toEqual({ startHour: 6, endHour: 22 });
  });
  test("clamps the start to 0..23 and the end to 1..24", () => {
    expect(stepDayWindow({ startHour: 0, endHour: 22 }, "start", -1).startHour).toBe(0);
    expect(stepDayWindow({ startHour: 23, endHour: 24 }, "start", 1).startHour).toBe(23);
    expect(stepDayWindow({ startHour: 6, endHour: 24 }, "end", 1).endHour).toBe(24);
    expect(stepDayWindow({ startHour: 0, endHour: 1 }, "end", -1).endHour).toBe(1);
  });
});

describe("isDayWindowValid", () => {
  test("needs at least four hours", () => {
    expect(isDayWindowValid({ startHour: 6, endHour: 10 })).toBe(true);
    expect(isDayWindowValid({ startHour: 6, endHour: 9 })).toBe(false);
    expect(isDayWindowValid({ startHour: 10, endHour: 6 })).toBe(false);
    expect(isDayWindowValid({ startHour: 0, endHour: 24 })).toBe(true);
  });
});

describe("dayWindowPatch", () => {
  test("always carries both fields, in minutes", () => {
    expect(dayWindowPatch({ startHour: 8, endHour: 18 })).toEqual({ dayStart: 480, dayEnd: 1080 });
  });
});
