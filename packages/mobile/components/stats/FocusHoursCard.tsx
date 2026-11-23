import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { describeWindow, type FocusHours } from "../../lib/habits-focus";
import { useLanguage } from "../../lib/language";
import { Surface } from "../ui/Surface";
import { fillPlaceholders } from "../../lib/text-template";

const ICON_BOX = 44;

type Props = { focus: FocusHours };

/** The two-hour window in which the user finishes most of their tasks, from the last 8 weeks. */
export function FocusHoursCard({ focus }: Props) {
  const { t, time } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { from, to } = describeWindow(focus);
  const headline = fillPlaceholders(t("You finish most tasks between {from} and {to}"), { from: time(from), to: time(to) });
  const basis = t("Based on your last 8 weeks");
  return <Surface accessible accessibilityLabel={`${t("Focus hours")}: ${headline}. ${basis}`} style={s.card}>
    <View style={s.icon}><Ionicons name="time-outline" size={22} color={colors.primary} /></View>
    <View style={s.text}>
      <Text style={s.eyebrow}>{t("Focus hours").toUpperCase()}</Text>
      <Text style={s.headline}>{headline}</Text>
      <Text style={s.basis}>{basis}</Text>
    </View>
  </Surface>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    card: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 14, minHeight: ICON_BOX },
    icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: t.radius.lg, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
    text: { flex: 1 },
    eyebrow: { ...t.type.micro, color: c.mutedForeground },
    headline: { ...t.type.title, color: c.foreground, marginTop: 3 },
    basis: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: 3 },
  });
};
