import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extraTranslations } from "./index";
import { vi } from "./cycle-ui";

const ROOT = join(import.meta.dir, "..", "..");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

/** Source files of the cycle UI: their `t("...")`, `tx("...")` and `sayText("...")` literals are the English keys. */
function sourceFiles(): string[] {
  const files = readdirSync(join(ROOT, "components/cycle")).filter(name => name.endsWith(".ts") || name.endsWith(".tsx")).map(name => join("components/cycle", name));
  const libs = readdirSync(join(ROOT, "lib")).filter(name => /^cycle-(ui|lock)-.*\.ts$/.test(name) && !name.endsWith(".test.ts") && name !== "cycle-ui-text.ts");
  return [...files, ...libs.map(name => join("lib", name)), "components/personal/CycleSection.tsx", "components/timeline/WeekStrip.tsx", "app/cycle.tsx"];
}

// Shared words ("Cancel", "Today", "Save") are translated once in the base dictionary of lib/language.tsx.
const BASE_SOURCE = readFileSync(join(ROOT, "lib", "language.tsx"), "utf8");
const isTranslated = (key: string): boolean => Boolean(extraTranslations[key]) || BASE_SOURCE.includes(`${JSON.stringify(key)}:`);

const KEY_PATTERN = /\b(?:t|tr|tx|sayText)\(\s*"((?:[^"\\]|\\.)*)"/g;

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of sourceFiles()) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const match of source.matchAll(KEY_PATTERN)) keys.set(JSON.parse(`"${match[1]}"`) as string, file);
  }
  return keys;
}

describe("cycle UI translations", () => {
  test("every English key used in the components has a Vietnamese entry", () => {
    const missing = [...usedKeys()].filter(([key]) => !isTranslated(key)).map(([key, file]) => `${key}  (${file})`);
    expect(missing).toEqual([]);
  });

  test("the scan finds the strings it should", () => {
    const keys = usedKeys();
    expect(keys.has("Period started today")).toBe(true);
    expect(keys.has("Next period expected {date}")).toBe(true);
    expect(keys.size).toBeGreaterThan(60);
  });

  test("keep the same placeholders as the English key", () => {
    for (const [key, text] of Object.entries(vi)) expect(placeholders(text)).toEqual(placeholders(key));
  });

  test("have no unused entries", () => {
    const used = usedKeys();
    expect(Object.keys(vi).filter(key => !used.has(key))).toEqual([]);
  });

  test("do not repeat a word the base dictionary already translates", () => {
    expect(Object.keys(vi).filter(key => BASE_SOURCE.includes(`${JSON.stringify(key)}:`))).toEqual([]);
  });

  test("are non-empty and registered in the shared dictionary", () => {
    for (const [key, text] of Object.entries(vi)) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(extraTranslations[key]).toBe(text);
    }
  });
});
