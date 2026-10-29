import React, { useMemo } from "react";
import { View } from "react-native";
import type { CalendarKind } from "../../lib/cycle-calendar";
import { useCycle } from "../../lib/cycle-context";
import { markLabel, isMarked, timelineKind } from "../../lib/cycle-ui-kinds";
import { weekMarks } from "../../lib/cycle-calendar";
import { useLanguage } from "../../lib/language";
import { weekDays } from "../../lib/planner";
import { KindSymbol } from "./KindSymbol";

const MARK_SIZE = 7;

/**
 * Per-day cycle marks for the Timeline week strip: a map of date to kind, empty unless the user switched
 * "Show marks on the Timeline" on. The safe-days estimate is never included.
 */
export function useCycleMarks(week: string, today: string): Readonly<Record<string, CalendarKind>> {
  const { state } = useCycle();
  return useMemo(() => {
    const marks = weekMarks(weekDays(week), state, today);
    return Object.fromEntries(marks.map(mark => [mark.date, timelineKind(mark.kind)]));
  }, [week, state, today]);
}

/** A tiny shape, no text. Renders nothing for an unmarked day, so the strip looks unchanged when the feature is off. */
export function CycleMark({ kind, color }: { kind: CalendarKind | undefined; color?: string }) {
  const { t } = useLanguage();
  if (kind === undefined || !isMarked(kind)) return null;
  return <View accessible={false} accessibilityLabel={markLabel(t, kind)}>
    <KindSymbol kind={kind} size={MARK_SIZE} color={color} />
  </View>;
}
