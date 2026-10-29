import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { addDays, fromKey, type Task } from "../../lib/planner";
import { SectionEyebrow } from "../ui/SectionEyebrow";
import { DAYS, DAYS_VI } from "./constants";

type Props = {
  week: string;
  selected: string;
  today: string;
  tasks: Task[];
  onSelect: (key: string) => void;
  onShiftWeek: (days: number) => void;
};

export function WeekStrip({ week, selected, today, tasks, onSelect, onShiftWeek }: Props) {
  const { t: tr, language, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const monthTitle = fromKey(week).toLocaleDateString(locale, { month: "long", year: "numeric" });

  return <>
    <View style={s.weekHeader}>
      <View><SectionEyebrow>{tr("YOUR WEEK")}</SectionEyebrow><Text style={s.month}>{monthTitle}</Text></View>
      <View style={s.weekNav}>
        <Pressable onPress={() => onShiftWeek(-7)} style={s.navButton} accessibilityLabel={tr("Previous week")}><Ionicons name="chevron-back" size={19} color={colors.foreground} /></Pressable>
        <Pressable onPress={() => onShiftWeek(7)} style={s.navButton} accessibilityLabel={tr("Next week")}><Ionicons name="chevron-forward" size={19} color={colors.foreground} /></Pressable>
      </View>
    </View>
    <View style={s.weekStrip}>{DAYS.map((day, i) => {
      const key = addDays(week, i), active = key === selected, isToday = key === today;
      const hasTasks = tasks.some(t => t.date === key && t.start);
      const dotColor = active ? colors.onPrimary : colors.primary;
      return <Pressable key={key} onPress={() => onSelect(key)} accessibilityLabel={`${day} ${key}${isToday ? `, ${tr("Today")}` : ""}`} accessibilityState={{ selected: active }} style={[s.dayCell, active && s.dayActive]}>
        <Text style={[s.dayName, active && s.dayTextActive]}>{language === "vi" ? DAYS_VI[i] : day}</Text>
        <Text style={[s.dayNumber, active && s.dayTextActive]}>{fromKey(key).getDate()}</Text>
        <View style={[s.dayDot, hasTasks && { backgroundColor: dotColor }, isToday && !hasTasks && { borderWidth: 1.5, borderColor: dotColor }]} />
      </Pressable>;
    })}</View>
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  weekHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 17 },
  month: { color: c.foreground, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  weekNav: { flexDirection: "row", gap: 7 },
  navButton: { width: 33, height: 33, borderRadius: 12, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  weekStrip: { flexDirection: "row", gap: 4, marginBottom: 26 },
  dayCell: { flex: 1, minHeight: 76, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: c.card, gap: 5 },
  dayActive: { backgroundColor: c.primary, shadowColor: c.primary, shadowOpacity: 0.21, shadowRadius: 12, elevation: 4 },
  dayName: { color: c.mutedForeground, fontSize: 10, fontWeight: "700" },
  dayNumber: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  dayTextActive: { color: c.onPrimary },
  dayDot: { width: 4, height: 4, borderRadius: 3, backgroundColor: "transparent" },
});
