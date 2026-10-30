import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useTimelineConfig } from "../../hooks/use-timeline-config";
import type { ThemeColors } from "../../constants/theme";
import { useDayMarks } from "../../hooks/use-day-marks";
import { markKinds, marksLine } from "../../lib/day-marks";
import { solarToLunar } from "../../lib/lunar";
import { greetingText, sloganText } from "../../lib/greeting";
import { useLanguage } from "../../lib/language";
import { fromKey, type Task } from "../../lib/planner";
import { useSettings } from "../../lib/settings-context";
import { windowLabel } from "../../lib/timeline-config";

const GREETING_MIN_FONT_SCALE = 0.6;

/**
 * Greeting (with the name when it is shown) and the slogan under it. The greeting stays on one line and shrinks to
 * fit; with the slogan off there is no subtitle. Also used by the live preview in Settings so both look the same.
 */
export function GreetingLines({ now }: { now: Date }) {
  const { t: tr } = useLanguage();
  const { settings } = useSettings();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { profile, greeting } = settings;
  const title = greetingText(now, profile.name, greeting.showName, tr);
  const slogan = sloganText(now, { style: greeting.sloganStyle, custom: greeting.customSlogan }, tr);
  return <View style={s.greetingText}>
    <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={GREETING_MIN_FONT_SCALE} style={s.greeting}>{title}<Text style={{ color: colors.sun }}> ☀</Text></Text>
    {slogan === null ? null : <Text style={s.subtitle}>{slogan}</Text>}
  </View>;
}

/** Page header: DAYFORM kicker, language switch, greeting and the jump-to-today shortcut. */
export function GreetingHeader({ onToday, now }: { onToday: () => void; now: Date }) {
  const { t: tr } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <>
    <View style={s.kickerRow}><Text style={s.kicker}>DAYFORM ✦</Text></View>
    <View style={s.header}>
      <GreetingLines now={now} />
      <Pressable onPress={onToday} style={s.todayShortcut} accessibilityRole="button" accessibilityLabel={tr("Jump to today")}><Ionicons name="calendar-outline" size={21} color={colors.foreground} /></Pressable>
    </View>
  </>;
}

type DayHeaderProps = { selected: string; today: string; scheduled: Task[]; onAdd: () => void };

/** Day panel header: date, title, add button, summary, progress bar and the DAILY TIMELINE heading. */
export function DayHeader({ selected, today, scheduled, onAdd }: DayHeaderProps) {
  const { t: tr, locale, summary, timeFormat } = useLanguage();
  const config = useTimelineConfig();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const selectedDate = fromKey(selected);
  const selectedKeys = useMemo(() => [selected], [selected]);
  const marks = useDayMarks(selectedKeys)[selected];
  const dateTitle = selected === today ? tr("Today") : selectedDate.toLocaleDateString(locale, { weekday: "long" });
  const lunar = useSettings().settings.calendar.showLunar ? solarToLunar(selected) : null;
  const lunarText = lunar === null ? "" : ` · ${tr("LUNAR")} ${lunar.day}/${lunar.month}`;
  const completed = scheduled.filter(t => t.status === "done").length;
  const total = scheduled.reduce((sum, t) => sum + t.duration, 0);
  const progress = scheduled.length ? completed / scheduled.length * 100 : 0;
  return <>
    <View style={s.dailyTop}>
      <View><Text style={s.panelEyebrow}>{selectedDate.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}{lunarText}</Text><Text accessibilityRole="header" style={s.dailyTitle}>{dateTitle}<Text style={{ color: colors.punctuation }}>.</Text></Text></View>
      <Pressable onPress={onAdd} style={s.addSmall} accessibilityRole="button" accessibilityLabel={tr("Add task")}><Ionicons name="add" size={21} color={colors.primary} /></Pressable>
    </View>
    {marks && <View style={s.marksRow} accessible accessibilityLabel={marksLine(marks)}>
      <Ionicons name={markKinds(marks).holiday ? "flag" : "heart"} size={12} color={markKinds(marks).holiday ? colors.sun : colors.primary} />
      <Text numberOfLines={2} style={s.marksText}>{marksLine(marks)}</Text>
    </View>}
    <Text style={s.summary}>{summary(completed, scheduled.length, total)}</Text>
    <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%` }]} /></View>
    <View style={s.timelineHeading}><View style={s.liveDot} /><Text accessibilityRole="header" style={s.timelineHeadingText}>{tr("DAILY TIMELINE")}</Text><Text style={s.timelineHint}>{windowLabel(config, timeFormat)}</Text></View>
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
  kicker: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2.4, marginBottom: 9 },
  greetingText: { flex: 1, minWidth: 0, marginRight: 12 },
  greeting: { color: c.foreground, fontSize: 27, fontWeight: "800", letterSpacing: -1.1 },
  subtitle: { color: c.mutedForeground, fontSize: 13, marginTop: 6 },
  todayShortcut: { width: 44, height: 44, backgroundColor: c.card, borderRadius: 16, alignItems: "center", justifyContent: "center", shadowColor: c.shadowSoft, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  dailyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  panelEyebrow: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  dailyTitle: { fontSize: 26, color: c.foreground, fontWeight: "800", letterSpacing: -0.9 },
  addSmall: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" },
  marksRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginLeft: 4 },
  marksText: { flexShrink: 1, color: c.accentForeground, fontSize: 12, fontWeight: "700" },
  summary: { color: c.mutedForeground, fontSize: 12, marginTop: 10, marginLeft: 4 },
  progressTrack: { marginTop: 17, height: 5, borderRadius: 4, backgroundColor: c.track, overflow: "hidden", marginHorizontal: 4 },
  progressFill: { height: 5, borderRadius: 4, backgroundColor: c.primary },
  timelineHeading: { flexDirection: "row", alignItems: "center", marginTop: 28, marginBottom: 19, paddingHorizontal: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.live, marginRight: 8 },
  timelineHeadingText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5, color: c.foreground },
  timelineHint: { marginLeft: "auto", color: c.mutedForeground, fontSize: 10, fontWeight: "600" },
});
