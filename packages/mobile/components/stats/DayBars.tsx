import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fromKey } from "../../lib/planner";
import { weekdayShort } from "../../lib/weekdays";
import { barLayout, maxPlannedMinutes, showMonthTick } from "../../lib/stats-chart";
import type { DayStats, RangeKind } from "../../lib/stats";

const CHART_HEIGHT = 120;
const PLANNED_OPACITY = 0.22;

type Props = { perDay: readonly DayStats[]; kind: RangeKind };

/** One bar per day: a faint planned bar sized against the busiest day, with the done share filled in. */
export function DayBars({ perDay, kind }: Props) {
  const { t, language, locale, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

  return <View style={s.card}>
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
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 23, padding: 18, marginTop: 14 },
  title: { color: c.foreground, fontSize: 16, fontWeight: "800" },
  legend: { flexDirection: "row", gap: 16, marginTop: 8, marginBottom: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchPlanned: { backgroundColor: c.primary, opacity: PLANNED_OPACITY },
  legendText: { color: c.mutedForeground, fontSize: 11, fontWeight: "700" },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  column: { flex: 1, alignItems: "center" },
  barArea: { height: CHART_HEIGHT, justifyContent: "flex-end", alignItems: "center" },
  bar: { borderRadius: 6, overflow: "hidden", justifyContent: "flex-end" },
  barWide: { width: 24 },
  barThin: { width: 6, borderRadius: 3 },
  planned: { backgroundColor: c.primary, opacity: PLANNED_OPACITY },
  done: { backgroundColor: c.primary },
  stub: { height: 3, backgroundColor: c.track, borderRadius: 2 },
  tick: { width: 28, textAlign: "center", color: c.mutedForeground, fontSize: 10, fontWeight: "700", marginTop: 8 },
});
