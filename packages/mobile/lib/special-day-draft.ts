import { fillPlaceholders } from "./text-template";
import {
  addSpecialDay, nextOccurrence, type NextOccurrence, type SpecialCalendar, type SpecialDay, type SpecialDayInput, type SpecialKind, type SpecialRemind,
} from "./special-days";

/**
 * The text fields of the special-day editor, kept as strings while the user types, and the pure steps around them:
 * turning them into a validated input, and describing a saved day for the list. No React.
 */
export type SpecialDraft = {
  title: string;
  kind: SpecialKind;
  calendar: SpecialCalendar;
  day: string;
  month: string;
  year: string;
  remind: SpecialRemind;
};

type Translate = (text: string) => string;

const DIGITS = /^\d+$/;
const YEAR_DIGITS = /^\d{4}$/;
const NO_STATE = { items: [] };

/** A death anniversary (giỗ) is kept by the lunar date; everything else starts on the solar one. */
export function defaultCalendar(kind: SpecialKind): SpecialCalendar {
  return kind === "memorial" ? "lunar" : "solar";
}

export function emptyDraft(kind: SpecialKind = "birthday"): SpecialDraft {
  return { title: "", kind, calendar: defaultCalendar(kind), day: "", month: "", year: "", remind: kind === "birthday" ? "same-day" : "none" };
}

export function draftFromDay(item: SpecialDay): SpecialDraft {
  return {
    title: item.title, kind: item.kind, calendar: item.calendar, day: String(item.day), month: String(item.month),
    year: item.startYear === null ? "" : String(item.startYear), remind: item.remind,
  };
}

export type DraftField = "title" | "date" | "year";
export type DraftCheck = { ok: true; input: SpecialDayInput } | { ok: false; field: DraftField };

/** Runs the real validation (lib/special-days.ts) so the editor's messages and Save always agree with what saving does. */
export function checkDraft(draft: SpecialDraft): DraftCheck {
  const day = draft.day.trim();
  const month = draft.month.trim();
  const year = draft.year.trim();
  if (draft.title.trim() === "") return { ok: false, field: "title" };
  if (!DIGITS.test(day) || !DIGITS.test(month)) return { ok: false, field: "date" };
  if (year !== "" && !YEAR_DIGITS.test(year)) return { ok: false, field: "year" };
  const input: SpecialDayInput = {
    title: draft.title, kind: draft.kind, calendar: draft.calendar, month: Number(month), day: Number(day),
    startYear: year === "" ? null : Number(year), remind: draft.remind,
  };
  const result = addSpecialDay(NO_STATE, input);
  if (result.ok) return { ok: true, input: { ...input, title: result.state.items[0].title } };
  if (result.reason === "invalid-title") return { ok: false, field: "title" };
  // Either the day and month do not exist, or only the year is out of range.
  return { ok: false, field: addSpecialDay(NO_STATE, { ...input, startYear: null }).ok ? "year" : "date" };
}

/** "15/3", or "15/8 lunar" for a lunar day. */
export function describeDate(item: SpecialDay, t: Translate): string {
  const date = `${item.day}/${item.month}`;
  return item.calendar === "lunar" ? fillPlaceholders(t("{date} lunar"), { date }) : date;
}

/** "Today", "Tomorrow" or "in 12 days". */
export function untilText(daysUntil: number, t: Translate): string {
  if (daysUntil <= 0) return t("Today");
  if (daysUntil === 1) return t("Tomorrow");
  return fillPlaceholders(t("in {count} days"), { count: String(daysUntil) });
}

/** The days with their next date, nearest first (equal distances keep their order). */
export function sortByNext(items: readonly SpecialDay[], today: string): Array<{ item: SpecialDay; next: NextOccurrence | null }> {
  return items
    .map((item, index) => ({ item, next: nextOccurrence(item, today), index }))
    .sort((a, b) => (a.next?.daysUntil ?? Number.MAX_SAFE_INTEGER) - (b.next?.daysUntil ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ item, next }) => ({ item, next }));
}
