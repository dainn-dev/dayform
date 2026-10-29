import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { describeWindow, type FocusHours } from "../../lib/habits-focus";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";

type Props = { focus: FocusHours };

/** The two-hour window in which the user finishes most of their tasks, from the last 8 weeks. */
export function FocusHoursCard({ focus }: Props) {
  const { t, time } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { from, to } = describeWindow(focus);
  const headline = fillPlaceholders(t("You finish most tasks between {from} and {to}"), { from: time(from), to: time(to) });
  const basis = t("Based on your last 8 weeks");
  return <View accessible accessibilityLabel={`${t("Focus hours")}: ${headline}. ${basis}`} style={s.card}>
    <View style={s.icon}><Ionicons name="time-outline" size={22} color={colors.primary} /></View>
    <View style={s.text}>
      <Text style={s.eyebrow}>{t("Focus hours").toUpperCase()}</Text>
      <Text style={s.headline}>{headline}</Text>
      <Text style={s.basis}>{basis}</Text>
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.card, borderRadius: 23, padding: 18, marginTop: 14, minHeight: 44 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
  eyebrow: { color: c.mutedForeground, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  headline: { color: c.foreground, fontSize: 16, fontWeight: "800", marginTop: 3 },
  basis: { color: c.mutedForeground, fontSize: 12, marginTop: 3 },
});
