import { describe, test, expect } from "bun:test";
import { postponeOutOfQuiet, quietWindowMinutes } from "./reminders-quiet";

const NIGHT = { from: "22:00", to: "07:00" };
const DAY = { from: "12:00", to: "14:00" };

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute);
}

describe("quietWindowMinutes", () => {
  test("parses a valid window", () => {
    expect(quietWindowMinutes(NIGHT)).toEqual({ from: 1320, to: 420 });
  });
  test("equal from/to means disabled", () => {
    expect(quietWindowMinutes({ from: "08:00", to: "08:00" })).toBeNull();
  });
  test("null, undefined and malformed values mean disabled", () => {
    expect(quietWindowMinutes(null)).toBeNull();
    expect(quietWindowMinutes(undefined)).toBeNull();
    expect(quietWindowMinutes({ from: "25:00", to: "07:00" })).toBeNull();
    expect(quietWindowMinutes({ from: "22:00", to: "7:00" })).toBeNull();
  });
});

describe("postponeOutOfQuiet same-day window", () => {
  test("a time inside moves to the end of the window", () => {
    expect(postponeOutOfQuiet(at(30, 13, 15), DAY)).toEqual(at(30, 14));
  });
  test("the start of the window is inside", () => {
    expect(postponeOutOfQuiet(at(30, 12), DAY)).toEqual(at(30, 14));
  });
  test("the end of the window is outside", () => {
    const fireAt = at(30, 14);
    expect(postponeOutOfQuiet(fireAt, DAY)).toBe(fireAt);
  });
  test("before and after the window are untouched", () => {
    const before = at(30, 11, 59);
    const after = at(30, 14, 1);
    expect(postponeOutOfQuiet(before, DAY)).toBe(before);
    expect(postponeOutOfQuiet(after, DAY)).toBe(after);
  });
});

describe("postponeOutOfQuiet across midnight", () => {
  test("late evening moves to the next morning", () => {
    expect(postponeOutOfQuiet(at(30, 23, 30), NIGHT)).toEqual(at(31, 7));
  });
  test("exactly the window start moves to the next morning", () => {
    expect(postponeOutOfQuiet(at(30, 22), NIGHT)).toEqual(at(31, 7));
  });
  test("after midnight moves to the same day's morning", () => {
    expect(postponeOutOfQuiet(at(30, 0, 5), NIGHT)).toEqual(at(30, 7));
    expect(postponeOutOfQuiet(at(30, 6, 59), NIGHT)).toEqual(at(30, 7));
  });
  test("the window end and the daytime are outside", () => {
    const seven = at(30, 7);
    const noon = at(30, 12);
    const justBefore = at(30, 21, 59);
    expect(postponeOutOfQuiet(seven, NIGHT)).toBe(seven);
    expect(postponeOutOfQuiet(noon, NIGHT)).toBe(noon);
    expect(postponeOutOfQuiet(justBefore, NIGHT)).toBe(justBefore);
  });
  test("rolls over month ends", () => {
    expect(postponeOutOfQuiet(new Date(2026, 9, 31, 23, 0), NIGHT)).toEqual(new Date(2026, 10, 1, 7, 0));
  });
});

describe("postponeOutOfQuiet disabled", () => {
  test("returns the same date for null, equal bounds and bad values", () => {
    const fireAt = at(30, 23);
    expect(postponeOutOfQuiet(fireAt, null)).toBe(fireAt);
    expect(postponeOutOfQuiet(fireAt, undefined)).toBe(fireAt);
    expect(postponeOutOfQuiet(fireAt, { from: "22:00", to: "22:00" })).toBe(fireAt);
    expect(postponeOutOfQuiet(fireAt, { from: "nope", to: "07:00" })).toBe(fireAt);
  });
  test("never mutates its input", () => {
    const fireAt = at(30, 23);
    const copy = fireAt.getTime();
    postponeOutOfQuiet(fireAt, NIGHT);
    expect(fireAt.getTime()).toBe(copy);
  });
});
