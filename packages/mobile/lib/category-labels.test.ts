import { describe, expect, test } from "bun:test";
import { COLOR_SLOTS, ICON_KEYS } from "./categories";
import { COLOR_LABELS, ICON_LABELS, failureMessage } from "./category-labels";
import { extraTranslations } from "./i18n";
import { vi } from "./i18n/categories-ui";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

const UI_KEYS = [
  "Categories", "New category", "Category name", "Rename", "Hide", "Show", "Delete", "Cancel", "Save", "Preview",
  "Color", "Icon", "Move its tasks to {category}", "At least one category must stay visible",
  "You can add up to {count} categories", "A category with this name already exists",
  "Hidden", "Add category", "No tasks", "1 task", "{count} tasks", "{name}, {tasks}", "{name}, {tasks}, hidden",
  "Edit {category}", "Hide {category}", "Show {category}", "Delete {category}",
  "Delete {category}? {tasks} will move to {target}.", "Delete {category}? No tasks use it.",
  "Could not move the tasks, so nothing was deleted.", "The tasks were moved, but the category could not be deleted. Try again.",
  "Could not save the category. Please try again.", "Could not save your categories. Please try again.",
  "Categories are read-only because the saved data could not be read safely.",
  "Edit category", "Reset to default", "Enter a name", "Use at most {count} characters",
  "Built-in categories keep their color and icon. You can only change the name.",
];

describe("category management labels", () => {
  test("every color slot and icon has a label with a Vietnamese translation", () => {
    for (const slot of COLOR_SLOTS) expect(extraTranslations[COLOR_LABELS[slot]]).toBeTruthy();
    for (const icon of ICON_KEYS) expect(extraTranslations[ICON_LABELS[icon]]).toBeTruthy();
  });

  test("icon and color labels are unique so a screen reader can tell them apart", () => {
    expect(new Set(Object.values(ICON_LABELS)).size).toBe(ICON_KEYS.length);
    expect(new Set(Object.values(COLOR_LABELS)).size).toBe(COLOR_SLOTS.length);
  });

  test("every UI string is translated and keeps its placeholders", () => {
    for (const key of UI_KEYS) {
      expect(extraTranslations[key]).toBeTruthy();
      expect(placeholders(extraTranslations[key]!)).toEqual(placeholders(key));
    }
  });

  test("failure messages resolve to translated keys with matching placeholders", () => {
    for (const reason of ["empty", "too-long", "duplicate", "limit", "last-visible", "locked", "write-failed", "id-collision"]) {
      const { key, values } = failureMessage(reason);
      expect(extraTranslations[key]).toBeTruthy();
      expect(placeholders(key)).toEqual(Object.keys(values ?? {}).sort());
    }
  });

  test("the new dictionary does not redefine keys of other features differently", () => {
    for (const key of Object.keys(vi)) expect(extraTranslations[key]).toBe(vi[key]);
  });
});
