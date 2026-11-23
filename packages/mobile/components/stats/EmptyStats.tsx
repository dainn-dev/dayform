import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { Surface } from "../ui/Surface";

/** Friendly placeholder when the shown range has no scheduled tasks. */
export function EmptyStats() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <Surface padding="none" style={s.card}>
    <View style={s.icon}><Ionicons name="stats-chart-outline" size={26} color={colors.primary} /></View>
    <Text accessibilityRole="header" style={s.title}>{t("Nothing scheduled here")}</Text>
    <Text style={s.body}>{t("Schedule a few tasks on the Timeline and your insights will show up here.")}</Text>
  </Surface>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    card: { padding: t.space.xxl, marginTop: 22, alignItems: "center", gap: 10 },
    icon: { width: 56, height: 56, borderRadius: t.radius.xl, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
    title: { ...t.type.title, color: c.foreground, textAlign: "center" },
    body: { ...t.type.body, color: c.mutedForeground, textAlign: "center" },
  });
};
