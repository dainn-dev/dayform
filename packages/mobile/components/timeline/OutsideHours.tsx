import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { overlaps, type Task } from "../../lib/planner";
import { TaskCard } from "../TaskCard";

type Props = { outside: Task[]; scheduled: Task[]; onEdit: (task: Task) => void; onToggle: (task: Task) => void };

/** Tasks starting outside the visible day window (see Calendar settings), listed under the timeline. */
export function OutsideHours({ outside, scheduled, onEdit, onToggle }: Props) {
  const { t: tr } = useLanguage();
  const s = useThemedStyles(makeStyles);
  if (!outside.length) return null;
  return <View style={s.outside}>
    <Text accessibilityRole="header" style={s.outsideHeading}>{tr("Outside visible hours")}</Text>
    {outside.map(t => <View key={t.id} style={{ marginTop: 9 }}><TaskCard task={t} onPress={() => onEdit(t)} onToggle={() => onToggle(t)} conflict={scheduled.some(p => overlaps(t, p))} /></View>)}
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  outside: { borderTopWidth: 1, borderTopColor: t.colors.hairline, paddingTop: t.space.lg },
  outsideHeading: { ...t.type.caption, ...t.font.heavy, color: t.colors.mutedForeground },
});
