import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { focusMinutesIn } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import type { DateRange } from "../../lib/stats";

/** Time spent in the focus timer during the shown week or month. Hidden until the timer has been used at least once. */
export function FocusTimeCard({ range }: { range: DateRange }) {
  const { t, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { log } = useFocus();
  const { total, perDay } = useMemo(() => focusMinutesIn(log, range.from, range.to), [log, range.from, range.to]);
  if (log.length === 0) return null;
  const days = Object.keys(perDay).length;
  const headline = total > 0 ? duration(total) : t("No focus time in this period.");
  const detail = total > 0 ? `${days} ${t(days === 1 ? "day" : "days")} · ${duration(Math.round(total / days))} ${t("a day on average")}` : null;
  return <View accessible accessibilityLabel={`${t("Focus time")}: ${headline}${detail ? `, ${detail}` : ""}`} style={s.card}>
    <View style={s.icon}><Ionicons name="timer-outline" size={22} color={colors.primary} /></View>
    <View style={s.text}>
      <Text style={s.eyebrow}>{t("Focus time").toUpperCase()}</Text>
      <Text style={s.headline}>{headline}</Text>
      {detail !== null && <Text style={s.detail}>{detail}</Text>}
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 23, padding: 18, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 44 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
  eyebrow: { color: c.mutedForeground, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  headline: { color: c.foreground, fontSize: 16, fontWeight: "800", marginTop: 3 },
  detail: { color: c.mutedForeground, fontSize: 12, marginTop: 3 },
});
