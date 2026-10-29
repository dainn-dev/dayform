import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fromKey } from "../../lib/planner";

type Props = { streak: number; busiestDay: string | null };

/** Current streak of days with a finished task, plus the busiest day of the shown range. */
export function StreakCard({ streak, busiestDay }: Props) {
  const { t, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const headline = streak > 0 ? `${streak} ${t(streak === 1 ? "day in a row" : "days in a row")}` : t("Finish a task today to start a streak.");
  const busiest = busiestDay ? fromKey(busiestDay).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" }) : null;

  return <View style={s.card}>
    <View accessible accessibilityLabel={`${t("Streak")}: ${headline}`} style={s.row}>
      <View style={s.icon}><Ionicons name="flame-outline" size={22} color={colors.primary} /></View>
      <View style={s.text}>
        <Text style={s.eyebrow}>{t("Streak").toUpperCase()}</Text>
        <Text style={s.headline}>{headline}</Text>
      </View>
    </View>
    {busiest && <View accessible accessibilityLabel={`${t("Busiest day")}: ${busiest}`} style={[s.row, s.second]}>
      <View style={s.icon}><Ionicons name="trending-up-outline" size={22} color={colors.primary} /></View>
      <View style={s.text}>
        <Text style={s.eyebrow}>{t("Busiest day").toUpperCase()}</Text>
        <Text style={s.headline}>{busiest}</Text>
      </View>
    </View>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 23, padding: 18, marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 44 },
  second: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.hairline },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
  eyebrow: { color: c.mutedForeground, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  headline: { color: c.foreground, fontSize: 16, fontWeight: "800", marginTop: 3 },
});
