import { describe, expect, test } from "bun:test";
import { extraTranslations } from "./index";
import { vi } from "./categories";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();

describe("category translations", () => {
  test("cover every string the category screens use", () => {
    for (const key of [
      "Categories", "New category", "Category name", "Color", "Icon", "Rename", "Hide", "Show", "Delete category",
      "Move its tasks to {category}", "At least one category must stay visible",
      "You can add up to {count} categories", "A category with this name already exists", "Other",
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
