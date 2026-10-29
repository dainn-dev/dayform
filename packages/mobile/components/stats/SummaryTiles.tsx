import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { percentLabel } from "../../lib/stats-chart";
import type { Stats } from "../../lib/stats";

type Tile = { key: string; label: string; value: string; spoken: string };

/** Three headline numbers: completion rate, done / scheduled tasks, and time done. */
export function SummaryTiles({ stats }: { stats: Stats }) {
  const { t, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 22 },
  tile: { flex: 1, minHeight: 88, backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: 6 },
  value: { color: c.foreground, fontSize: 21, fontWeight: "800", maxWidth: "100%" },
  label: { color: c.mutedForeground, fontSize: 10, fontWeight: "700", textAlign: "center" },
});
