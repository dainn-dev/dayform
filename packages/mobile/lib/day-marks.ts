import { holidayLabel, holidaysByDay, type HolidayGroup, type HolidayLanguage } from "./holidays-vn";
import { occurrencesInRange, specialLabel, type SpecialDay } from "./special-days";

/** One thing worth marking on a day of the calendar: a holiday or one of the user's own special days. */
export type DayMark = {
  id: string;
  kind: "holiday" | "special";
  /** Already in the interface language: a lunar festival carries its lunar date, a special day its count ("Linh (turns 30)"). */
  label: string;
  /** The label is text the user wrote (so the widget hides it when titles are hidden). */
  userText: boolean;
};

type Translate = (text: string) => string;

export type DayMarkOptions = {
  /** The settings switch for holidays: false leaves them out (the user's own special days are always marked). */
  holidays: boolean;
  /** Which holiday groups to mark; all when omitted. */
  groups?: ReadonlySet<HolidayGroup>;
  language: HolidayLanguage;
  specials?: readonly SpecialDay[];
  /** The interface translator, for the count words of a special day. */
  t?: Translate;
};

const identity: Translate = text => text;

/** The marks of each given day (`YYYY-MM-DD`), the user's own days first; a day without a mark is absent from the result. */
export function dayMarks(keys: readonly string[], options: DayMarkOptions): Record<string, DayMark[]> {
  const result: Record<string, DayMark[]> = {};
  if (keys.length === 0) return result;
  const { language, t = identity } = options;
  const ordered = [...keys].sort();
  const specials = options.specials !== undefined && options.specials.length > 0
    ? occurrencesInRange(options.specials, ordered[0], ordered[ordered.length - 1])
    : {};
  const holidays = options.holidays ? holidaysByDay(keys, options.groups) : {};
  for (const key of keys) {
    const marks: DayMark[] = [
      ...(specials[key] ?? []).map(found => ({ id: found.item.id, kind: "special" as const, label: specialLabel(found.item, found.years, t), userText: true })),
      ...(holidays[key] ?? []).map(found => ({ id: found.id, kind: "holiday" as const, label: holidayLabel(found, language), userText: false })),
    ];
    if (marks.length > 0) result[key] = marks;
  }
  return result;
}

/** "Linh (turns 30) · Tết Trung thu (15/8 ÂL)": the names of one day's marks on a single line. */
export function marksLine(marks: readonly DayMark[] | undefined): string {
  return (marks ?? []).map(mark => mark.label).join(" · ");
}

export type MarkKinds = { holiday: boolean; special: boolean };

/** Which kinds of mark a day has, for the small icons of the week strip. */
export function markKinds(marks: readonly DayMark[] | undefined): MarkKinds {
  return { holiday: (marks ?? []).some(mark => mark.kind === "holiday"), special: (marks ?? []).some(mark => mark.kind === "special") };
}
