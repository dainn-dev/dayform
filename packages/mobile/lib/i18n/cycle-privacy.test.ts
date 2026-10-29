import { describe, expect, test } from "bun:test";
import { extraTranslations } from "./index";
import { vi } from "./cycle-privacy";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

describe("cycle privacy translations", () => {
  test("have a Vietnamese text for every key", () => {
    expect(Object.keys(vi).length).toBeGreaterThan(0);
    for (const [key, text] of Object.entries(vi)) {
      expect(key.trim()).not.toBe("");
      expect(text.trim()).not.toBe("");
      expect(text).not.toBe(key);
    }
  });

  test("keep the same placeholders as the English key", () => {
    for (const [key, text] of Object.entries(vi)) expect(placeholders(text)).toEqual(placeholders(key));
  });

  test("are registered in the shared dictionary", () => {
    for (const [key, text] of Object.entries(vi)) expect(extraTranslations[key]).toBe(text);
  });
});
