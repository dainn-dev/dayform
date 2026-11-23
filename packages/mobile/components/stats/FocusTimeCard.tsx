import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { focusMinutesIn } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import { Surface } from "../ui/Surface";
import type { DateRange } from "../../lib/stats";

const ICON_BOX = 44;

/** Time spent in the focus timer during the shown week or month. Hidden until the timer has been used at least once. */
export function FocusTimeCard({ range }: { range: DateRange }) {
  const { t, duration } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { log } = useFocus();
  const { total, perDay } = useMemo(() => focusMinutesIn(log, range.from, range.to), [log, range.from, range.to]);
  if (log.length === 0) return null;
  const days = Object.keys(perDay).length;
  const headline = total > 0 ? duration(total) : t("No focus time in this period.");
  const detail = total > 0 ? `${days} ${t(days === 1 ? "day" : "days")} · ${duration(Math.round(total / days))} ${t("a day on average")}` : null;
  return <Surface accessible accessibilityLabel={`${t("Focus time")}: ${headline}${detail ? `, ${detail}` : ""}`} style={s.card}>
    <View style={s.icon}><Ionicons name="timer-outline" size={22} color={colors.primary} /></View>
    <View style={s.text}>
      <Text style={s.eyebrow}>{t("Focus time").toUpperCase()}</Text>
      <Text style={s.headline}>{headline}</Text>
      {detail !== null && <Text style={s.detail}>{detail}</Text>}
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
    detail: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: 3 },
  });
};
