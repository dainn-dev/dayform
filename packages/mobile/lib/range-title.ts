import { fromKey } from "./planner";
import type { DateRange, RangeKind } from "./stats";

/**
 * "May 4 – May 10, 2026" for a week, "Dec 29, 2025 – Jan 4, 2026" when the week spans two years,
 * "May 2026" for a month, in the app locale.
 */
export function rangeTitle(kind: RangeKind, range: DateRange, locale: string): string {
  const from = fromKey(range.from);
  if (kind === "month") return from.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const to = fromKey(range.to);
  const startFormat: Intl.DateTimeFormatOptions = from.getFullYear() === to.getFullYear()
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  const start = from.toLocaleDateString(locale, startFormat);
  const end = to.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}
