import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useTimelineConfig } from "../../hooks/use-timeline-config";
import { IconButton } from "../ui/IconButton";
import { Title } from "../ui/Title";
import { useDayMarks } from "../../hooks/use-day-marks";
import { markKinds, marksLine } from "../../lib/day-marks";
import { solarToLunar } from "../../lib/lunar";
import { greetingText, sloganText } from "../../lib/greeting";
import { useLanguage } from "../../lib/language";
import { fromKey, type Task } from "../../lib/planner";
import { useSettings } from "../../lib/settings-context";
import { windowLabel } from "../../lib/timeline-config";

const GREETING_MIN_FONT_SCALE = 0.6;
/** The day title shrinks rather than wraps beside its two buttons (a long weekday in the larger display styles). */
const DAY_TITLE_MIN_FONT_SCALE = 0.7;
const LIVE_DOT = 7;

/**
 * Greeting (with the name when it is shown) and the slogan under it. The greeting stays on one line and shrinks to
 * fit; with the slogan off there is no subtitle. Also used by the live preview in Settings so both look the same.
 */
export function GreetingLines({ now }: { now: Date }) {
  const { t: tr } = useLanguage();
  const { settings } = useSettings();
  const colors = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const { profile, greeting } = settings;
  const title = greetingText(now, profile.name, greeting.showName, tr);
  const slogan = sloganText(now, { style: greeting.sloganStyle, custom: greeting.customSlogan }, tr);
  return <View style={s.greetingText}>
    <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={GREETING_MIN_FONT_SCALE} style={s.greeting}>{title}<Text style={{ color: colors.sun }}> ☀</Text></Text>
    {slogan === null ? null : <Text style={s.subtitle}>{slogan}</Text>}
  </View>;
}

/** Page header: DAYFORM kicker, language switch, greeting and the jump-to-today shortcut. */
export function GreetingHeader({ onToday, onFocus, now }: { onToday: () => void; onFocus: () => void; now: Date }) {
  const { t: tr } = useLanguage();
  const colors = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  return <>
    <View style={s.kickerRow}><Text style={s.kicker}>DAYFORM ✦</Text></View>
    <View style={s.header}>
      <GreetingLines now={now} />
      <View style={s.headerButtons}>
        <Pressable onPress={onFocus} style={s.todayShortcut} accessibilityRole="button" accessibilityLabel={tr("Focus timer")}><Ionicons name="timer-outline" size={21} color={colors.foreground} /></Pressable>
        <Pressable onPress={onToday} style={s.todayShortcut} accessibilityRole="button" accessibilityLabel={tr("Jump to today")}><Ionicons name="calendar-outline" size={21} color={colors.foreground} /></Pressable>
      </View>
    </View>
  </>;
}

type DayHeaderProps = { selected: string; today: string; scheduled: Task[]; onAdd: () => void; onRoutines: () => void };

/** Day panel header: date, title, add button, summary, progress bar and the DAILY TIMELINE heading. */
export function DayHeader({ selected, today, scheduled, onAdd, onRoutines }: DayHeaderProps) {
  const { t: tr, locale, summary, timeFormat } = useLanguage();
  const config = useTimelineConfig();
  const colors = useTheme().colors;
  const s = useThemedStyles(makeStyles);
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
      <View style={s.dailyHead}><Text numberOfLines={1} style={s.panelEyebrow}>{selectedDate.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}{lunarText}</Text><Title numberOfLines={1} adjustsFontSizeToFit minimumFontScale={DAY_TITLE_MIN_FONT_SCALE}>{dateTitle}</Title></View>
      <View style={s.actions}>
        <IconButton icon="layers-outline" label={tr("Routines")} onPress={onRoutines} />
        <IconButton icon="add" label={tr("Add task")} onPress={onAdd} />
      </View>
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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
    kicker: { ...t.type.micro, color: c.primary, marginBottom: 9 },
    greetingText: { flex: 1, minWidth: 0, marginRight: t.space.md },
    headerButtons: { flexDirection: "row", gap: 10 },
    dailyHead: { flex: 1, minWidth: 0, marginRight: t.space.md },
    greeting: { ...t.type.display, color: c.foreground },
    subtitle: { ...t.type.body, color: c.mutedForeground, marginTop: 6 },
    todayShortcut: { width: 44, height: 44, backgroundColor: c.card, borderRadius: t.radius.lg, alignItems: "center", justifyContent: "center", ...t.elevation.card },
    dailyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: t.space.xs },
    panelEyebrow: { ...t.type.micro, color: c.primary, marginBottom: 6 },
    actions: { flexDirection: "row", gap: t.space.sm },
    marksRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: t.space.sm, marginLeft: t.space.xs },
    marksText: { ...t.type.meta, ...t.font.bold, flexShrink: 1, color: c.accentForeground },
    summary: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: 10, marginLeft: t.space.xs },
    progressTrack: { marginTop: 17, height: 5, borderRadius: t.radius.xs, backgroundColor: c.track, overflow: "hidden", marginHorizontal: t.space.xs },
    progressFill: { height: 5, borderRadius: t.radius.xs, backgroundColor: c.primary },
    timelineHeading: { flexDirection: "row", alignItems: "center", marginTop: 28, marginBottom: 19, paddingHorizontal: t.space.xs },
    liveDot: { width: LIVE_DOT, height: LIVE_DOT, borderRadius: LIVE_DOT / 2, backgroundColor: c.live, marginRight: t.space.sm },
    timelineHeadingText: { ...t.type.micro, color: c.foreground },
    timelineHint: { ...t.type.caption, marginLeft: "auto", color: c.mutedForeground },
  });
};
