import { describe, expect, test } from "bun:test";
import { extraTranslations } from "./index";
import { CHANNEL_NAME, NEUTRAL_BODY, localizeCycle, vi } from "./cycle-notify";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

describe("cycle notification translations", () => {
  test("cover every string the cycle notifications, backup and recovery use", () => {
    for (const key of [
      NEUTRAL_BODY, "Period expected today", "Period expected tomorrow", "Period expected in {n} days",
      "Period may be late", "Fertile window may start today (estimate)", CHANNEL_NAME,
      "This file includes health data (period tracker) and is not encrypted. Share it only with people you trust.",
      "Personal data could not be restored", "Personal data restored", "Personal data that could not be read",
      "Includes personal data", "Replace all your current personal data with this copy?",
    ]) {
      expect(vi[key]).toBeTruthy();
    }
  });

  test("keep the same placeholders as the English key", () => {
    for (const [key, text] of Object.entries(vi)) expect(placeholders(text)).toEqual(placeholders(key));
  });

  test("are registered in the shared dictionary", () => {
    for (const [key, text] of Object.entries(vi)) expect(extraTranslations[key]).toBe(text);
  });

  test("localizeCycle fills placeholders and falls back to the English key", () => {
    expect(localizeCycle("en", "Period expected in {n} days", { n: "2" })).toBe("Period expected in 2 days");
    expect(localizeCycle("vi", "Period expected in {n} days", { n: "2" })).toBe("Kỳ kinh dự kiến bắt đầu sau 2 ngày");
    expect(localizeCycle("vi", "Never translated")).toBe("Never translated");
    expect(localizeCycle("vi", NEUTRAL_BODY)).toBe("Dayform: nhắc nhở cá nhân");
  });
});
