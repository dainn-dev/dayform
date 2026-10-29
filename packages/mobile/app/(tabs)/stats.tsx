import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { computeStats, followToday, monthRange, shiftRange, weekRange, type RangeKind } from "../../lib/stats";
import { rangeTitle } from "../../lib/range-title";
import { useTasks } from "../../lib/tasks-context";
import { useHabitHints } from "../../components/habits/useHabitHints";
import { CategoryBreakdown } from "../../components/stats/CategoryBreakdown";
import { DayBars } from "../../components/stats/DayBars";
import { FocusHoursCard } from "../../components/stats/FocusHoursCard";
import { EmptyStats } from "../../components/stats/EmptyStats";
import { RangePicker } from "../../components/stats/RangePicker";
import { StreakCard } from "../../components/stats/StreakCard";
import { SummaryTiles } from "../../components/stats/SummaryTiles";
import { useTodayKey } from "../../components/stats/use-today-key";

export default function StatsScreen() {
  const { t, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks, loading } = useTasks();
  const weekStart = useSettings().settings.calendar.weekStart;
  const today = useTodayKey();
  // Null when habit hints are off or there is not enough history yet.
  const { focus } = useHabitHints({ summary: true });
  const [kind, setKind] = useState<RangeKind>("week");
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
      <Text accessibilityRole="header" style={s.title}>{t("Insights")}<Text style={{ color: colors.titleDot }}>.</Text></Text>
      <RangePicker kind={kind} title={rangeTitle(kind, range, locale)} onKindChange={setKind} onShift={shift} />
      {loading
        ? <ActivityIndicator color={colors.primary} style={s.loading} />
        : <View>
          {stats.scheduledCount === 0 ? <EmptyStats /> : <>
            <SummaryTiles stats={stats} />
            <DayBars perDay={stats.perDay} kind={kind} />
            <CategoryBreakdown perCategory={stats.perCategory} />
          </>}
          <StreakCard streak={stats.streak} busiestDay={stats.busiestDay} />
          {focus && <FocusHoursCard focus={focus} />}
        </View>}
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 32 },
  kicker: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  title: { color: c.foreground, fontSize: 31, fontWeight: "800", letterSpacing: -1 },
  loading: { marginTop: 40 },
});
