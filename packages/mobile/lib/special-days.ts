import { z } from "zod";
import { lunarDaysInMonth, lunarToSolar, LUNAR_FIRST_YEAR, LUNAR_LAST_YEAR } from "./lunar";
import { sanitizeLine } from "./settings";
import { fillPlaceholders } from "./text-template";

/**
 * The user's own special days: birthdays, wedding anniversaries, death anniversaries (giỗ) and anything else that
 * comes back every year, on a solar or a lunar date. Pure: no React and no storage (lib/special-days-store.ts keeps
 * them). A lunar day always uses the regular month of its number, also for a day first set in a leap month, and the
 * 30th of a lunar month that has 29 days falls on the 29th.
 */
export const SPECIAL_KINDS = ["birthday", "wedding", "memorial", "custom"] as const;
export type SpecialKind = (typeof SPECIAL_KINDS)[number];
export const SPECIAL_CALENDARS = ["solar", "lunar"] as const;
export type SpecialCalendar = (typeof SPECIAL_CALENDARS)[number];
/** none: no notification; day-before and same-day notify at 08:00 (lib/special-reminders.ts). */
export const SPECIAL_REMINDS = ["none", "day-before", "same-day"] as const;
export type SpecialRemind = (typeof SPECIAL_REMINDS)[number];

export const MAX_SPECIAL_DAYS = 200;
export const MAX_SPECIAL_TITLE = 60;

export type SpecialDay = {
  /** `s_` and eight lowercase letters or digits. */
  id: string;
  /** The user's own text: never translated. */
  title: string;
  kind: SpecialKind;
  calendar: SpecialCalendar;
  month: number;
  day: number;
  /** The year it first happened (in the day's own calendar), to say "turns 30" or "10 years"; null when unknown. */
  startYear: number | null;
  remind: SpecialRemind;
};
export type SpecialDayInput = Omit<SpecialDay, "id">;
export type SpecialDaysState = { items: SpecialDay[] };

export const DEFAULT_SPECIAL_DAYS_STATE: SpecialDaysState = { items: [] };

export type SpecialDayFailure = "invalid-title" | "invalid-date" | "limit" | "unknown";
export type SpecialDayResult = { ok: true; state: SpecialDaysState; id?: string } | { ok: false; reason: SpecialDayFailure };

const ID_PATTERN = /^s_[a-z0-9]{8}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 8;
const FIRST_YEAR = LUNAR_FIRST_YEAR;
const LAST_YEAR = LUNAR_LAST_YEAR;
const MAX_LUNAR_DAY = 30;
const MS_PER_DAY = 86_400_000;
/** Most days in each solar month, with 29 February allowed (someone born on it has a birthday every year). */
const SOLAR_MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function generateSpecialDayId(random: () => number = Math.random): string {
  let id = "s_";
  for (let i = 0; i < ID_LENGTH; i += 1) id += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.floor(random() * ID_ALPHABET.length))];
  return id;
}

export function isValidMonthDay(calendar: SpecialCalendar, month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  return day <= (calendar === "lunar" ? MAX_LUNAR_DAY : SOLAR_MONTH_DAYS[month - 1]);
}

function validYear(year: number | null): boolean {
  return year === null || (Number.isInteger(year) && year >= FIRST_YEAR && year <= LAST_YEAR);
}

// --- Parsing ---------------------------------------------------------------------------------------------------
const recordSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  title: z.string(),
  kind: z.enum(SPECIAL_KINDS),
  calendar: z.enum(SPECIAL_CALENDARS),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(MAX_LUNAR_DAY + 1),
  startYear: z.number().int().min(FIRST_YEAR).max(LAST_YEAR).nullable().catch(null),
  remind: z.enum(SPECIAL_REMINDS).catch("none"),
});

function parseItem(raw: unknown): SpecialDay | null {
  const result = recordSchema.safeParse(raw);
  if (!result.success) return null;
  const title = sanitizeLine(result.data.title, MAX_SPECIAL_TITLE);
  if (title === "" || !isValidMonthDay(result.data.calendar, result.data.month, result.data.day)) return null;
  return { ...result.data, title };
}

/** Keeps the records that are valid, once each by id, up to the limit; `lossy` says something was left out. */
export function parseSpecialDaysState(raw: unknown): { state: SpecialDaysState; lossy: boolean } {
  const list = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as { items?: unknown }).items : undefined;
  if (list === undefined) return { state: DEFAULT_SPECIAL_DAYS_STATE, lossy: false };
  if (!Array.isArray(list)) return { state: DEFAULT_SPECIAL_DAYS_STATE, lossy: true };
  const items: SpecialDay[] = [];
  const seen = new Set<string>();
  let lossy = false;
  for (const entry of list) {
    const parsed = parseItem(entry);
    if (parsed === null || seen.has(parsed.id) || items.length >= MAX_SPECIAL_DAYS) {
      lossy = true;
      continue;
    }
    seen.add(parsed.id);
    items.push(parsed);
  }
  return { state: { items }, lossy };
}

export type ParsedSpecialDays = { valid: boolean; lossy: boolean; state: SpecialDaysState };

/** `valid` is false when the text is not a JSON object; the state is then empty. */
export function parseSpecialDaysText(text: string): ParsedSpecialDays {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { valid: false, lossy: false, state: DEFAULT_SPECIAL_DAYS_STATE };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { valid: false, lossy: false, state: DEFAULT_SPECIAL_DAYS_STATE };
  return { valid: true, ...parseSpecialDaysState(raw) };
}

// --- Changes (all return a new state, never edit the one they get) ----------------------------------------------
function validate(input: SpecialDayInput): { ok: true; input: SpecialDayInput } | { ok: false; reason: SpecialDayFailure } {
  const title = sanitizeLine(input.title, MAX_SPECIAL_TITLE);
  if (title === "") return { ok: false, reason: "invalid-title" };
  if (!isValidMonthDay(input.calendar, input.month, input.day) || !validYear(input.startYear)) return { ok: false, reason: "invalid-date" };
  return { ok: true, input: { ...input, title } };
}

export function addSpecialDay(state: SpecialDaysState, input: SpecialDayInput, random: () => number = Math.random): SpecialDayResult {
  if (state.items.length >= MAX_SPECIAL_DAYS) return { ok: false, reason: "limit" };
  const checked = validate(input);
  if (!checked.ok) return checked;
  const taken = new Set(state.items.map(entry => entry.id));
  let id = generateSpecialDayId(random);
  while (taken.has(id)) id = generateSpecialDayId(random);
  return { ok: true, state: { items: [...state.items, { id, ...checked.input }] }, id };
}

export function updateSpecialDay(state: SpecialDaysState, id: string, patch: Partial<SpecialDayInput>): SpecialDayResult {
  const current = state.items.find(entry => entry.id === id);
  if (current === undefined) return { ok: false, reason: "unknown" };
  const { id: _unchanged, ...fields } = current;
  const checked = validate({ ...fields, ...patch });
  if (!checked.ok) return checked;
  return { ok: true, state: { items: state.items.map(entry => (entry.id === id ? { id, ...checked.input } : entry)) }, id };
}

export function removeSpecialDay(state: SpecialDaysState, id: string): SpecialDayResult {
  if (!state.items.some(entry => entry.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.filter(entry => entry.id !== id) } };
}

/** merge: keep the current days and add the ones of the file that are new (by id) while there is room; replace: the file's. */
export function mergeSpecialDaysState(current: SpecialDaysState, incoming: SpecialDaysState, mode: "merge" | "replace"): SpecialDaysState {
  if (mode === "replace") return incoming;
  const known = new Set(current.items.map(entry => entry.id));
  const room = Math.max(0, MAX_SPECIAL_DAYS - current.items.length);
  const added = incoming.items.filter(entry => !known.has(entry.id)).slice(0, room);
  return added.length === 0 ? current : { items: [...current.items, ...added] };
}

// --- Dates -----------------------------------------------------------------------------------------------------
function dayNumber(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * The solar date (`YYYY-MM-DD`) a day falls on in `year`: for a solar day the solar year, for a lunar day the lunar
 * year. Null when the year is out of range.
 */
export function occurrenceDate(item: SpecialDay, year: number): string | null {
  if (item.calendar === "solar") {
    if (year < FIRST_YEAR || year > LAST_YEAR) return null;
    const last = new Date(year, item.month, 0).getDate();
    return `${pad(year, 4)}-${pad(item.month, 2)}-${pad(Math.min(item.day, last), 2)}`;
  }
  const length = lunarDaysInMonth(item.month, year, false);
  if (length === null) return null;
  return lunarToSolar({ day: Math.min(item.day, length), month: item.month, year, leap: false });
}

function yearsOf(item: SpecialDay, year: number): number | null {
  return item.startYear === null || year < item.startYear ? null : year - item.startYear;
}

export type Occurrence = { item: SpecialDay; date: string; /** Years since the first one, or null when unknown. */ years: number | null };

/** The days of `items` that fall in [from, to] (both `YYYY-MM-DD`, inclusive), grouped by solar date in date order. */
export function occurrencesInRange(items: readonly SpecialDay[], from: string, to: string): Record<string, Occurrence[]> {
  if (items.length === 0 || from > to) return {};
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const found: Occurrence[] = [];
  for (const item of items) {
    // A lunar year starts in January or February, so the lunar year before may still reach into this solar year.
    for (let year = item.calendar === "lunar" ? fromYear - 1 : fromYear; year <= toYear; year += 1) {
      const date = occurrenceDate(item, year);
      if (date !== null && date >= from && date <= to) found.push({ item, date, years: yearsOf(item, year) });
    }
  }
  found.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const grouped: Record<string, Occurrence[]> = {};
  for (const entry of found) (grouped[entry.date] ??= []).push(entry);
  return grouped;
}

export type NextOccurrence = { date: string; daysUntil: number; years: number | null };

/** The first time on or after `from` that the day comes round, or null when none lies within the supported years. */
export function nextOccurrence(item: SpecialDay, from: string): NextOccurrence | null {
  const fromYear = Number(from.slice(0, 4));
  for (let year = item.calendar === "lunar" ? fromYear - 1 : fromYear; year <= fromYear + 2; year += 1) {
    const date = occurrenceDate(item, year);
    if (date !== null && date >= from) return { date, daysUntil: daysBetween(from, date), years: yearsOf(item, year) };
  }
  return null;
}

// --- Words -----------------------------------------------------------------------------------------------------
type Translate = (text: string) => string;

/** "turns 30" for a birthday, "10 years" for the rest; empty when the count is unknown or is the day itself. */
export function countText(kind: SpecialKind, years: number | null, t: Translate): string {
  if (years === null || years <= 0) return "";
  return fillPlaceholders(t(kind === "birthday" ? "turns {count}" : "{count} years"), { count: String(years) });
}

/** The title with its count: "Linh (turns 30)". */
export function specialLabel(item: SpecialDay, years: number | null, t: Translate): string {
  const count = countText(item.kind, years, t);
  return count === "" ? item.title : `${item.title} (${count})`;
}
