import { describe, expect, test } from "bun:test";
import { extraTranslations } from "./index";
import { vi } from "./habits";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

describe("habit hint translations", () => {
  test("cover every English string the hints use", () => {
    for (const key of [
      "Usually {minutes} min", "Based on {count} similar tasks", "Use {minutes} min", "You usually do this on {weekday}s",
      "You do this most weekdays", "You do this every day", "Make it repeat",
      "You finish most tasks between {from} and {to}", "Based on your last 8 weeks",
      "{count} tasks have been waiting over {days} days", "Review them",
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
});
