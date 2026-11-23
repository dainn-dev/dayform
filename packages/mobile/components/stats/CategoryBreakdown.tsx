import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useLanguage } from "../../lib/language";
import { useCategories } from "../../lib/categories-context";
import type { Category } from "../../lib/planner";
import { Surface } from "../ui/Surface";
import { breakdownIds, categoryShare } from "../../lib/stats-chart";
import type { CategoryStats } from "../../lib/stats";

const PLANNED_OPACITY = 0.25;
const TRACK_HEIGHT = 10;
const EMPTY_STATS: CategoryStats = { plannedMinutes: 0, doneMinutes: 0, count: 0 };

/** One horizontal bar per category: planned length in a faint tint, done time in the solid category color. */
export function CategoryBreakdown({ perCategory }: { perCategory: Record<Category, CategoryStats> }) {
  const { visible, label } = useCategories();
  const { t, duration } = useLanguage();
  const categoryColors = useCategoryColors();
  const s = useThemedStyles(makeStyles);
  const ids = useMemo(() => breakdownIds(perCategory, visible), [perCategory, visible]);
  const statsOf = (id: Category): CategoryStats => perCategory[id] ?? EMPTY_STATS;
  const max = ids.reduce((top, id) => Math.max(top, statsOf(id).plannedMinutes), 0);

  const spoken = (category: Category, entry: CategoryStats) =>
    `${label(category)}: ${entry.count} ${t(entry.count === 1 ? "task" : "tasks")}, ${duration(entry.plannedMinutes)} ${t("planned")}, ${duration(entry.doneMinutes)} ${t("done")}`;

  return <Surface style={s.card}>
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
  </Surface>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  // The bar keeps its 10 px height; its corner follows the style's smallest corner, never past fully round.
  const barRadius = Math.min(t.radius.xs, TRACK_HEIGHT / 2);
  return StyleSheet.create({
    card: { marginTop: 14 },
    title: { ...t.type.title, color: c.foreground, marginBottom: 6 },
    row: { marginTop: 14 },
    rowHead: { flexDirection: "row", alignItems: "center", gap: t.space.sm, marginBottom: 7 },
    name: { ...t.type.label, flex: 1, color: c.foreground },
    hours: { ...t.type.meta, color: c.mutedForeground },
    track: { height: TRACK_HEIGHT, borderRadius: barRadius, backgroundColor: c.track, overflow: "hidden" },
    planned: { height: TRACK_HEIGHT, borderRadius: barRadius, overflow: "hidden" },
    done: { position: "absolute", left: 0, top: 0, bottom: 0 },
  });
};
