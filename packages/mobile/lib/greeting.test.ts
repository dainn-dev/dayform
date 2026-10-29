import { describe, expect, test } from "bun:test";
import { SLOGANS, dayPeriod, greetingFor, greetingLine, greetingText, sloganFor, sloganLine, sloganText } from "./greeting";
import { vi as viGreeting } from "./i18n/greeting";
import { vi } from "./i18n/slogans";
import { MAX_SLOGAN_LENGTH } from "./settings";

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

const shout = (text: string) => text.toUpperCase();

describe("greetingLine", () => {
  test("returns the name key for each part of the day", () => {
    expect(greetingLine(at(8), "Anh", true)).toBe("Good morning, {name}");
    expect(greetingLine(at(14), "Anh", true)).toBe("Good afternoon, {name}");
    expect(greetingLine(at(20), "Anh", true)).toBe("Good evening, {name}");
  });

  test("returns the plain key when showName is false", () => {
    expect(greetingLine(at(8), "Anh", false)).toBe("Good morning");
    expect(greetingLine(at(14), "Anh", false)).toBe("Good afternoon");
    expect(greetingLine(at(20), "Anh", false)).toBe("Good evening");
  });

  test("returns the plain key when the name is empty or only whitespace and control characters", () => {
    expect(greetingLine(at(8), "", true)).toBe("Good morning");
    expect(greetingLine(at(8), "  \t\n ", true)).toBe("Good morning");
    expect(greetingLine(at(8), "\u200B\u202E", true)).toBe("Good morning");
  });

  test("every name key has a Vietnamese translation with the placeholder", () => {
    for (const key of ["Good morning, {name}", "Good afternoon, {name}", "Good evening, {name}"]) {
      expect(viGreeting[key]).toContain("{name}");
      expect(viGreeting[key]).not.toBe(key);
    }
    expect(viGreeting["Good morning, {name}"]).toBe("Chào buổi sáng, {name}");
  });
});

describe("greetingText", () => {
  const identity = (text: string) => text;

  test("fills the name into the translated key", () => {
    expect(greetingText(at(8), "Anh", true, identity)).toBe("Good morning, Anh");
    expect(greetingText(at(8), "Anh", true, text => viGreeting[text] ?? text)).toBe("Chào buổi sáng, Anh");
  });

  test("keeps accents and emoji and trims the name", () => {
    expect(greetingText(at(8), "  Nguyễn Thị Ánh  ", true, identity)).toBe("Good morning, Nguyễn Thị Ánh");
    expect(greetingText(at(20), "Sam 🌟", true, identity)).toBe("Good evening, Sam 🌟");
  });

  test("never treats the name as a template", () => {
    expect(greetingText(at(8), "{name}", true, identity)).toBe("Good morning, {name}");
  });

  test("falls back to the plain greeting without a usable name", () => {
    expect(greetingText(at(14), "", true, identity)).toBe("Good afternoon");
    expect(greetingText(at(14), "Anh", false, identity)).toBe("Good afternoon");
  });
});

describe("sloganLine", () => {
  test("rotate returns the daily slogan", () => {
    expect(sloganLine(at(9), { style: "rotate", custom: "ignored" })).toBe(sloganFor(at(9)));
  });

  test("custom returns the sanitised custom slogan", () => {
    expect(sloganLine(at(9), { style: "custom", custom: "  Ship   it \n today  " })).toBe("Ship it today");
    expect(sloganLine(at(9), { style: "custom", custom: "Làm tốt lắm 🎉" })).toBe("Làm tốt lắm 🎉");
  });

  test("custom longer than the limit is cut to it", () => {
    const line = sloganLine(at(9), { style: "custom", custom: "x".repeat(MAX_SLOGAN_LENGTH + 20) });
    expect(Array.from(line ?? "").length).toBe(MAX_SLOGAN_LENGTH);
  });

  test("custom that is empty after sanitising falls back to the rotation", () => {
    expect(sloganLine(at(9), { style: "custom", custom: "" })).toBe(sloganFor(at(9)));
    expect(sloganLine(at(9), { style: "custom", custom: " \t\u200B " })).toBe(sloganFor(at(9)));
  });

  test("off returns null", () => {
    expect(sloganLine(at(9), { style: "off", custom: "Ship it" })).toBeNull();
  });

  test("rotate follows each part of the day", () => {
    expect(SLOGANS.afternoon).toContain(sloganLine(at(14), { style: "rotate", custom: "" }) ?? "");
    expect(SLOGANS.evening).toContain(sloganLine(at(21), { style: "rotate", custom: "" }) ?? "");
  });
});

describe("sloganText", () => {
  test("translates the rotating slogan", () => {
    expect(sloganText(at(9), { style: "rotate", custom: "" }, shout)).toBe(shout(sloganFor(at(9))));
  });

  test("never translates the custom slogan", () => {
    expect(sloganText(at(9), { style: "custom", custom: "Ship it" }, shout)).toBe("Ship it");
  });

  test("translates the rotating slogan used as the custom fallback", () => {
    expect(sloganText(at(9), { style: "custom", custom: " " }, shout)).toBe(shout(sloganFor(at(9))));
  });

  test("off returns null", () => {
    expect(sloganText(at(9), { style: "off", custom: "" }, shout)).toBeNull();
  });
});
