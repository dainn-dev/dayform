import { z } from "zod";
import { parseJson } from "./json";
import { BUILTIN_CATEGORIES, categoryStyle, type BuiltinCategory } from "./planner";
import { sanitizeLine } from "./settings";

export const MAX_CUSTOM = 12;
export const MAX_NAME_LENGTH = 24;
/** Bound on raw input before it is judged, so absurd pastes never reach the comparison code. */
const RAW_NAME_CAP = 200;
const ID_ATTEMPTS = 5;
const ID_LENGTH = 8;
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const CUSTOM_ID_PATTERN = /^c_[a-z0-9]{4,32}$/;
const COMBINING_MARKS = /\p{M}/gu;
const FALLBACK_NAME = "Other";
const FALLBACK_STYLE: BuiltinCategory = "Personal";

/** Hue slots of the palette (`category` in constants/palettes.ts has one `{ bg, accent }` per slot and scheme). */
export const COLOR_SLOTS = ["violet", "sky", "mint", "lime", "amber", "coral", "magenta", "slate"] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

/** Ionicons outline names offered for custom categories (components cast them to the Ionicons name type). */
export const ICON_KEYS = [
  "star-outline", "book-outline", "cart-outline", "home-outline", "musical-notes-outline", "barbell-outline",
  "school-outline", "cafe-outline", "airplane-outline", "game-controller-outline", "paw-outline", "wallet-outline",
  "camera-outline", "leaf-outline", "pricetag-outline", "heart-outline",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export const DEFAULT_COLOR_SLOT: ColorSlot = "violet";
export const DEFAULT_ICON: IconKey = "star-outline";

export type CustomCategory = { id: string; name: string; color: ColorSlot; icon: IconKey };
export type CategoriesState = {
  custom: CustomCategory[];
  /** Built-in ids the user hid from pickers; tasks that use them still render. */
  hidden: string[];
  /** Built-in id -> the user's own name (user content: never translated). */
  renamed: Record<string, string>;
};

export const DEFAULT_CATEGORIES_STATE: CategoriesState = { custom: [], hidden: [], renamed: {} };

export type Translate = (text: string) => string;
const identity: Translate = text => text;

export type CategoryFailure =
  | "empty" | "too-long" | "duplicate" | "limit" | "invalid-style"
  | "unknown-category" | "not-builtin" | "last-visible" | "id-collision";
export type CategoryResult =
  | { ok: true; state: CategoriesState; id?: string }
  | { ok: false; reason: CategoryFailure };

export type NameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" | "duplicate" | "limit" };
export type NameOptions = { translate?: Translate; ignoreId?: string };

// --- Names -----------------------------------------------------------------------------------------------------

/** Control, invisible and bidi characters removed, whitespace collapsed, trimmed. Length is judged separately. */
export function normalizeCategoryName(text: string): string {
  return sanitizeLine(text, RAW_NAME_CAP);
}

function truncateName(name: string): string {
  return Array.from(name).slice(0, MAX_NAME_LENGTH).join("").trim();
}

/** Comparison form: lowercase, accents removed, "đ" folded to "d". */
function nameKey(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/đ/g, "d");
}

export function isBuiltinId(id: string): id is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(id);
}

/** Every name another category already shows, as comparison keys. */
function takenKeys(state: CategoriesState, translate: Translate, ignoreId: string | undefined): Set<string> {
  const keys = new Set<string>();
  for (const id of BUILTIN_CATEGORIES) {
    if (id === ignoreId) continue;
    keys.add(nameKey(id));
    keys.add(nameKey(translate(id)));
    const renamed = state.renamed[id];
    if (renamed !== undefined) keys.add(nameKey(renamed));
  }
  for (const item of state.custom) if (item.id !== ignoreId) keys.add(nameKey(item.name));
  return keys;
}

/** Empty, too long and duplicate names (case/accent-insensitive, built-in display names included) are refused. */
export function validateCategoryName(name: string, state: CategoriesState, options: NameOptions = {}): NameCheck {
  const clean = normalizeCategoryName(name);
  if (clean === "") return { ok: false, reason: "empty" };
  if (Array.from(clean).length > MAX_NAME_LENGTH) return { ok: false, reason: "too-long" };
  const taken = takenKeys(state, options.translate ?? identity, options.ignoreId);
  return taken.has(nameKey(clean)) ? { ok: false, reason: "duplicate" } : { ok: true, name: clean };
}

export function validateNewCategory(name: string, state: CategoriesState, options: NameOptions = {}): NameCheck {
  if (state.custom.length >= MAX_CUSTOM) return { ok: false, reason: "limit" };
  return validateCategoryName(name, state, options);
}

/** `c_` plus 8 random base36 characters. `random` is injectable for tests. */
export function generateCategoryId(random: () => number = Math.random): string {
  let id = "c_";
  for (let i = 0; i < ID_LENGTH; i += 1) id += BASE36[Math.min(BASE36.length - 1, Math.floor(random() * BASE36.length))];
  return id;
}

// --- Reading ---------------------------------------------------------------------------------------------------

/** Built-ins not hidden, in their fixed order, then custom categories in creation order. */
export function visibleCategories(state: CategoriesState): string[] {
  const builtins = BUILTIN_CATEGORIES.filter(id => !state.hidden.includes(id));
  return [...builtins, ...state.custom.map(item => item.id)];
}

/** Every known id, hidden built-ins included (for the manage screen). */
export function allCategoryIds(state: CategoriesState): string[] {
  return [...BUILTIN_CATEGORIES, ...state.custom.map(item => item.id)];
}

export type ResolvedCategory = {
  id: string;
  /** User content (custom/renamed) or the built-in's English default; translate only when `translatable`. */
  name: string;
  translatable: boolean;
  /** Key into the palette's `category` map. */
  colorKey: string;
  icon: string;
  known: boolean;
  builtin: boolean;
};

/** Never throws: an unknown id (a deleted category, a newer backup) renders as "Other" with Personal styling. */
export function resolveCategory(id: string, state: CategoriesState): ResolvedCategory {
  if (isBuiltinId(id)) {
    const renamed = Object.hasOwn(state.renamed, id) ? state.renamed[id] : undefined;
    return {
      id, name: renamed ?? id, translatable: renamed === undefined,
      colorKey: id, icon: categoryStyle[id].icon, known: true, builtin: true,
    };
  }
  const found = state.custom.find(item => item.id === id);
  if (found) {
    return { id, name: found.name, translatable: false, colorKey: found.color, icon: found.icon, known: true, builtin: false };
  }
  return {
    id, name: FALLBACK_NAME, translatable: true,
    colorKey: FALLBACK_STYLE, icon: categoryStyle[FALLBACK_STYLE].icon, known: false, builtin: false,
  };
}

/** User-chosen names are never translated; built-in defaults and "Other" are. */
export function categoryLabel(id: string, state: CategoriesState, translate: Translate): string {
  const { name, translatable } = resolveCategory(id, state);
  return translatable ? translate(name) : name;
}

export type PaletteCategoryColors = Readonly<Record<string, { readonly bg: string; readonly accent: string }>>;
export type CategoryColors = { bg: string; accent: string; icon: string };

export function colorsFor(resolved: ResolvedCategory, palette: PaletteCategoryColors): CategoryColors {
  const { bg, accent } = palette[resolved.colorKey] ?? palette[FALLBACK_STYLE];
  return { bg, accent, icon: resolved.icon };
}

export function hasCategoryCustomizations(state: CategoriesState): boolean {
  return state.custom.length > 0 || state.hidden.length > 0 || Object.keys(state.renamed).length > 0;
}

// --- Changing --------------------------------------------------------------------------------------------------

const fail = (reason: CategoryFailure): CategoryResult => ({ ok: false, reason });
const ok = (state: CategoriesState, id?: string): CategoryResult => (id === undefined ? { ok: true, state } : { ok: true, state, id });
const isColor = (value: string): value is ColorSlot => (COLOR_SLOTS as readonly string[]).includes(value);
const isIcon = (value: string): value is IconKey => (ICON_KEYS as readonly string[]).includes(value);

function freshId(state: CategoriesState, generateId: () => string): string | null {
  const taken = new Set(state.custom.map(item => item.id));
  for (let attempt = 0; attempt < ID_ATTEMPTS; attempt += 1) {
    const id = generateId();
    if (!taken.has(id)) return id;
  }
  return null;
}

export type NewCategoryInput = { name: string; color: ColorSlot; icon: IconKey };
export type AddOptions = { translate?: Translate; generateId?: () => string };

export function addCategory(state: CategoriesState, input: NewCategoryInput, options: AddOptions = {}): CategoryResult {
  const named = validateNewCategory(input.name, state, { translate: options.translate });
  if (!named.ok) return fail(named.reason);
  if (!isColor(input.color) || !isIcon(input.icon)) return fail("invalid-style");
  const id = freshId(state, options.generateId ?? generateCategoryId);
  if (id === null) return fail("id-collision");
  const added: CustomCategory = { id, name: named.name, color: input.color, icon: input.icon };
  return ok({ ...state, custom: [...state.custom, added] }, id);
}

export function updateCategory(
  state: CategoriesState,
  id: string,
  patch: Partial<NewCategoryInput>,
  options: { translate?: Translate } = {},
): CategoryResult {
  const existing = state.custom.find(item => item.id === id);
  if (!existing) return fail("unknown-category");
  let name = existing.name;
  if (patch.name !== undefined) {
    const named = validateCategoryName(patch.name, state, { translate: options.translate, ignoreId: id });
    if (!named.ok) return fail(named.reason);
    name = named.name;
  }
  const color = patch.color ?? existing.color;
  const icon = patch.icon ?? existing.icon;
  if (!isColor(color) || !isIcon(icon)) return fail("invalid-style");
  const next: CustomCategory = { id, name, color, icon };
  return ok({ ...state, custom: state.custom.map(item => (item.id === id ? next : item)) }, id);
}

/** Refused when it would leave nothing visible. */
export function removeCategory(state: CategoriesState, id: string): CategoryResult {
  if (!state.custom.some(item => item.id === id)) return fail("unknown-category");
  const next = { ...state, custom: state.custom.filter(item => item.id !== id) };
  if (visibleCategories(next).length === 0) return fail("last-visible");
  return ok(next, id);
}

export function hideBuiltin(state: CategoriesState, id: string): CategoryResult {
  if (!isBuiltinId(id)) return fail("not-builtin");
  if (state.hidden.includes(id)) return ok(state, id);
  const next = { ...state, hidden: cleanHidden([...state.hidden, id]) };
  if (visibleCategories(next).length === 0) return fail("last-visible");
  return ok(next, id);
}

export function showBuiltin(state: CategoriesState, id: string): CategoryResult {
  if (!isBuiltinId(id)) return fail("not-builtin");
  if (!state.hidden.includes(id)) return ok(state, id);
  return ok({ ...state, hidden: state.hidden.filter(item => item !== id) }, id);
}

/** An empty name, or the built-in's own default name, removes the override. */
export function renameBuiltin(
  state: CategoriesState,
  id: string,
  name: string,
  options: { translate?: Translate } = {},
): CategoryResult {
  if (!isBuiltinId(id)) return fail("not-builtin");
  const translate = options.translate ?? identity;
  const clean = normalizeCategoryName(name);
  const isDefault = clean === "" || nameKey(clean) === nameKey(id) || nameKey(clean) === nameKey(translate(id));
  if (isDefault) return ok(withoutRename(state, id), id);
  const named = validateCategoryName(clean, state, { translate, ignoreId: id });
  if (!named.ok) return fail(named.reason);
  return ok({ ...state, renamed: cleanRenamed({ ...state.renamed, [id]: named.name }) }, id);
}

function withoutRename(state: CategoriesState, id: string): CategoriesState {
  if (!Object.hasOwn(state.renamed, id)) return state;
  const renamed = Object.fromEntries(Object.entries(state.renamed).filter(([key]) => key !== id));
  return { ...state, renamed };
}

/** Where the tasks of a category that is being deleted should go: the first other visible category. */
export function reassignOnDelete(state: CategoriesState, deletedId: string): string {
  return visibleCategories(state).find(id => id !== deletedId) ?? BUILTIN_CATEGORIES[0];
}

/**
 * Applies a backup's categories. `replace` takes them as they are; `merge` keeps every current choice and only
 * adds custom categories (and built-in renames) it does not already have, up to MAX_CUSTOM.
 */
export function mergeCategoriesState(
  current: CategoriesState,
  incoming: CategoriesState,
  mode: "merge" | "replace",
): CategoriesState {
  if (mode === "replace") return incoming;
  const ids = new Set(current.custom.map(item => item.id));
  const names = new Set(current.custom.map(item => nameKey(item.name)));
  const added: CustomCategory[] = [];
  for (const item of incoming.custom) {
    if (current.custom.length + added.length >= MAX_CUSTOM) break;
    if (ids.has(item.id) || names.has(nameKey(item.name))) continue;
    added.push(item);
  }
  const renamed = cleanRenamed({ ...incoming.renamed, ...current.renamed });
  const gainsRename = Object.keys(renamed).length > Object.keys(current.renamed).length;
  if (added.length === 0 && !gainsRename) return current;
  return { custom: [...current.custom, ...added], hidden: current.hidden, renamed };
}

// --- Parsing ---------------------------------------------------------------------------------------------------

const customItemSchema = z.object({
  id: z.string().regex(CUSTOM_ID_PATTERN),
  name: z.string().transform(text => truncateName(normalizeCategoryName(text))).pipe(z.string().min(1)),
  color: z.enum(COLOR_SLOTS).catch(DEFAULT_COLOR_SLOT),
  icon: z.enum(ICON_KEYS).catch(DEFAULT_ICON),
});

/** One bad entry never rejects its siblings; duplicate ids and names are dropped; at most MAX_CUSTOM are kept. */
function cleanCustom(items: unknown[]): CustomCategory[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  const result: CustomCategory[] = [];
  for (const item of items) {
    const parsed = customItemSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id) || names.has(nameKey(parsed.data.name))) continue;
    ids.add(parsed.data.id);
    names.add(nameKey(parsed.data.name));
    result.push(parsed.data);
    if (result.length >= MAX_CUSTOM) break;
  }
  return result;
}

function cleanHidden(items: unknown[]): string[] {
  return BUILTIN_CATEGORIES.filter(id => items.includes(id));
}

function cleanRenamed(record: Record<string, unknown>): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const id of BUILTIN_CATEGORIES) {
    const value = Object.hasOwn(record, id) ? record[id] : undefined;
    const name = typeof value === "string" ? truncateName(normalizeCategoryName(value)) : "";
    if (name !== "") entries.push([id, name]);
  }
  return Object.fromEntries(entries);
}

/** Something must stay visible: if the data hides everything, the hidden list is dropped. */
function keepSomethingVisible(state: CategoriesState): CategoriesState {
  return visibleCategories(state).length === 0 ? { ...state, hidden: [] } : state;
}

/** Every field has its own fallback, so one bad value never rejects the others. */
export const categoriesStateSchema = z
  .object({
    custom: z.array(z.unknown()).catch([]).transform(cleanCustom),
    hidden: z.array(z.unknown()).catch([]).transform(cleanHidden),
    renamed: z.record(z.string(), z.unknown()).catch({}).transform(cleanRenamed),
  })
  .transform(keepSomethingVisible)
  .catch(() => ({ custom: [], hidden: [], renamed: {} }));

/** Never throws: anything unusable resolves to the defaults, field by field. */
export function parseCategoriesState(raw: unknown): CategoriesState {
  return categoriesStateSchema.parse(raw);
}

export type ParsedCategories = {
  /** False when the text is not a JSON object (the state is then the defaults). */
  valid: boolean;
  /** True when some stored value had to be repaired or dropped, so a copy of the original is worth keeping. */
  lossy: boolean;
  state: CategoriesState;
};

export function parseCategoriesText(text: string): ParsedCategories {
  const json = parseJson(text);
  if (!json.ok || typeof json.value !== "object" || json.value === null || Array.isArray(json.value)) {
    return { valid: false, lossy: false, state: DEFAULT_CATEGORIES_STATE };
  }
  const raw = json.value as Record<string, unknown>;
  const state = parseCategoriesState(raw);
  const known = { custom: raw.custom ?? [], hidden: raw.hidden ?? [], renamed: raw.renamed ?? {} };
  return { valid: true, lossy: JSON.stringify(state) !== JSON.stringify(known), state };
}
