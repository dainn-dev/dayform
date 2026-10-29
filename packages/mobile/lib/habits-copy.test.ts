import { describe, expect, test } from "bun:test";
import { categoryToOffer, durationHintTexts, repeatHintText, showStaleBanner, weekdayName } from "./habits-copy";

const identity = (text: string) => text;

describe("weekdayName", () => {
  test("uses Date.getDay numbering (0 = Sunday)", () => {
    expect(weekdayName(0, "en-US")).toBe("Sunday");
    expect(weekdayName(2, "en-US")).toBe("Tuesday");
    expect(weekdayName(6, "en-US")).toBe("Saturday");
  });

  test("localises the name", () => {
    expect(weekdayName(2, "vi-VN").toLowerCase()).toContain("ba");
  });

  test("returns an empty string for an invalid day", () => {
    expect(weekdayName(7, "en-US")).toBe("");
    expect(weekdayName(-1, "en-US")).toBe("");
  });
});

describe("repeatHintText", () => {
  test("weekly names the weekday and pluralises in English", () => {
    const text = repeatHintText({ repeat: "weekly", weekday: 2, occurrences: 3, window: 4 }, identity, "en-US");
    expect(text).toBe("You usually do this on Tuesdays");
  });

  test("daily and weekdays use their own sentence", () => {
    expect(repeatHintText({ repeat: "daily", weekday: null, occurrences: 7, window: 7 }, identity, "en-US")).toBe("You do this every day");
    expect(repeatHintText({ repeat: "weekdays", weekday: null, occurrences: 5, window: 5 }, identity, "en-US")).toBe("You do this most weekdays");
  });
});

describe("durationHintTexts", () => {
  test("fills minutes and the count", () => {
    expect(durationHintTexts({ minutes: 45, basedOn: 4, category: null }, identity)).toEqual({
      usually: "Usually 45 min", basedOn: "Based on 4 similar tasks", apply: "Use 45 min",
    });
  });
});

describe("categoryToOffer", () => {
  const base = { suggested: "Work", visible: ["Focus", "Work"], touched: false, current: "Focus" };

  test("offers a visible suggestion the user has not overridden", () => {
    expect(categoryToOffer(base)).toBe("Work");
  });

  test.each([
    ["no suggestion", { suggested: null }],
    ["hidden category", { visible: ["Focus"] }],
    ["already touched", { touched: true }],
    ["already selected", { current: "Work" }],
  ])("offers nothing for %s", (_name, patch) => {
    expect(categoryToOffer({ ...base, ...patch })).toBeNull();
  });
});

describe("showStaleBanner", () => {
  test("hides for zero tasks or after dismissal today", () => {
    expect(showStaleBanner(0, null, "2026-05-01")).toBe(false);
    expect(showStaleBanner(3, "2026-05-01", "2026-05-01")).toBe(false);
  });

  test("shows again on a later day", () => {
    expect(showStaleBanner(3, "2026-05-01", "2026-05-02")).toBe(true);
    expect(showStaleBanner(3, null, "2026-05-02")).toBe(true);
  });
});
