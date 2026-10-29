import type { CalendarDay, CalendarKind } from "./cycle-calendar";
import { fillPlaceholders } from "./text-template";
import { tx, type Translate } from "./cycle-ui-text";

/** Palette group (`colors.cycle[group]`) and the shape drawn for each kind, so no kind relies on color alone. */
export type KindGroup = "period" | "predicted" | "fertile" | "safe";
export type KindShape = "disc" | "ring" | "diamond" | "bar";
export type MarkedKind = Exclude<CalendarKind, "none">;
export type KindMeta = { label: string; group: KindGroup; shape: KindShape };

export const KIND_META: Readonly<Record<MarkedKind, KindMeta>> = {
  "period": { label: tx("Period"), group: "period", shape: "disc" },
  "predicted-period": { label: tx("Expected period"), group: "predicted", shape: "ring" },
  "fertile": { label: tx("Fertile days (estimate)"), group: "fertile", shape: "diamond" },
  "safe-estimate": { label: tx("Safe days (estimate)"), group: "safe", shape: "bar" },
};

const KIND_ORDER: readonly MarkedKind[] = ["period", "predicted-period", "fertile", "safe-estimate"];

export const isMarked = (kind: CalendarKind): kind is MarkedKind => kind !== "none";

/** Legend entries: the logged period always, then every other kind that appears in the shown grid. */
export function legendKinds(grid: readonly (readonly CalendarDay[])[]): MarkedKind[] {
  const present = new Set<CalendarKind>(grid.flat().filter(day => day.inMonth).map(day => day.kind));
  return KIND_ORDER.filter(kind => kind === "period" || present.has(kind));
}

/** Spoken label of a calendar day: "Tuesday 3 March, today, period". `dateLabel` is already formatted. */
export function dayLabel(t: Translate, dateLabel: string, kind: CalendarKind, isToday: boolean): string {
  const base = isMarked(kind)
    ? (isToday ? tx("{date}, today, {kind}") : tx("{date}, {kind}"))
    : (isToday ? tx("{date}, today") : tx("{date}"));
  return fillPlaceholders(t(base), { date: dateLabel, kind: isMarked(kind) ? t(KIND_META[kind].label) : "" });
}

/**
 * The Timeline never shows the safe-days estimate: a tiny mark without its disclaimer is too easy to over-trust.
 * Everything else the user switched on is shown.
 */
export function timelineKind(kind: CalendarKind): CalendarKind {
  return kind === "safe-estimate" ? "none" : kind;
}

/** A Timeline day's label with the cycle mark appended: "Tuesday 3 March. Cycle: Period". */
export function withMarkLabel(t: Translate, dayText: string, kind: CalendarKind): string {
  if (!isMarked(kind)) return dayText;
  return fillPlaceholders(t(tx("{day}. Cycle: {kind}")), { day: dayText, kind: t(KIND_META[kind].label) });
}

export function markLabel(t: Translate, kind: MarkedKind): string {
  return fillPlaceholders(t(tx("Cycle: {kind}")), { kind: t(KIND_META[kind].label) });
}
