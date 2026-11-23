import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { fromKey } from "../../lib/planner";
import { weekdayShort } from "../../lib/weekdays";
import { Surface } from "../ui/Surface";
import { barLayout, maxPlannedMinutes, showMonthTick } from "../../lib/stats-chart";
import type { DayStats, RangeKind } from "../../lib/stats";

const CHART_HEIGHT = 120;
const PLANNED_OPACITY = 0.22;
const SWATCH_SIZE = 10;
const WIDE_BAR = 24;
const THIN_BAR = 6;
const STUB_HEIGHT = 3;

type Props = { perDay: readonly DayStats[]; kind: RangeKind };

/** One bar per day: a faint planned bar sized against the busiest day, with the done share filled in. */
export function DayBars({ perDay, kind }: Props) {
  const { t, language, locale, duration } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const max = maxPlannedMinutes(perDay);
  const wide = kind === "week";

  const spokenDay = (day: DayStats) => {
    const date = fromKey(day.date);
    const name = wide
      ? date.toLocaleDateString(locale, { weekday: "short" })
      : date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
    if (day.scheduledCount === 0) return `${name}: ${t("no tasks")}`;
    return `${name}: ${day.doneCount} ${t("of")} ${day.scheduledCount} ${t("tasks done")}, ${duration(day.plannedMinutes)} ${t("planned")}`;
  };
  const tickOf = (day: DayStats) => {
    if (wide) return weekdayShort(day.date, language);
    const dayOfMonth = fromKey(day.date).getDate();
    return showMonthTick(dayOfMonth) ? String(dayOfMonth) : "";
  };

  return <Surface style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t("Daily activity")}</Text>
    <View style={s.legend}>
      <View style={s.legendItem}><View style={[s.swatch, s.swatchPlanned]} /><Text style={s.legendText}>{t("Planned")}</Text></View>
      <View style={s.legendItem}><View style={[s.swatch, { backgroundColor: colors.primary }]} /><Text style={s.legendText}>{t("Done")}</Text></View>
    </View>
    <View style={s.chart}>{perDay.map(day => {
      const { plannedPx, donePx } = barLayout(day.plannedMinutes, day.doneMinutes, max, CHART_HEIGHT);
      return <View key={day.date} accessible accessibilityLabel={spokenDay(day)} style={s.column}>
        <View style={s.barArea}>
          {plannedPx > 0
            ? <View style={[s.bar, wide ? s.barWide : s.barThin, { height: plannedPx }]}>
                <View style={[s.planned, StyleSheet.absoluteFill]} />
                <View style={[s.done, { height: donePx }]} />
              </View>
            : <View style={[s.stub, wide ? s.barWide : s.barThin]} />}
        </View>
        <Text style={s.tick} numberOfLines={1}>{tickOf(day)}</Text>
      </View>;
    })}</View>
  </Surface>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  // Bar geometry (chart height, bar widths) is fixed; only the corners follow the style, never past fully round.
  return StyleSheet.create({
    card: { marginTop: 14 },
    title: { ...t.type.title, color: c.foreground },
    legend: { flexDirection: "row", gap: t.space.lg, marginTop: t.space.sm, marginBottom: 14 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    swatch: { width: SWATCH_SIZE, height: SWATCH_SIZE, borderRadius: t.radius.xs / 2 },
    swatchPlanned: { backgroundColor: c.primary, opacity: PLANNED_OPACITY },
    legendText: { ...t.type.caption, color: c.mutedForeground },
    chart: { flexDirection: "row", alignItems: "flex-end", gap: t.space.xxs },
    column: { flex: 1, alignItems: "center" },
    barArea: { height: CHART_HEIGHT, justifyContent: "flex-end", alignItems: "center" },
    bar: { borderRadius: Math.min(t.radius.xs, WIDE_BAR / 2), overflow: "hidden", justifyContent: "flex-end" },
    barWide: { width: WIDE_BAR },
    barThin: { width: THIN_BAR, borderRadius: Math.min(t.radius.xs, THIN_BAR / 2) },
    planned: { backgroundColor: c.primary, opacity: PLANNED_OPACITY },
    done: { backgroundColor: c.primary },
    stub: { height: STUB_HEIGHT, backgroundColor: c.track, borderRadius: Math.min(t.radius.xs, STUB_HEIGHT / 2) },
    // Fixed 28 px column so a tick never pushes the bars apart (a weekday or a day of the month).
    tick: { ...t.type.caption, width: 28, textAlign: "center", color: c.mutedForeground, marginTop: t.space.sm },
  });
};
