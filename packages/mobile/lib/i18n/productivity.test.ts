import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extraTranslations } from "./index";
import { vi } from "./productivity";

const ROOT = join(import.meta.dir, "..", "..");
/** Screens and sheets of quick add, steps, routines and the focus timer: every English text they show needs a Vietnamese one. */
const FILES = [
  "components/editor/ChecklistField.tsx",
  "components/editor/FocusStartRow.tsx",
  "components/quickadd/QuickAddSheet.tsx",
  "components/routines/RoutineSheet.tsx",
  "components/personal/RoutinesSection.tsx",
  "components/focus/FocusSheet.tsx",
  "components/focus/FocusMini.tsx",
  "components/focus/FocusNotifier.tsx",
  "components/stats/FocusTimeCard.tsx",
  "components/stats/GoalsCard.tsx",
  "components/stats/WeeklyReviewSheet.tsx",
  "components/settings/CalendarImportSection.tsx",
];
const baseDictionary = readFileSync(join(ROOT, "lib/language.tsx"), "utf8");

function translated(key: string): boolean {
  return key in extraTranslations || baseDictionary.includes(`${JSON.stringify(key)}:`);
}

const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;

/** String literals passed to `t(...)` (also either side of a `? :`) and the plain strings of the message tables of these files. */
function literalsOf(source: string): string[] {
  const direct = [...source.matchAll(new RegExp(String.raw`\bt\(\s*${STRING}`, "g"))].map(match => match[1]);
  const conditional = [...source.matchAll(new RegExp(String.raw`\bt\(\s*[^"()]*\?\s*${STRING}\s*:\s*${STRING}`, "g"))].flatMap(match => [match[1], match[2]]);
  const tables = [...source.matchAll(new RegExp(String.raw`^\s*(?:"[a-z-]+"|[a-z]+):\s*${STRING},?$`, "gm"))].map(match => match[1]);
  return [...direct, ...conditional, ...tables];
}

describe("productivity translations", () => {
  for (const file of FILES) {
    test(`${file} has no untranslated text`, () => {
      const keys = literalsOf(readFileSync(join(ROOT, file), "utf8")).map(key => JSON.parse(`"${key}"`) as string);
      expect(keys.filter(key => !translated(key))).toEqual([]);
    });
  }

  test("every new text is translated and none is left in English", () => {
    for (const [key, value] of Object.entries(vi)) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toBe(key);
    }
  });
});
