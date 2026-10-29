import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useCategoryColors } from "../../hooks/use-category-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { useCategories } from "../../lib/categories-context";
import type { Category } from "../../lib/planner";
import { breakdownIds, categoryShare } from "../../lib/stats-chart";
import type { CategoryStats } from "../../lib/stats";

const PLANNED_OPACITY = 0.25;
const EMPTY_STATS: CategoryStats = { plannedMinutes: 0, doneMinutes: 0, count: 0 };

/** One horizontal bar per category: planned length in a faint tint, done time in the solid category color. */
export function CategoryBreakdown({ perCategory }: { perCategory: Record<Category, CategoryStats> }) {
  const { visible, label } = useCategories();
  const { t, duration } = useLanguage();
  const colors = useColors();
  const categoryColors = useCategoryColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const ids = useMemo(() => breakdownIds(perCategory, visible), [perCategory, visible]);
  const statsOf = (id: Category): CategoryStats => perCategory[id] ?? EMPTY_STATS;
  const max = ids.reduce((top, id) => Math.max(top, statsOf(id).plannedMinutes), 0);

  const spoken = (category: Category, entry: CategoryStats) =>
    `${label(category)}: ${entry.count} ${t(entry.count === 1 ? "task" : "tasks")}, ${duration(entry.plannedMinutes)} ${t("planned")}, ${duration(entry.doneMinutes)} ${t("done")}`;

  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t("By category")}</Text>
    {ids.map(category => {
      const entry = statsOf(category);
      const { accent, icon } = categoryColors.get(category);
      const planned = categoryShare(entry.plannedMinutes, max);
      const done = categoryShare(entry.doneMinutes, entry.plannedMinutes);
      return <View key={category} accessible accessibilityLabel={spoken(category, entry)} style={s.row}>
        <View style={s.rowHead}>
          <Ionicons name={icon} size={15} color={accent} />
          <Text numberOfLines={1} style={s.name}>{label(category)}</Text>
          <Text style={s.hours}>{entry.plannedMinutes > 0 ? duration(entry.plannedMinutes) : "–"}</Text>
        </View>
        <View style={s.track}>
          {planned > 0 && <View style={[s.planned, { width: `${planned * 100}%` }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: PLANNED_OPACITY }]} />
            <View style={[s.done, { backgroundColor: accent, width: `${done * 100}%` }]} />
          </View>}
        </View>
      </View>;
    })}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 23, padding: 18, marginTop: 14 },
  title: { color: c.foreground, fontSize: 16, fontWeight: "800", marginBottom: 6 },
  row: { marginTop: 14 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  name: { flex: 1, color: c.foreground, fontSize: 13, fontWeight: "700" },
  hours: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
  track: { height: 10, borderRadius: 5, backgroundColor: c.track, overflow: "hidden" },
  planned: { height: 10, borderRadius: 5, overflow: "hidden" },
  done: { position: "absolute", left: 0, top: 0, bottom: 0 },
});
