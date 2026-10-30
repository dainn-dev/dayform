import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extraTranslations } from "./index";
import { vi } from "./settings-menu";
import { MENU_GROUPS, MENU_ROWS } from "../settings-menu";

const ROOT = join(import.meta.dir, "..", "..");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

// Shared words ("Back", "Settings", "Edit") are translated once in another file or the base dictionary.
const BASE_SOURCE = readFileSync(join(ROOT, "lib", "language.tsx"), "utf8");
const isTranslated = (key: string): boolean => Boolean(extraTranslations[key]) || BASE_SOURCE.includes(`${JSON.stringify(key)}:`);

const KEY_PATTERN = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
const SOURCES = [
  "lib/settings-menu.ts",
  "app/settings/[section].tsx",
  "app/(tabs)/personal.tsx",
  ...readdirSync(join(ROOT, "components/menu")).filter(name => /\.tsx?$/.test(name)).map(name => `components/menu/${name}`),
  "components/personal/AboutSection.tsx",
  "components/personal/AppearanceSection.tsx",
];

describe("settings menu translations", () => {
  test("the menu's own strings, row titles and group labels are all translated", () => {
    for (const row of MENU_ROWS) expect(isTranslated(row.title)).toBe(true);
    for (const group of MENU_GROUPS) expect(isTranslated(group.title)).toBe(true);
    for (const key of ["On", "Off", "Locked", "Back", "Settings", "Version {version}", "Edit"]) expect(isTranslated(key)).toBe(true);
  });

  test("every literal passed to t() by the menu and the pages is translated", () => {
    const missing: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const match of source.matchAll(KEY_PATTERN)) {
        const key = JSON.parse(`"${match[1]}"`) as string;
        if (!isTranslated(key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("keep the same placeholders as the English key", () => {
    for (const [key, text] of Object.entries(vi)) expect(placeholders(text)).toEqual(placeholders(key));
  });

  test("are registered in the shared dictionary", () => {
    for (const [key, text] of Object.entries(vi)) expect(extraTranslations[key]).toBe(text);
  });

  test("do not contradict a string another feature file already translates", () => {
    const others = readdirSync(import.meta.dir).filter(name => /^[a-z-]+\.ts$/.test(name) && name !== "settings-menu.ts" && name !== "index.ts");
    for (const name of others) {
      const source = readFileSync(join(import.meta.dir, name), "utf8");
      for (const key of Object.keys(vi)) {
        const line = source.split("\n").find(candidate => candidate.trimStart().startsWith(`${JSON.stringify(key)}:`));
        if (line === undefined) continue;
        expect(line).toContain(JSON.stringify(vi[key]));
      }
    }
  });
});
