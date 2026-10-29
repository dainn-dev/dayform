import { describe, expect, test } from "bun:test";
import { DEFAULT_CATEGORIES_STATE, type CategoriesState } from "./categories";
import { categoriesInUse, categoryChoices, countByCategory } from "./category-usage";
import type { Task } from "./planner";

let counter = 0;
const task = (category: string): Task => {
  counter += 1;
  return {
    id: `t${counter}`, title: `Task ${counter}`, date: null, start: null, duration: 30,
    status: "todo", category, notes: "", createdAt: "2026-01-01T00:00:00.000Z",
  };
};

const gym = { id: "c_gym00000", name: "Gym", color: "sky", icon: "barbell-outline" } as const;
const custom: CategoriesState = { ...DEFAULT_CATEGORIES_STATE, custom: [gym] };

describe("countByCategory", () => {
  test("counts tasks per category id, including unknown ids", () => {
    const counts = countByCategory([task("Work"), task("Work"), task("c_gone0000"), task("c_gym00000")]);
    expect(counts.get("Work")).toBe(2);
    expect(counts.get("c_gone0000")).toBe(1);
    expect(counts.get("Focus")).toBeUndefined();
  });
  test("an empty list gives an empty map", () => {
    expect(countByCategory([]).size).toBe(0);
  });
  test("a prototype-like id is an ordinary key", () => {
    expect(countByCategory([task("__proto__"), task("constructor")]).get("__proto__")).toBe(1);
  });
});

describe("categoriesInUse", () => {
  test("starts with every visible category even when no task uses it", () => {
    expect(categoriesInUse([], custom)).toEqual(["Focus", "Work", "Personal", "Wellness", "c_gym00000"]);
  });
  test("adds hidden built-ins that still hold tasks after the visible ones", () => {
    const state: CategoriesState = { ...custom, hidden: ["Work"] };
    expect(categoriesInUse([task("Work"), task("Focus")], state)).toEqual(["Focus", "Personal", "Wellness", "c_gym00000", "Work"]);
  });
  test("a hidden built-in without tasks is not listed", () => {
    const state: CategoriesState = { ...custom, hidden: ["Work"] };
    expect(categoriesInUse([task("Focus")], state)).not.toContain("Work");
  });
  test("unknown ids (deleted categories) come last, ordered by their display name then id", () => {
    const state: CategoriesState = { ...DEFAULT_CATEGORIES_STATE, hidden: ["Wellness"], renamed: { Wellness: "Yoga" } };
    const tasks = [task("c_zzzz0000"), task("Wellness"), task("c_aaaa0000")];
    // Unknown ids resolve to "Other", which sorts before the hidden built-in's renamed "Yoga".
    expect(categoriesInUse(tasks, state)).toEqual(["Focus", "Work", "Personal", "c_aaaa0000", "c_zzzz0000", "Wellness"]);
  });
  test("lists every id once", () => {
    const result = categoriesInUse([task("c_x0000000"), task("c_x0000000"), task("Focus")], DEFAULT_CATEGORIES_STATE);
    expect(result.filter(id => id === "c_x0000000")).toHaveLength(1);
  });
  test("always includes the extra ids it is given (a selected filter must stay clearable)", () => {
    expect(categoriesInUse([], DEFAULT_CATEGORIES_STATE, ["c_selected0"])).toEqual(["Focus", "Work", "Personal", "Wellness", "c_selected0"]);
  });
  test("hidden built-ins sort among the others by name", () => {
    const state: CategoriesState = { ...DEFAULT_CATEGORIES_STATE, hidden: ["Focus", "Work"], renamed: { Work: "Alpha" } };
    expect(categoriesInUse([task("Focus"), task("Work")], state)).toEqual(["Personal", "Wellness", "Work", "Focus"]);
  });
});

describe("categoryChoices", () => {
  test("is the visible list when the current category is visible", () => {
    expect(categoryChoices(["Focus", "Work"], "Work")).toEqual(["Focus", "Work"]);
  });
  test("appends the current category when it is hidden or unknown, so editing never changes it", () => {
    expect(categoryChoices(["Focus", "Work"], "c_gone0000")).toEqual(["Focus", "Work", "c_gone0000"]);
  });
  test("does not mutate its input", () => {
    const visible = ["Focus"];
    categoryChoices(visible, "Work");
    expect(visible).toEqual(["Focus"]);
  });
});
