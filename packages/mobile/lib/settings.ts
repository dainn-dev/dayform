import { z } from "zod";
import { reminderOptions } from "./planner";
import type { KeyValueStorage } from "./task-storage";

export const SETTINGS_KEY = "dayform.settings.v1";
export const MAX_NAME_LENGTH = 40;
export const MAX_SLOGAN_LENGTH = 60;
const MAX_CATEGORY_LENGTH = 40;

export const ACCENT_IDS = ["violet", "ocean", "lagoon", "forest", "sunset", "blossom"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export const SNOOZE_OPTIONS = [5, 10, 15] as const;

const DEFAULT_DAY_START = 360;
const DEFAULT_DAY_END = 1320;
const MIN_DAY_SPAN = 240;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// --- Text sanitising -------------------------------------------------------------------------------------------
// Whitespace (tab, newline, no-break space ...) becomes one space; other control characters and invisible or bidi
// formatting characters are dropped. Zero-width (non-)joiners stay so emoji sequences and some scripts survive.
const WHITESPACE = /\s+/g;
const INVISIBLE = /[\p{Cc}­؜᠎​‎‏‪-‮⁠-⁤⁦-⁩]/gu;

export function sanitizeLine(text: unknown, maxLength: number): string {
  if (typeof text !== "string") return "";
  const cleaned = text.replace(WHITESPACE, " ").replace(INVISIBLE, "").replace(WHITESPACE, " ").trim();
  return Array.from(cleaned).slice(0, maxLength).join("").trim();
}

/** Display name: control/bidi characters removed, whitespace collapsed, trimmed, at most 40 code points. */
export function normalizeName(text: string): string {
  return sanitizeLine(text, MAX_NAME_LENGTH);
}

/** Custom greeting slogan: sanitised like a name, at most 60 code points. */
export function normalizeSlogan(text: string): string {
  return sanitizeLine(text, MAX_SLOGAN_LENGTH);
}

/** Upper-cased first character (code point) of the name for the avatar; "?" when there is no name. */
export function nameInitial(name: string): string {
  const [first] = Array.from(normalizeName(name));
  return first === undefined ? "?" : first.toLocaleUpperCase();
}

export function isValidName(text: string): boolean {
  return normalizeName(text) !== "";
}

// --- Schema ----------------------------------------------------------------------------------------------------
// Every field carries its own default through `.catch`, so one bad value never rejects its siblings or its group.
const flag = (fallback: boolean) => z.boolean().catch(fallback);
const timeOfDay = (fallback: string) => z.string().regex(TIME_PATTERN).catch(fallback);
const choice = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.enum(values).catch(fallback);
const numberFrom = <T extends number>(values: readonly T[], fallback: T) =>
  z.custom<T>(value => typeof value === "number" && (values as readonly number[]).includes(value)).catch(fallback);
const cleanText = (clean: (text: string) => string) => z.string().transform(clean).catch("");

const minuteOfDay = (fallback: number) =>
  z.number().int().min(0).max(MINUTES_PER_DAY).refine(value => value % MINUTES_PER_HOUR === 0).catch(fallback);

const reminder = z
  .custom<number | null>(value => value === null || (typeof value === "number" && (reminderOptions as readonly number[]).includes(value)))
  .catch(null);

const categoryName = z.string().min(1).max(MAX_CATEGORY_LENGTH).catch("Focus");

function isWholeHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MINUTES_PER_DAY && value % MINUTES_PER_HOUR === 0;
}

/** The pair is judged as a whole: any bad value, or a span under 4 hours, clears both so both fall back together. */
function judgeDayRange(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;
  const start = raw.dayStart ?? DEFAULT_DAY_START;
  const end = raw.dayEnd ?? DEFAULT_DAY_END;
  const valid = isWholeHour(start) && isWholeHour(end) && end - start >= MIN_DAY_SPAN;
  return valid ? raw : { ...raw, dayStart: undefined, dayEnd: undefined };
}

const profileSchema = z.object({ name: cleanText(normalizeName) });
const defaultsSchema = z.object({
  duration: numberFrom(DURATION_OPTIONS, 30),
  category: categoryName,
  remind: reminder,
  scheduleNew: flag(false),
  startMode: choice(["next-hour", "fixed"], "fixed"),
  startFixed: timeOfDay("09:00"),
});
const notificationsSchema = z.object({
  quietEnabled: flag(false),
  quietFrom: timeOfDay("22:00"),
  quietTo: timeOfDay("07:00"),
  hideTitles: flag(false),
  snoozeMinutes: numberFrom(SNOOZE_OPTIONS, 10),
  summaryEnabled: flag(false),
  summaryTime: timeOfDay("08:00"),
});
const greetingSchema = z.object({
  showName: flag(true),
  sloganStyle: choice(["rotate", "custom", "off"], "rotate"),
  customSlogan: cleanText(normalizeSlogan),
});
const calendarSchema = z.preprocess(
  judgeDayRange,
  z.object({
    dayStart: minuteOfDay(DEFAULT_DAY_START),
    dayEnd: minuteOfDay(DEFAULT_DAY_END),
    hourHeight: choice(["compact", "normal", "roomy"], "normal"),
    weekStart: choice(["mon", "sun", "sat"], "mon"),
    timeFormat: choice(["auto", "12h", "24h"], "auto"),
  }),
);

/** A group that is missing or not an object resolves to the group's own defaults. */
const group = <S extends z.ZodType>(schema: S): z.ZodCatch<S> =>
  schema.catch(() => (schema as z.ZodType).parse({}) as z.output<S>);

const settingsSchema = z.object({
  profile: group(profileSchema),
  accent: choice(ACCENT_IDS, "violet"),
  defaults: group(defaultsSchema),
  notifications: group(notificationsSchema),
  greeting: group(greetingSchema),
  calendar: group(calendarSchema),
  habits: group(z.object({ hints: flag(true) })),
  widget: group(z.object({ showTitles: flag(true) })),
});

/** All fields required: what the app reads after resolution. */
export type Settings = z.output<typeof settingsSchema>;

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Never throws: anything unusable resolves to defaults, field by field. Unknown keys are dropped. */
export function resolveSettings(raw: unknown): Settings {
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export type ParsedSettings = { valid: boolean; settings: Settings };

/** `valid` is false when the text is not a JSON object; the settings are then all defaults. */
export function parseSettings(text: string): ParsedSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { valid: false, settings: resolveSettings({}) };
  }
  if (!isPlainObject(raw)) return { valid: false, settings: resolveSettings({}) };
  return { valid: true, settings: resolveSettings(raw) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Known keys only; a patch value of the wrong shape for a group is ignored. */
function deepMerge(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === undefined || !Object.hasOwn(current, key)) continue;
    const existing = current[key];
    if (isPlainObject(existing)) {
      if (isPlainObject(value)) result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Immutable update. The merged object is re-validated, so a bad patched value falls back to its default.
 * Returns `current` itself when nothing changed (keeps store state referentially stable).
 */
export function mergeSettings(current: Settings, patch: DeepPartial<Settings>): Settings {
  const merged = resolveSettings(deepMerge(current, patch as Record<string, unknown>));
  const keys = Object.keys(merged) as Array<keyof Settings>;
  const unchanged = (key: keyof Settings) => JSON.stringify(merged[key]) === JSON.stringify(current[key]);
  if (keys.every(unchanged)) return current;
  // Untouched groups keep their old reference so memoised consumers do not re-render.
  return Object.fromEntries(keys.map(key => [key, unchanged(key) ? current[key] : merged[key]])) as Settings;
}

// --- Persistence -----------------------------------------------------------------------------------------------
export type LoadSettingsResult = {
  status: "loaded" | "missing" | "invalid" | "read-failed";
  settings: Settings;
};
export type SaveSettingsResult = { ok: true } | { ok: false; reason: "write-failed" };

/** Never writes: a missing, unreadable or invalid value just means defaults. */
export async function loadSettings(storage: KeyValueStorage): Promise<LoadSettingsResult> {
  let text: string | null;
  try {
    text = await storage.getItem(SETTINGS_KEY);
  } catch {
    return { status: "read-failed", settings: resolveSettings({}) };
  }
  if (text === null) return { status: "missing", settings: resolveSettings({}) };
  const parsed = parseSettings(text);
  return { status: parsed.valid ? "loaded" : "invalid", settings: parsed.settings };
}

export async function saveSettings(storage: KeyValueStorage, settings: Settings): Promise<SaveSettingsResult> {
  try {
    await storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}
