import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { overlaps, type Task } from "../../lib/planner";
import { TaskCard } from "../TaskCard";

type Props = { outside: Task[]; scheduled: Task[]; onEdit: (task: Task) => void; onToggle: (task: Task) => void };

/** Tasks starting outside the visible day window (see Calendar settings), listed under the timeline. */
export function OutsideHours({ outside, scheduled, onEdit, onToggle }: Props) {
  const { t: tr } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (!outside.length) return null;
  return <View style={s.outside}>
    <Text accessibilityRole="header" style={s.outsideHeading}>{tr("Outside visible hours")}</Text>
    {outside.map(t => <View key={t.id} style={{ marginTop: 9 }}><TaskCard task={t} onPress={() => onEdit(t)} onToggle={() => onToggle(t)} conflict={scheduled.some(p => overlaps(t, p))} /></View>)}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  outside: { borderTopWidth: 1, borderTopColor: c.hairline, paddingTop: 16 },
  outsideHeading: { color: c.mutedForeground, fontSize: 11, fontWeight: "800" },
});
