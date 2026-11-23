import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
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
const TOUCH_TARGET = 44;
/** Day cell geometry (a 7-column grid on a small phone): fixed so the grid never shifts between styles. */
const CELL_GAP = 3;
const CELL_PADDING = 4;
const TODAY_BORDER = 1.5;

/** A month grid. Every day says what it is by color, by shape and in its spoken label; a tap opens the day. */
export function MonthCalendar({ state, today, weekStart, onSelectDay }: Props) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const format = useCycleFormat();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) => StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  navButton: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: t.radius.lg, backgroundColor: t.colors.background, alignItems: "center", justifyContent: "center" },
  monthTitle: { ...t.type.subtitle, flex: 1, textAlign: "center", color: t.colors.foreground },
  row: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },
  weekday: { ...t.type.micro, flex: 1, textAlign: "center", color: t.colors.labelText },
  cell: {
    flex: 1, minHeight: TOUCH_TARGET, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center", gap: CELL_GAP,
    paddingVertical: CELL_PADDING, borderWidth: TODAY_BORDER, borderColor: "transparent",
  },
  today: { borderColor: t.colors.primary },
  outside: { opacity: OUT_OF_MONTH_OPACITY },
  dayNumber: { ...t.type.label, color: t.colors.foreground },
  todayNumber: t.font.heavy,
  symbolSlot: { height: SYMBOL_SIZE, justifyContent: "center" },
});
