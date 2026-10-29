import { describe, expect, test } from "bun:test";
import { hoursTextToMinutesText, minutesToHoursText, toggleUnit } from "./duration-input";

describe("minutesToHoursText", () => {
  test("shows whole hours without decimals", () => {
    expect(minutesToHoursText("60")).toBe("1");
    expect(minutesToHoursText("120")).toBe("2");
    expect(minutesToHoursText("1440")).toBe("24");
  });

  test("shows fractional hours with up to two decimals and no trailing zeros", () => {
    expect(minutesToHoursText("90")).toBe("1.5");
    expect(minutesToHoursText("45")).toBe("0.75");
    expect(minutesToHoursText("30")).toBe("0.5");
    expect(minutesToHoursText("20")).toBe("0.33");
  });

  test("returns the text unchanged when it is not a number", () => {
    expect(minutesToHoursText("")).toBe("");
    expect(minutesToHoursText("abc")).toBe("abc");
  });
});

describe("hoursTextToMinutesText", () => {
  test("converts whole and fractional hours to whole minutes", () => {
    expect(hoursTextToMinutesText("1")).toBe("60");
    expect(hoursTextToMinutesText("1.5")).toBe("90");
    expect(hoursTextToMinutesText("0.25")).toBe("15");
  });

  test("accepts a comma as the decimal separator", () => {
    expect(hoursTextToMinutesText("1,5")).toBe("90");
  });

  test("rounds to the nearest minute", () => {
    expect(hoursTextToMinutesText("0.33")).toBe("20");
    expect(hoursTextToMinutesText("0.01")).toBe("1");
  });

  test("keeps text that is not a number so validation can report it", () => {
    expect(hoursTextToMinutesText("")).toBe("");
    expect(hoursTextToMinutesText("abc")).toBe("abc");
  });

  test("converts a negative number like any other and leaves rejecting it to validation", () => {
    expect(hoursTextToMinutesText("-1")).toBe("-60");
  });

  test("treats a trailing separator as the whole number typed so far", () => {
    expect(hoursTextToMinutesText("1.")).toBe("60");
  });

  test("round trips every whole-minute value that has a clean hour text", () => {
    for (const minutes of [15, 30, 45, 60, 75, 90, 120, 480, 1440]) {
      expect(hoursTextToMinutesText(minutesToHoursText(String(minutes)))).toBe(String(minutes));
    }
  });
});

describe("toggleUnit", () => {
  test("switches between minutes and hours", () => {
    expect(toggleUnit("min")).toBe("hr");
    expect(toggleUnit("hr")).toBe("min");
  });
});
