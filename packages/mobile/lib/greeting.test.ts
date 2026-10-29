import { describe, expect, test } from "bun:test";
import { SLOGANS, dayPeriod, greetingFor, sloganFor } from "./greeting";
import { vi } from "./i18n/slogans";

const at = (hour: number, minute = 0, day = 29) => new Date(2026, 9, day, hour, minute);

describe("dayPeriod and greetingFor", () => {
  test("uses the morning greeting until 11:59", () => {
    expect(dayPeriod(at(0))).toBe("morning");
    expect(dayPeriod(at(11, 59))).toBe("morning");
    expect(greetingFor(at(8))).toBe("Good morning");
  });

  test("switches to afternoon at 12:00 and evening at 17:00", () => {
    expect(dayPeriod(at(12))).toBe("afternoon");
    expect(greetingFor(at(16, 59))).toBe("Good afternoon");
    expect(dayPeriod(at(17))).toBe("evening");
    expect(greetingFor(at(23, 59))).toBe("Good evening");
  });
});

describe("sloganFor", () => {
  test("returns a slogan written for the current part of the day", () => {
    expect(SLOGANS.morning).toContain(sloganFor(at(9)));
    expect(SLOGANS.afternoon).toContain(sloganFor(at(14)));
    expect(SLOGANS.evening).toContain(sloganFor(at(20)));
  });

  test("stays the same for the whole day within a period", () => {
    expect(sloganFor(at(6, 0))).toBe(sloganFor(at(11, 59)));
    expect(sloganFor(at(17, 0))).toBe(sloganFor(at(23, 59)));
  });

  test("changes from one day to the next and cycles through every slogan", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= SLOGANS.morning.length; day++) seen.add(sloganFor(at(9, 0, day)));
    expect(seen.size).toBe(SLOGANS.morning.length);
    expect(sloganFor(at(9, 0, 10))).not.toBe(sloganFor(at(9, 0, 11)));
  });

  test("keeps the original slogan in the rotation", () => {
    expect(SLOGANS.morning).toContain("Make room for what matters.");
  });

  test("crosses month and year boundaries without breaking", () => {
    expect(SLOGANS.evening).toContain(sloganFor(new Date(2026, 11, 31, 20)));
    expect(SLOGANS.morning).toContain(sloganFor(new Date(2027, 0, 1, 7)));
  });
});

describe("slogan content", () => {
  const all = Object.values(SLOGANS).flat();

  test("every period has several short slogans and no duplicates", () => {
    for (const list of Object.values(SLOGANS)) expect(list.length).toBeGreaterThanOrEqual(4);
    expect(new Set(all).size).toBe(all.length);
    for (const slogan of all) expect(slogan.length).toBeLessThanOrEqual(48);
  });

  test("every slogan has a Vietnamese translation that differs from the English text", () => {
    for (const slogan of all) {
      // The original slogan is translated in the base dictionary, the rest in lib/i18n/slogans.ts.
      if (slogan === "Make room for what matters.") continue;
      expect(vi[slogan]).toBeDefined();
      expect(vi[slogan]).not.toBe(slogan);
    }
  });
});
