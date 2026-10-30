import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useDayMarks } from "../../hooks/use-day-marks";
import { markKinds, marksLine } from "../../lib/day-marks";
import { solarToLunar } from "../../lib/lunar";
import { useSettings } from "../../lib/settings-context";
import { useLanguage } from "../../lib/language";
import { fromKey, weekDays, type Task } from "../../lib/planner";
import { weekdayShort } from "../../lib/weekdays";
import { withMarkLabel } from "../../lib/cycle-ui-kinds";
import { CycleMark, useCycleMarks } from "../cycle/CycleMark";
import { SectionEyebrow } from "../ui/SectionEyebrow";

const MARK_ICON_SIZE = 9;

type Props = {
  /** First day of the shown week (per the week-start setting). */
  week: string;
  selected: string;
  today: string;
  tasks: Task[];
  onSelect: (key: string) => void;
  onShiftWeek: (days: number) => void;
};

/** The lunar day and month of a solar date, "15/8". */
function lunarShort(key: string): string {
  const lunar = solarToLunar(key);
  return `${lunar.day}/${lunar.month}`;
}

export function WeekStrip({ week, selected, today, tasks, onSelect, onShiftWeek }: Props) {
  const { t: tr, language, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const cycleMarks = useCycleMarks(week, today);
  const days = useMemo(() => weekDays(week), [week]);
  const dayMarks = useDayMarks(days);
  const showLunar = useSettings().settings.calendar.showLunar;
  const monthTitle = fromKey(week).toLocaleDateString(locale, { month: "long", year: "numeric" });

  return <>
    <View style={s.weekHeader}>
      <View><SectionEyebrow>{tr("YOUR WEEK")}</SectionEyebrow><Text accessibilityRole="header" style={s.month}>{monthTitle}</Text></View>
      <View style={s.weekNav}>
        <Pressable onPress={() => onShiftWeek(-7)} style={s.navButton} accessibilityRole="button" accessibilityLabel={tr("Previous week")}><Ionicons name="chevron-back" size={19} color={colors.foreground} /></Pressable>
        <Pressable onPress={() => onShiftWeek(7)} style={s.navButton} accessibilityRole="button" accessibilityLabel={tr("Next week")}><Ionicons name="chevron-forward" size={19} color={colors.foreground} /></Pressable>
      </View>
    </View>
    <View style={s.weekStrip}>{days.map(key => {
      const active = key === selected, isToday = key === today;
      const hasTasks = tasks.some(t => t.date === key && t.start);
      const dotColor = active ? colors.onPrimary : colors.primary;
      const dayLabel = fromKey(key).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
      const marked = dayMarks[key];
      const spoken = `${dayLabel}${isToday ? `, ${tr("Today")}` : ""}${marked ? `, ${marksLine(marked)}` : ""}`;
      return <Pressable key={key} onPress={() => onSelect(key)} accessibilityRole="button" accessibilityLabel={withMarkLabel(tr, spoken, cycleMarks[key] ?? "none")} accessibilityState={{ selected: active }} style={[s.dayCell, active && s.dayActive]}>
        <Text style={[s.dayName, active && s.dayTextActive]}>{weekdayShort(key, language)}</Text>
        <Text style={[s.dayNumber, active && s.dayTextActive]}>{fromKey(key).getDate()}</Text>
        {showLunar && <Text accessible={false} style={[s.lunar, active && s.dayTextActive]}>{lunarShort(key)}</Text>}
        <View style={[s.dayDot, hasTasks && { backgroundColor: dotColor }, isToday && !hasTasks && { borderWidth: 1.5, borderColor: dotColor }]} />
        <CycleMark kind={cycleMarks[key]} color={active ? colors.onPrimary : undefined} />
        {marked !== undefined && <View style={s.markIcons}>
          {markKinds(marked).special && <Ionicons accessible={false} name="heart" size={MARK_ICON_SIZE} color={active ? colors.onPrimary : colors.primary} />}
          {markKinds(marked).holiday && <Ionicons accessible={false} name="flag" size={MARK_ICON_SIZE} color={active ? colors.onPrimary : colors.sun} />}
        </View>}
      </Pressable>;
    })}</View>
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  weekHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 17 },
  month: { color: c.foreground, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  weekNav: { flexDirection: "row", gap: 7 },
  navButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  weekStrip: { flexDirection: "row", gap: 4, marginBottom: 26 },
  dayCell: { flex: 1, minHeight: 76, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: c.card, gap: 5 },
  dayActive: { backgroundColor: c.primary, shadowColor: c.primary, shadowOpacity: 0.21, shadowRadius: 12, elevation: 4 },
  dayName: { color: c.mutedForeground, fontSize: 10, fontWeight: "700" },
  dayNumber: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  dayTextActive: { color: c.onPrimary },
  dayDot: { width: 4, height: 4, borderRadius: 3, backgroundColor: "transparent" },
  markIcons: { flexDirection: "row", gap: 2 },
  lunar: { color: c.mutedForeground, fontSize: 9, fontWeight: "600", marginTop: -3 },
});
