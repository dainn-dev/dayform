import { describe, test, expect } from "bun:test";
import ionicons from "../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { Colors } from "../constants/palettes";
import {
  COLOR_SLOTS,
  DEFAULT_CATEGORIES_STATE,
  ICON_KEYS,
  MAX_CUSTOM,
  MAX_NAME_LENGTH,
  addCategory,
  allCategoryIds,
  categoriesStateSchema,
  categoryLabel,
  colorsFor,
  generateCategoryId,
  hasCategoryCustomizations,
  hideBuiltin,
  mergeCategoriesState,
  normalizeCategoryName,
  parseCategoriesState,
  parseCategoriesText,
  reassignOnDelete,
  removeCategory,
  renameBuiltin,
  resolveCategory,
  showBuiltin,
  updateCategory,
  validateCategoryName,
  validateNewCategory,
  visibleCategories,
  type CategoriesState,
  type CustomCategory,
} from "./categories";
import { BUILTIN_CATEGORIES } from "./planner";

const custom = (id: string, name: string, extra: Partial<CustomCategory> = {}): CustomCategory => ({
  id, name, color: "sky", icon: "book-outline", ...extra,
});
const stateOf = (patch: Partial<CategoriesState>): CategoriesState => ({ ...DEFAULT_CATEGORIES_STATE, ...patch });
const upper = (text: string) => text.toUpperCase();
const vi = (text: string) => ({ Focus: "Tập trung", Work: "Công việc", Personal: "Cá nhân", Wellness: "Sức khỏe", Other: "Khác" })[text] ?? text;

function ids(): () => string {
  let n = 0;
  return () => `c_${String(++n).padStart(8, "0")}`;
}

describe("constants", () => {
  test("every icon exists in Ionicons and every slot has a palette entry in both schemes", () => {
    for (const icon of ICON_KEYS) expect(Object.hasOwn(ionicons, icon)).toBe(true);
    for (const scheme of ["light", "dark"] as const) {
      for (const slot of COLOR_SLOTS) expect(Colors[scheme].category[slot]).toBeDefined();
    }
    expect(new Set(ICON_KEYS).size).toBe(ICON_KEYS.length);
  });
});

describe("normalizeCategoryName", () => {
  test("trims, collapses whitespace and strips invisible characters", () => {
    expect(normalizeCategoryName("  Side \t  hustle\n")).toBe("Side hustle");
    expect(normalizeCategoryName("A​b‮c\u0007")).toBe("Abc");
  });
  test("is bounded so absurd input cannot grow without limit", () => {
    expect(Array.from(normalizeCategoryName("x".repeat(5000))).length).toBeLessThanOrEqual(200);
  });
});

describe("generateCategoryId", () => {
  test("is c_ plus 8 base36 characters", () => {
    expect(generateCategoryId()).toMatch(/^c_[0-9a-z]{8}$/);
  });
  test("uses the injected generator and clamps its extremes", () => {
    expect(generateCategoryId(() => 0)).toBe("c_00000000");
    expect(generateCategoryId(() => 1)).toBe("c_zzzzzzzz");
  });
});

describe("visibleCategories / allCategoryIds", () => {
  test("default is the four built-ins", () => {
    expect(visibleCategories(DEFAULT_CATEGORIES_STATE)).toEqual(["Focus", "Work", "Personal", "Wellness"]);
  });
  test("hidden built-ins are skipped and custom ones follow in order", () => {
    const state = stateOf({ hidden: ["Work"], custom: [custom("c_aaaaaaaa", "A"), custom("c_bbbbbbbb", "B")] });
    expect(visibleCategories(state)).toEqual(["Focus", "Personal", "Wellness", "c_aaaaaaaa", "c_bbbbbbbb"]);
    expect(allCategoryIds(state)).toEqual(["Focus", "Work", "Personal", "Wellness", "c_aaaaaaaa", "c_bbbbbbbb"]);
  });
});

describe("resolveCategory / categoryLabel", () => {
  test("built-ins keep their palette key and icon and are translatable", () => {
    const resolved = resolveCategory("Work", DEFAULT_CATEGORIES_STATE);
    expect(resolved).toMatchObject({ id: "Work", name: "Work", translatable: true, colorKey: "Work", icon: "briefcase-outline", known: true, builtin: true });
    expect(categoryLabel("Work", DEFAULT_CATEGORIES_STATE, vi)).toBe("Công việc");
  });
  test("a renamed built-in shows the user's name untranslated", () => {
    const state = stateOf({ renamed: { Work: "Day job" } });
    expect(resolveCategory("Work", state)).toMatchObject({ name: "Day job", translatable: false });
    expect(categoryLabel("Work", state, upper)).toBe("Day job");
  });
  test("a hidden built-in still resolves to itself", () => {
    expect(resolveCategory("Focus", stateOf({ hidden: ["Focus"] })).colorKey).toBe("Focus");
  });
  test("a custom category uses its color slot, icon and untranslated name", () => {
    const state = stateOf({ custom: [custom("c_aaaaaaaa", "Reading", { color: "lime", icon: "leaf-outline" })] });
    expect(resolveCategory("c_aaaaaaaa", state)).toMatchObject({
      name: "Reading", translatable: false, colorKey: "lime", icon: "leaf-outline", known: true, builtin: false,
    });
    expect(categoryLabel("c_aaaaaaaa", state, upper)).toBe("Reading");
  });
  test("an unknown id falls back to Personal styling and the translated 'Other'", () => {
    const resolved = resolveCategory("c_gone0000", DEFAULT_CATEGORIES_STATE);
    expect(resolved).toMatchObject({ id: "c_gone0000", name: "Other", colorKey: "Personal", icon: "heart-outline", known: false, builtin: false, translatable: true });
    expect(categoryLabel("c_gone0000", DEFAULT_CATEGORIES_STATE, vi)).toBe("Khác");
  });
  test("ids that look like Object.prototype members are unknown, not crashes", () => {
    expect(resolveCategory("constructor", DEFAULT_CATEGORIES_STATE).known).toBe(false);
    expect(resolveCategory("__proto__", DEFAULT_CATEGORIES_STATE).known).toBe(false);
  });
});

describe("colorsFor", () => {
  test("combines the palette tint with the icon", () => {
    const resolved = resolveCategory("c_aaaaaaaa", stateOf({ custom: [custom("c_aaaaaaaa", "R", { color: "mint" })] }));
    expect(colorsFor(resolved, Colors.light.category)).toEqual({ ...Colors.light.category.mint, icon: "book-outline" });
  });
  test("a missing palette key falls back to Personal", () => {
    const resolved = resolveCategory("Work", DEFAULT_CATEGORIES_STATE);
    const palette = { Personal: { bg: "#111111", accent: "#222222" } };
    expect(colorsFor(resolved, palette)).toEqual({ bg: "#111111", accent: "#222222", icon: "briefcase-outline" });
  });
});

describe("validateCategoryName", () => {
  test("accepts and normalises a fresh name", () => {
    expect(validateCategoryName("  Gym  time ", DEFAULT_CATEGORIES_STATE)).toEqual({ ok: true, name: "Gym time" });
  });
  test("rejects empty and too long names", () => {
    expect(validateCategoryName("   ", DEFAULT_CATEGORIES_STATE)).toEqual({ ok: false, reason: "empty" });
    expect(validateCategoryName("x".repeat(MAX_NAME_LENGTH + 1), DEFAULT_CATEGORIES_STATE)).toEqual({ ok: false, reason: "too-long" });
    expect(validateCategoryName("x".repeat(MAX_NAME_LENGTH), DEFAULT_CATEGORIES_STATE).ok).toBe(true);
  });
  test("duplicates ignore case and accents, and cover built-in names", () => {
    expect(validateCategoryName("work", DEFAULT_CATEGORIES_STATE)).toEqual({ ok: false, reason: "duplicate" });
    const state = stateOf({ custom: [custom("c_aaaaaaaa", "Đọc sách")] });
    expect(validateCategoryName("doc SACH", state)).toEqual({ ok: false, reason: "duplicate" });
  });
  test("translated built-in names and renamed built-in names count as taken", () => {
    expect(validateCategoryName("cong viec", DEFAULT_CATEGORIES_STATE, { translate: vi })).toEqual({ ok: false, reason: "duplicate" });
    expect(validateCategoryName("Day job", stateOf({ renamed: { Work: "Day job" } }))).toEqual({ ok: false, reason: "duplicate" });
  });
  test("ignoreId lets a category keep its own name", () => {
    const state = stateOf({ custom: [custom("c_aaaaaaaa", "Gym")], renamed: { Work: "Day job" } });
    expect(validateCategoryName("gym", state, { ignoreId: "c_aaaaaaaa" }).ok).toBe(true);
    expect(validateCategoryName("day job", state, { ignoreId: "Work" }).ok).toBe(true);
    expect(validateCategoryName("Work", state, { ignoreId: "Work" }).ok).toBe(true);
  });
});

describe("validateNewCategory", () => {
  test("refuses past MAX_CUSTOM, before looking at the name", () => {
    const full = stateOf({ custom: Array.from({ length: MAX_CUSTOM }, (_, i) => custom(`c_${String(i).padStart(8, "0")}`, `N${i}`)) });
    expect(validateNewCategory("Fresh", full)).toEqual({ ok: false, reason: "limit" });
    expect(validateNewCategory("Fresh", DEFAULT_CATEGORIES_STATE)).toEqual({ ok: true, name: "Fresh" });
  });
});

describe("addCategory", () => {
  const input = { name: " Gym ", color: "coral", icon: "barbell-outline" } as const;
  test("appends a new custom category without touching the input state", () => {
    const result = addCategory(DEFAULT_CATEGORIES_STATE, input, { generateId: ids() });
    expect(result).toEqual({
      ok: true,
      id: "c_00000001",
      state: { custom: [{ id: "c_00000001", name: "Gym", color: "coral", icon: "barbell-outline" }], hidden: [], renamed: {} },
    });
    expect(DEFAULT_CATEGORIES_STATE.custom).toEqual([]);
  });
  test("uses a random id by default", () => {
    const result = addCategory(DEFAULT_CATEGORIES_STATE, input);
    expect(result.ok && result.id).toMatch(/^c_[0-9a-z]{8}$/);
  });
  test("retries an id that is already taken and gives up on a stuck generator", () => {
    const first = addCategory(DEFAULT_CATEGORIES_STATE, input, { generateId: () => "c_aaaaaaaa" });
    if (!first.ok) throw new Error("unexpected");
    const queue = ["c_aaaaaaaa", "c_aaaaaaaa", "c_bbbbbbbb"];
    const second = addCategory(first.state, { ...input, name: "Other gym" }, { generateId: () => queue.shift() ?? "c_zzzzzzzz" });
    expect(second.ok && second.id).toBe("c_bbbbbbbb");
    expect(addCategory(first.state, { ...input, name: "Third" }, { generateId: () => "c_aaaaaaaa" })).toEqual({ ok: false, reason: "id-collision" });
  });
  test("rejects a bad name, bad style and the limit", () => {
    expect(addCategory(DEFAULT_CATEGORIES_STATE, { ...input, name: "" })).toEqual({ ok: false, reason: "empty" });
    expect(addCategory(DEFAULT_CATEGORIES_STATE, { ...input, name: "work" })).toEqual({ ok: false, reason: "duplicate" });
    expect(addCategory(DEFAULT_CATEGORIES_STATE, { ...input, color: "nope" as never })).toEqual({ ok: false, reason: "invalid-style" });
    expect(addCategory(DEFAULT_CATEGORIES_STATE, { ...input, icon: "nope" as never })).toEqual({ ok: false, reason: "invalid-style" });
    const full = stateOf({ custom: Array.from({ length: MAX_CUSTOM }, (_, i) => custom(`c_${String(i).padStart(8, "0")}`, `N${i}`)) });
    expect(addCategory(full, input)).toEqual({ ok: false, reason: "limit" });
  });
  test("passes translate through to the duplicate check", () => {
    expect(addCategory(DEFAULT_CATEGORIES_STATE, { ...input, name: "Cá nhân" }, { translate: vi })).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("updateCategory", () => {
  const base = stateOf({ custom: [custom("c_aaaaaaaa", "Gym"), custom("c_bbbbbbbb", "Art")] });
  test("changes only the given fields of that category", () => {
    const result = updateCategory(base, "c_aaaaaaaa", { name: " Fitness ", color: "lime" });
    expect(result).toMatchObject({ ok: true, id: "c_aaaaaaaa" });
    if (!result.ok) return;
    expect(result.state.custom[0]).toEqual({ id: "c_aaaaaaaa", name: "Fitness", color: "lime", icon: "book-outline" });
    expect(result.state.custom[1]).toBe(base.custom[1]);
    expect(base.custom[0].name).toBe("Gym");
  });
  test("an icon-only update keeps the name and skips the duplicate check", () => {
    const result = updateCategory(base, "c_aaaaaaaa", { icon: "leaf-outline" });
    expect(result.ok && result.state.custom[0]).toEqual({ id: "c_aaaaaaaa", name: "Gym", color: "sky", icon: "leaf-outline" });
  });
  test("keeping its own name is fine, taking another's is not", () => {
    expect(updateCategory(base, "c_aaaaaaaa", { name: "gym" }).ok).toBe(true);
    expect(updateCategory(base, "c_aaaaaaaa", { name: "art" })).toEqual({ ok: false, reason: "duplicate" });
  });
  test("rejects unknown ids, built-ins, bad names and bad styles", () => {
    expect(updateCategory(base, "c_zzzzzzzz", { name: "X" })).toEqual({ ok: false, reason: "unknown-category" });
    expect(updateCategory(base, "Work", { name: "X" })).toEqual({ ok: false, reason: "unknown-category" });
    expect(updateCategory(base, "c_aaaaaaaa", { name: " " })).toEqual({ ok: false, reason: "empty" });
    expect(updateCategory(base, "c_aaaaaaaa", { color: "x" as never })).toEqual({ ok: false, reason: "invalid-style" });
    expect(updateCategory(base, "c_aaaaaaaa", { icon: "x" as never })).toEqual({ ok: false, reason: "invalid-style" });
  });
});

describe("removeCategory", () => {
  test("removes a custom category", () => {
    const state = stateOf({ custom: [custom("c_aaaaaaaa", "Gym"), custom("c_bbbbbbbb", "Art")] });
    const result = removeCategory(state, "c_aaaaaaaa");
    expect(result.ok && result.state.custom.map(item => item.id)).toEqual(["c_bbbbbbbb"]);
  });
  test("refuses unknown ids and built-ins", () => {
    expect(removeCategory(DEFAULT_CATEGORIES_STATE, "c_zzzzzzzz")).toEqual({ ok: false, reason: "unknown-category" });
    expect(removeCategory(DEFAULT_CATEGORIES_STATE, "Work")).toEqual({ ok: false, reason: "unknown-category" });
  });
  test("refuses to remove the last visible category", () => {
    const state = stateOf({ hidden: [...BUILTIN_CATEGORIES], custom: [custom("c_aaaaaaaa", "Gym")] });
    expect(removeCategory(state, "c_aaaaaaaa")).toEqual({ ok: false, reason: "last-visible" });
  });
});

describe("hideBuiltin / showBuiltin", () => {
  test("hides and shows a built-in", () => {
    const hidden = hideBuiltin(DEFAULT_CATEGORIES_STATE, "Work");
    expect(hidden.ok && hidden.state.hidden).toEqual(["Work"]);
    if (!hidden.ok) return;
    const shown = showBuiltin(hidden.state, "Work");
    expect(shown.ok && shown.state.hidden).toEqual([]);
  });
  test("hiding twice or showing a visible one changes nothing", () => {
    const once = hideBuiltin(DEFAULT_CATEGORIES_STATE, "Work");
    if (!once.ok) throw new Error("unexpected");
    const twice = hideBuiltin(once.state, "Work");
    expect(twice.ok && twice.state).toBe(once.state);
    const shown = showBuiltin(DEFAULT_CATEGORIES_STATE, "Work");
    expect(shown.ok && shown.state).toBe(DEFAULT_CATEGORIES_STATE);
  });
  test("at least one category must stay visible", () => {
    let state = DEFAULT_CATEGORIES_STATE;
    for (const id of ["Focus", "Work", "Personal"]) {
      const step = hideBuiltin(state, id);
      if (!step.ok) throw new Error("unexpected");
      state = step.state;
    }
    expect(hideBuiltin(state, "Wellness")).toEqual({ ok: false, reason: "last-visible" });
    const withCustom = stateOf({ ...state, custom: [custom("c_aaaaaaaa", "Gym")] });
    expect(hideBuiltin(withCustom, "Wellness").ok).toBe(true);
  });
  test("custom ids are not built-ins", () => {
    expect(hideBuiltin(DEFAULT_CATEGORIES_STATE, "c_aaaaaaaa")).toEqual({ ok: false, reason: "not-builtin" });
    expect(showBuiltin(DEFAULT_CATEGORIES_STATE, "c_aaaaaaaa")).toEqual({ ok: false, reason: "not-builtin" });
  });
});

describe("renameBuiltin", () => {
  test("stores a normalised override", () => {
    const result = renameBuiltin(DEFAULT_CATEGORIES_STATE, "Work", "  Day   job ");
    expect(result.ok && result.state.renamed).toEqual({ Work: "Day job" });
  });
  test("an empty name or the default name resets the override", () => {
    const state = stateOf({ renamed: { Work: "Day job", Focus: "Deep" } });
    const empty = renameBuiltin(state, "Work", "  ");
    expect(empty.ok && empty.state.renamed).toEqual({ Focus: "Deep" });
    const same = renameBuiltin(state, "Work", "work");
    expect(same.ok && same.state.renamed).toEqual({ Focus: "Deep" });
    const translated = renameBuiltin(state, "Work", "Công việc", { translate: vi });
    expect(translated.ok && translated.state.renamed).toEqual({ Focus: "Deep" });
  });
  test("resetting a built-in that was never renamed returns the same state", () => {
    const result = renameBuiltin(DEFAULT_CATEGORIES_STATE, "Work", "");
    expect(result.ok && result.state).toBe(DEFAULT_CATEGORIES_STATE);
  });
  test("rejects custom ids, duplicates and long names", () => {
    expect(renameBuiltin(DEFAULT_CATEGORIES_STATE, "c_aaaaaaaa", "X")).toEqual({ ok: false, reason: "not-builtin" });
    expect(renameBuiltin(DEFAULT_CATEGORIES_STATE, "Work", "personal")).toEqual({ ok: false, reason: "duplicate" });
    expect(renameBuiltin(DEFAULT_CATEGORIES_STATE, "Work", "x".repeat(MAX_NAME_LENGTH + 1))).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("reassignOnDelete", () => {
  test("is the first visible category other than the deleted one", () => {
    const state = stateOf({ hidden: ["Focus"], custom: [custom("c_aaaaaaaa", "Gym")] });
    expect(reassignOnDelete(state, "c_aaaaaaaa")).toBe("Work");
    expect(reassignOnDelete(stateOf({ hidden: ["Focus", "Work", "Personal"], custom: [custom("c_aaaaaaaa", "G")] }), "c_aaaaaaaa")).toBe("Wellness");
  });
  test("falls back to the first built-in when nothing else is visible", () => {
    const only = stateOf({ hidden: [...BUILTIN_CATEGORIES], custom: [custom("c_aaaaaaaa", "G")] });
    expect(reassignOnDelete(only, "c_aaaaaaaa")).toBe("Focus");
  });
});

describe("parseCategoriesState", () => {
  test("anything that is not an object degrades to defaults", () => {
    for (const raw of [null, undefined, 4, "x", [], true]) {
      expect(parseCategoriesState(raw)).toEqual(DEFAULT_CATEGORIES_STATE);
    }
  });
  test("a valid state round-trips unchanged", () => {
    const state: CategoriesState = {
      custom: [custom("c_aaaaaaaa", "Gym", { color: "amber", icon: "barbell-outline" })],
      hidden: ["Wellness"],
      renamed: { Work: "Day job" },
    };
    expect(parseCategoriesState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  test("each field degrades on its own", () => {
    const parsed = parseCategoriesState({ custom: "nope", hidden: ["Work"], renamed: 3 });
    expect(parsed).toEqual({ custom: [], hidden: ["Work"], renamed: {} });
    expect(parseCategoriesState({ custom: [], hidden: {}, renamed: { Work: "W" } })).toEqual({ custom: [], hidden: [], renamed: { Work: "W" } });
  });
  test("bad custom entries are dropped one by one", () => {
    const parsed = parseCategoriesState({
      custom: [
        { id: "c_aaaaaaaa", name: "Good", color: "lime", icon: "leaf-outline" },
        { id: "Work", name: "Hijack", color: "lime", icon: "leaf-outline" },
        { id: "c_bbbbbbbb", name: "   ", color: "lime", icon: "leaf-outline" },
        { id: "c_aaaaaaaa", name: "Same id", color: "lime", icon: "leaf-outline" },
        { id: "c_cccccccc", name: "good", color: "lime", icon: "leaf-outline" },
        "junk",
        null,
        { id: "c_dddddddd", name: "x".repeat(60), color: "bogus", icon: "bogus" },
      ],
    });
    expect(parsed.custom).toEqual([
      { id: "c_aaaaaaaa", name: "Good", color: "lime", icon: "leaf-outline" },
      { id: "c_dddddddd", name: "x".repeat(MAX_NAME_LENGTH), color: "violet", icon: "star-outline" },
    ]);
  });
  test("custom categories are capped at MAX_CUSTOM", () => {
    const many = Array.from({ length: MAX_CUSTOM + 5 }, (_, i) => custom(`c_${String(i).padStart(8, "0")}`, `Name ${i}`));
    expect(parseCategoriesState({ custom: many }).custom).toHaveLength(MAX_CUSTOM);
  });
  test("hidden keeps only unique built-in ids, renamed only non-empty built-in overrides", () => {
    const parsed = parseCategoriesState({
      hidden: ["Work", "Work", "c_aaaaaaaa", 5, "Nope"],
      renamed: { Focus: "  Deep   work ", Work: "", Personal: 5, c_aaaaaaaa: "X", Wellness: "y".repeat(80), __proto__: "x" },
    });
    expect(parsed.hidden).toEqual(["Work"]);
    expect(parsed.renamed).toEqual({ Focus: "Deep work", Wellness: "y".repeat(MAX_NAME_LENGTH) });
  });
  test("hiding every category is undone so something stays visible", () => {
    expect(parseCategoriesState({ hidden: [...BUILTIN_CATEGORIES] }).hidden).toEqual([]);
    const withCustom = parseCategoriesState({ hidden: [...BUILTIN_CATEGORIES], custom: [custom("c_aaaaaaaa", "G")] });
    expect(withCustom.hidden).toEqual([...BUILTIN_CATEGORIES]);
  });
  test("exposes the schema itself", () => {
    expect(categoriesStateSchema.parse({})).toEqual(DEFAULT_CATEGORIES_STATE);
  });
});

describe("parseCategoriesText", () => {
  test("unparseable or non-object text is invalid and gives defaults", () => {
    expect(parseCategoriesText("{oops")).toEqual({ valid: false, lossy: false, state: DEFAULT_CATEGORIES_STATE });
    expect(parseCategoriesText("[1]")).toEqual({ valid: false, lossy: false, state: DEFAULT_CATEGORIES_STATE });
    expect(parseCategoriesText("null").valid).toBe(false);
  });
  test("clean data is valid and not lossy", () => {
    const state: CategoriesState = { custom: [custom("c_aaaaaaaa", "Gym")], hidden: [], renamed: {} };
    expect(parseCategoriesText(JSON.stringify(state))).toEqual({ valid: true, lossy: false, state });
    expect(parseCategoriesText("{}")).toEqual({ valid: true, lossy: false, state: DEFAULT_CATEGORIES_STATE });
  });
  test("data that had to be repaired is lossy", () => {
    const result = parseCategoriesText(JSON.stringify({ custom: [{ id: "x" }], hidden: [], renamed: {} }));
    expect(result).toEqual({ valid: true, lossy: true, state: DEFAULT_CATEGORIES_STATE });
  });
});

describe("hasCategoryCustomizations", () => {
  test("is false only for the pristine state", () => {
    expect(hasCategoryCustomizations(DEFAULT_CATEGORIES_STATE)).toBe(false);
    expect(hasCategoryCustomizations(stateOf({ custom: [custom("c_aaaaaaaa", "G")] }))).toBe(true);
    expect(hasCategoryCustomizations(stateOf({ hidden: ["Work"] }))).toBe(true);
    expect(hasCategoryCustomizations(stateOf({ renamed: { Work: "W" } }))).toBe(true);
  });
});

describe("mergeCategoriesState", () => {
  const current = stateOf({ custom: [custom("c_aaaaaaaa", "Gym")], hidden: ["Focus"], renamed: { Work: "Day job" } });
  const incoming = stateOf({
    custom: [custom("c_aaaaaaaa", "Other name"), custom("c_bbbbbbbb", "Art"), custom("c_cccccccc", "gym")],
    hidden: ["Personal"],
    renamed: { Work: "Office", Wellness: "Health" },
  });
  test("replace takes the incoming state", () => {
    expect(mergeCategoriesState(current, incoming, "replace")).toEqual(incoming);
  });
  test("merge keeps current choices and adds only new, non-clashing custom categories", () => {
    const merged = mergeCategoriesState(current, incoming, "merge");
    expect(merged.custom.map(item => item.id)).toEqual(["c_aaaaaaaa", "c_bbbbbbbb"]);
    expect(merged.custom[0].name).toBe("Gym");
    expect(merged.hidden).toEqual(["Focus"]);
    expect(merged.renamed).toEqual({ Work: "Day job", Wellness: "Health" });
  });
  test("merge respects MAX_CUSTOM", () => {
    const nearly = stateOf({ custom: Array.from({ length: MAX_CUSTOM - 1 }, (_, i) => custom(`c_${String(i).padStart(8, "0")}`, `N${i}`)) });
    const extra = stateOf({ custom: [custom("c_x0000001", "A"), custom("c_x0000002", "B")] });
    expect(mergeCategoriesState(nearly, extra, "merge").custom).toHaveLength(MAX_CUSTOM);
  });
  test("merge returns the same state when nothing new arrives", () => {
    expect(mergeCategoriesState(current, DEFAULT_CATEGORIES_STATE, "merge")).toBe(current);
  });
});

describe("canonical order of saved state", () => {
  // The store flags stored text as "lossy" when parsing changes it, so what we save must already be in parse order.
  const settle = (state: CategoriesState) => parseCategoriesText(JSON.stringify(state));

  test("hiding built-ins in any click order is saved in the canonical order and reads back unchanged", () => {
    const first = hideBuiltin(DEFAULT_CATEGORIES_STATE, "Work");
    if (!first.ok) throw new Error("hide Work failed");
    const second = hideBuiltin(first.state, "Focus");
    if (!second.ok) throw new Error("hide Focus failed");
    expect(second.state.hidden).toEqual(["Focus", "Work"]);
    expect(settle(second.state).lossy).toBe(false);
  });

  test("renaming built-ins in any order is saved in the canonical order and reads back unchanged", () => {
    const first = renameBuiltin(DEFAULT_CATEGORIES_STATE, "Wellness", "Health");
    if (!first.ok) throw new Error("rename Wellness failed");
    const second = renameBuiltin(first.state, "Focus", "Deep work");
    if (!second.ok) throw new Error("rename Focus failed");
    expect(Object.keys(second.state.renamed)).toEqual(["Focus", "Wellness"]);
    expect(settle(second.state).lossy).toBe(false);
  });

  test("a merge that brings renames in keeps the canonical order", () => {
    const current = stateOf({ renamed: { Wellness: "Health" } });
    const merged = mergeCategoriesState(current, stateOf({ renamed: { Focus: "Deep work" } }), "merge");
    expect(Object.keys(merged.renamed)).toEqual(["Focus", "Wellness"]);
    expect(settle(merged).lossy).toBe(false);
  });
});
