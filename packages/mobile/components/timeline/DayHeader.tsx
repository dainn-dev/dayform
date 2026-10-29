import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fromKey, type Task } from "../../lib/planner";
import { LanguageSwitch } from "../LanguageSwitch";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Page header: DAYFORM kicker, language switch, greeting and the jump-to-today shortcut. */
export function GreetingHeader({ onToday }: { onToday: () => void }) {
  const { t: tr } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <>
    <View style={s.kickerRow}><Text style={s.kicker}>DAYFORM ✦</Text><LanguageSwitch /></View>
    <View style={s.header}>
      <View><Text style={s.greeting}>{tr(greeting())}<Text style={{ color: colors.sun }}> ☀</Text></Text><Text style={s.subtitle}>{tr("Make room for what matters.")}</Text></View>
      <Pressable onPress={onToday} style={s.todayShortcut} accessibilityLabel={tr("Jump to today")}><Ionicons name="calendar-outline" size={21} color={colors.foreground} /></Pressable>
    </View>
  </>;
}

type DayHeaderProps = { selected: string; today: string; scheduled: Task[]; onAdd: () => void };

/** Day panel header: date, title, add button, summary, progress bar and the DAILY TIMELINE heading. */
export function DayHeader({ selected, today, scheduled, onAdd }: DayHeaderProps) {
  const { t: tr, locale, summary } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const selectedDate = fromKey(selected);
  const dateTitle = selected === today ? tr("Today") : selectedDate.toLocaleDateString(locale, { weekday: "long" });
  const completed = scheduled.filter(t => t.status === "done").length;
  const total = scheduled.reduce((sum, t) => sum + t.duration, 0);
  const progress = scheduled.length ? completed / scheduled.length * 100 : 0;
  return <>
    <View style={s.dailyTop}>
      <View><Text style={s.panelEyebrow}>{selectedDate.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</Text><Text style={s.dailyTitle}>{dateTitle}<Text style={{ color: colors.punctuation }}>.</Text></Text></View>
      <Pressable onPress={onAdd} style={s.addSmall} accessibilityLabel={tr("Add task")}><Ionicons name="add" size={21} color={colors.primary} /></Pressable>
    </View>
    <Text style={s.summary}>{summary(completed, scheduled.length, total)}</Text>
    <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%` }]} /></View>
    <View style={s.timelineHeading}><View style={s.liveDot} /><Text style={s.timelineHeadingText}>{tr("DAILY TIMELINE")}</Text><Text style={s.timelineHint}>{tr("6 AM – 10 PM")}</Text></View>
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
  kicker: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2.4, marginBottom: 9 },
  greeting: { color: c.foreground, fontSize: 27, fontWeight: "800", letterSpacing: -1.1 },
  subtitle: { color: c.mutedForeground, fontSize: 13, marginTop: 6 },
  todayShortcut: { width: 43, height: 43, backgroundColor: c.card, borderRadius: 16, alignItems: "center", justifyContent: "center", shadowColor: c.shadowSoft, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  dailyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  panelEyebrow: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  dailyTitle: { fontSize: 26, color: c.foreground, fontWeight: "800", letterSpacing: -0.9 },
  addSmall: { width: 36, height: 36, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" },
  summary: { color: c.mutedForeground, fontSize: 12, marginTop: 10, marginLeft: 4 },
  progressTrack: { marginTop: 17, height: 5, borderRadius: 4, backgroundColor: c.track, overflow: "hidden", marginHorizontal: 4 },
  progressFill: { height: 5, borderRadius: 4, backgroundColor: c.primary },
  timelineHeading: { flexDirection: "row", alignItems: "center", marginTop: 28, marginBottom: 19, paddingHorizontal: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.live, marginRight: 8 },
  timelineHeadingText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5, color: c.foreground },
  timelineHint: { marginLeft: "auto", color: c.mutedForeground, fontSize: 10, fontWeight: "600" },
});
