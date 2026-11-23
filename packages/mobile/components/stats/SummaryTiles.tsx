import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { percentLabel } from "../../lib/stats-chart";
import type { Stats } from "../../lib/stats";

type Tile = { key: string; label: string; value: string; spoken: string };

/** Three headline numbers: completion rate, done / scheduled tasks, and time done. */
export function SummaryTiles({ stats }: { stats: Stats }) {
  const { t, duration } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const tiles: Tile[] = [
    { key: "rate", label: t("Completion"), value: percentLabel(stats.completionRate), spoken: percentLabel(stats.completionRate) },
    { key: "tasks", label: t("Tasks done"), value: `${stats.doneCount}/${stats.scheduledCount}`, spoken: `${stats.doneCount} ${t("of")} ${stats.scheduledCount}` },
    { key: "time", label: t("Time done"), value: duration(stats.doneMinutes), spoken: `${duration(stats.doneMinutes)} ${t("of")} ${duration(stats.plannedMinutes)} ${t("planned")}` },
  ];
  return <View style={s.row}>{tiles.map(tile => <View key={tile.key} accessible accessibilityLabel={`${tile.label}: ${tile.spoken}`} style={s.tile}>
    <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit>{tile.value}</Text>
    <Text style={s.label} numberOfLines={2}>{tile.label}</Text>
  </View>)}</View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    row: { flexDirection: "row", gap: t.space.sm, marginTop: 22 },
    tile: { ...t.elevation.card, flex: 1, minHeight: 88, backgroundColor: c.card, borderRadius: t.radius.xl, paddingHorizontal: 10, paddingVertical: t.space.lg, alignItems: "center", justifyContent: "center", gap: 6 },
    // Shrinks to fit (adjustsFontSizeToFit) when a long duration does not fit the tile.
    value: { ...t.type.display, color: c.foreground, maxWidth: "100%" },
    label: { ...t.type.caption, color: c.mutedForeground, textAlign: "center" },
  });
};
