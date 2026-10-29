import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

/** Friendly placeholder when the shown range has no scheduled tasks. */
export function EmptyStats() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.card}>
    <View style={s.icon}><Ionicons name="stats-chart-outline" size={26} color={colors.primary} /></View>
    <Text accessibilityRole="header" style={s.title}>{t("Nothing scheduled here")}</Text>
    <Text style={s.body}>{t("Schedule a few tasks on the Timeline and your insights will show up here.")}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 23, padding: 28, marginTop: 22, alignItems: "center", gap: 10 },
  icon: { width: 56, height: 56, borderRadius: 19, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  title: { color: c.foreground, fontSize: 17, fontWeight: "800", textAlign: "center" },
  body: { color: c.mutedForeground, fontSize: 13, lineHeight: 19, textAlign: "center" },
});
