import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Task } from "../lib/planner";
import { useLanguage } from "../lib/language";
import { useColors } from "../hooks/use-colors";
import { useCategoryColors } from "../hooks/use-category-colors";
import type { ThemeColors } from "../constants/theme";

type Props = { task: Task; onPress: () => void; onToggle: () => void; onSchedule?: () => void; conflict?: boolean; compact?: boolean };
export function TaskCard({ task, onPress, onToggle, onSchedule, conflict, compact }: Props) {
  const { t, duration, time } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const color = useCategoryColors()[task.category];
  return <Pressable onPress={onPress} accessibilityLabel={`${t("Edit")} ${task.title}`} style={[s.card, { backgroundColor: color.bg }, compact && { marginBottom: 10 }]}>
    <View style={[s.icon, { backgroundColor: color.accent + "22" }]}><Ionicons name={color.icon} size={21} color={color.accent} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={[s.title, task.status === "done" && s.done]}>{task.title}</Text>
      <Text style={s.meta}>{task.start ? `${time(task.start)}  ·  ` : ""}{duration(task.duration)}  ·  {t(task.category)}</Text>
      {conflict && <Text style={s.conflict}>{t("⚠ Overlaps another task")}</Text>}
    </View>
    <Pressable onPress={onToggle} hitSlop={10} accessibilityLabel={task.status === "done" ? `${t("Reopen")} ${task.title}` : `${t("Complete")} ${task.title}`} style={[s.check, task.status === "done" && { backgroundColor: color.accent, borderColor: color.accent }]}><Ionicons name="checkmark" size={16} color={task.status === "done" ? colors.onPrimary : "transparent"} /></Pressable>
    {onSchedule && <Pressable onPress={onSchedule} hitSlop={8} accessibilityLabel={`${t("Schedule")} ${task.title}`} style={s.arrow}><Ionicons name="arrow-forward" size={18} color={colors.primary} /></Pressable>}
  </Pressable>;
}
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, minHeight: 74 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { color: c.foreground, fontSize: 14, fontWeight: "700" }, done: { textDecorationLine: "line-through", color: c.mutedForeground },
  meta: { color: c.cardMeta, fontSize: 11, marginTop: 5, fontWeight: "600" },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.checkBorder, alignItems: "center", justifyContent: "center" },
  arrow: { marginLeft: 4, width: 24, height: 30, alignItems: "center", justifyContent: "center" },
  conflict: { color: c.conflictText, fontSize: 11, fontWeight: "700", marginTop: 5 },
});