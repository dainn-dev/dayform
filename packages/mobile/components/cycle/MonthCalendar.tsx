import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { monthGrid, type CalendarDay } from "../../lib/cycle-calendar";
import type { CycleState } from "../../lib/cycle-model";
import { shiftMonth, type MonthRef } from "../../lib/cycle-ui-actions";
import { KIND_META, dayLabel, isMarked } from "../../lib/cycle-ui-kinds";
import { useLanguage } from "../../lib/language";
import { fromKey, type WeekStart } from "../../lib/planner";
import { weekdayShort } from "../../lib/weekdays";
import { CycleLegend } from "./CycleLegend";
import { KindSymbol } from "./KindSymbol";
import { useCycleFormat } from "./use-cycle-format";

type Props = {
  state: CycleState;
  today: string;
  weekStart: WeekStart;
  onSelectDay: (date: string) => void;
};

const OUT_OF_MONTH_OPACITY = 0.4;
const SYMBOL_SIZE = 9;

/** A month grid. Every day says what it is by color, by shape and in its spoken label; a tap opens the day. */
export function MonthCalendar({ state, today, weekStart, onSelectDay }: Props) {
  const { t, language } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [shown, setShown] = useState<MonthRef>(() => {
    const [year, month] = today.split("-").map(Number);
    return { year, month };
  });
  const grid = useMemo(() => monthGrid(shown.year, shown.month, weekStart, state, today), [shown, weekStart, state, today]);

  const cell = (day: CalendarDay) => {
    const marked = isMarked(day.kind) ? day.kind : null;
    const group = marked === null ? null : KIND_META[marked].group;
    return <Pressable key={day.date} onPress={() => onSelectDay(day.date)} accessibilityRole="button"
      accessibilityLabel={dayLabel(t, format.long(day.date), day.kind, day.isToday)}
      style={[s.cell, group !== null && { backgroundColor: colors.cycle[group].bg }, day.isToday && s.today, !day.inMonth && s.outside]}>
      <Text style={[s.dayNumber, day.isToday && s.todayNumber]}>{fromKey(day.date).getDate()}</Text>
      <View style={s.symbolSlot}>{marked !== null && <KindSymbol kind={marked} size={SYMBOL_SIZE} />}</View>
    </Pressable>;
  };

  return <View>
    <View style={s.nav}>
      <Pressable onPress={() => setShown(current => shiftMonth(current, -1))} accessibilityRole="button" accessibilityLabel={t("Previous month")} style={s.navButton}>
        <Ionicons name="chevron-back" size={19} color={colors.foreground} />
      </Pressable>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.monthTitle}>{format.month(shown.year, shown.month)}</Text>
      <Pressable onPress={() => setShown(current => shiftMonth(current, 1))} accessibilityRole="button" accessibilityLabel={t("Next month")} style={s.navButton}>
        <Ionicons name="chevron-forward" size={19} color={colors.foreground} />
      </Pressable>
    </View>
    <View style={s.row} accessible={false} importantForAccessibility="no-hide-descendants">
      {grid[0].map(day => <Text key={day.date} style={s.weekday}>{weekdayShort(day.date, language)}</Text>)}
    </View>
    {grid.map(week => <View key={week[0].date} style={s.row}>{week.map(cell)}</View>)}
    <CycleLegend grid={grid} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  navButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  monthTitle: { flex: 1, textAlign: "center", color: c.foreground, fontSize: 16, fontWeight: "800" },
  row: { flexDirection: "row", gap: 3, marginBottom: 3 },
  weekday: { flex: 1, textAlign: "center", color: c.labelText, fontSize: 10, fontWeight: "800" },
  cell: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 4, borderWidth: 1.5, borderColor: "transparent" },
  today: { borderColor: c.primary },
  outside: { opacity: OUT_OF_MONTH_OPACITY },
  dayNumber: { color: c.foreground, fontSize: 13, fontWeight: "700" },
  todayNumber: { fontWeight: "900" },
  symbolSlot: { height: SYMBOL_SIZE, justifyContent: "center" },
});
