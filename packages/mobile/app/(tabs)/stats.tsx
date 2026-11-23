import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Title } from "../../components/ui/Title";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { computeStats, followToday, monthRange, shiftRange, weekRange, type RangeKind } from "../../lib/stats";
import { rangeTitle } from "../../lib/range-title";
import { useTasks } from "../../lib/tasks-context";
import { useHabitHints } from "../../components/habits/useHabitHints";
import { CategoryBreakdown } from "../../components/stats/CategoryBreakdown";
import { DayBars } from "../../components/stats/DayBars";
import { FocusHoursCard } from "../../components/stats/FocusHoursCard";
import { FocusTimeCard } from "../../components/stats/FocusTimeCard";
import { GoalsCard } from "../../components/stats/GoalsCard";
import { WeeklyReviewSheet } from "../../components/stats/WeeklyReviewSheet";
import { EmptyStats } from "../../components/stats/EmptyStats";
import { RangePicker } from "../../components/stats/RangePicker";
import { StreakCard } from "../../components/stats/StreakCard";
import { SummaryTiles } from "../../components/stats/SummaryTiles";
import { useTodayKey } from "../../components/stats/use-today-key";

export default function StatsScreen() {
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { tasks, loading } = useTasks();
  const weekStart = useSettings().settings.calendar.weekStart;
  const today = useTodayKey();
  // Null when habit hints are off or there is not enough history yet.
  const { focus } = useHabitHints({ summary: true });
  const [kind, setKind] = useState<RangeKind>("week");
  const [reviewing, setReviewing] = useState(false);
  // Any date inside the shown week/month; the range is derived from it so switching Week/Month keeps the position.
  const [anchor, setAnchor] = useState(today);
  const previousToday = useRef(today);
  useEffect(() => {
    const previous = previousToday.current;
    if (previous === today) return;
    previousToday.current = today;
    // Midnight passed: follow the new day only if the user was looking at the range of the old "today".
    setAnchor(current => followToday(kind, current, previous, today, weekStart));
  }, [today, kind, weekStart]);
  const range = useMemo(() => (kind === "week" ? weekRange(anchor, weekStart) : monthRange(anchor)), [kind, anchor, weekStart]);
  const stats = useMemo(() => computeStats(tasks, range, today), [tasks, range, today]);
  const shift = useCallback((delta: number) => setAnchor(current => shiftRange(kind, current, delta, weekStart).from), [kind, weekStart]);

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Text style={s.kicker}>{t("Stats").toUpperCase()}</Text>
      <Title>{t("Insights")}</Title>
      <RangePicker kind={kind} title={rangeTitle(kind, range, locale)} onKindChange={setKind} onShift={shift} action={
        <Pressable onPress={() => setReviewing(true)} accessibilityRole="button" style={s.review}>
          <Ionicons accessible={false} name="sparkles-outline" size={17} color={colors.primary} />
          <Text numberOfLines={1} style={s.reviewText}>{t("Weekly review")}</Text>
        </Pressable>} />
      {loading
        ? <ActivityIndicator color={colors.primary} style={s.loading} />
        : <View>
          {stats.scheduledCount === 0 ? <EmptyStats /> : <>
            <SummaryTiles stats={stats} />
            <DayBars perDay={stats.perDay} kind={kind} />
            <CategoryBreakdown perCategory={stats.perCategory} />
          </>}
          <GoalsCard stats={stats} range={range} />
          <StreakCard streak={stats.streak} busiestDay={stats.busiestDay} />
          <FocusTimeCard range={range} />
          {focus && <FocusHoursCard focus={focus} />}
        </View>}
    </ScrollView>
    <WeeklyReviewSheet visible={reviewing} anchor={kind === "week" ? range.from : today} onClose={() => setReviewing(false)} />
  </SafeAreaView>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: t.gutter, paddingTop: 28, paddingBottom: t.space.xxxl },
    kicker: { ...t.type.micro, color: c.primary, marginBottom: 10 },
    loading: { marginTop: 40 },
    // Same shape as the Week / Month dropdown beside it (components/tasks/FilterDropdown.tsx: card, md corner, 2 px
    // transparent border that the bordered styles' card depth replaces with their line), so the two read as one row.
    review: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingHorizontal: 13, borderRadius: t.radius.md, borderWidth: 2, borderColor: "transparent", backgroundColor: c.card, ...t.elevation.card },
    reviewText: { ...t.type.label, flex: 1, color: c.mutedForeground },
  });
};
