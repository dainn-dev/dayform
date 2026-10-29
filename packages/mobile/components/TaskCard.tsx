import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Status, Task } from "../lib/planner";
import { useLanguage } from "../lib/language";
import { withAlpha } from "../lib/color-tint";
import { useColors } from "../hooks/use-colors";
import { useCategoryColors } from "../hooks/use-category-colors";
import type { ThemeColors } from "../constants/theme";

const ICON_TINT_ALPHA = 0.13;
const TOUCH_TARGET = 44;
const STATUS_TEXT: Record<Status, string> = { todo: "To do", in_progress: "Doing", done: "Done" };

type Props = { task: Task; onPress: () => void; onToggle: () => void; onSchedule?: () => void; conflict?: boolean; compact?: boolean };

export function TaskCard({ task, onPress, onToggle, onSchedule, conflict, compact }: Props) {
  const { t, duration, time } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const color = useCategoryColors()[task.category];
  const done = task.status === "done";
  const toggleLabel = `${done ? t("Reopen") : t("Complete")} ${task.title}`;
  const label = [
    `${t("Edit")} ${task.title}`,
    task.start ? time(task.start) : null,
    duration(task.duration),
    t(task.category),
    t(STATUS_TEXT[task.status]),
    conflict ? t("⚠ Overlaps another task") : null,
  ].filter(Boolean).join(", ");
  // The check and arrow sit inside an accessible Pressable, which hides them from VoiceOver and is unclear on
  // TalkBack, so the same two operations are also exposed as actions on the card itself.
  const actions = [
    { name: "toggle", label: done ? t("Reopen") : t("Complete") },
    ...(onSchedule ? [{ name: "schedule", label: t("Schedule") }] : []),
  ];
  const handleAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "toggle") onToggle();
    else if (event.nativeEvent.actionName === "schedule") onSchedule?.();
  };
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityActions={actions} onAccessibilityAction={handleAction}
    style={[s.card, { backgroundColor: color.bg }, compact && { marginBottom: 10 }]}>
    <View style={[s.icon, { backgroundColor: withAlpha(color.accent, ICON_TINT_ALPHA) }]}><Ionicons name={color.icon} size={21} color={color.accent} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={[s.title, done && s.done]}>{task.title}</Text>
      <Text style={s.meta}>{task.start ? `${time(task.start)}  ·  ` : ""}{duration(task.duration)}  ·  {t(task.category)}</Text>
      {conflict && <Text style={s.conflict}>{t("⚠ Overlaps another task")}</Text>}
    </View>
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={toggleLabel} style={s.checkTarget}>
      <View style={[s.check, done && { backgroundColor: color.accent, borderColor: color.accent }]}><Ionicons name="checkmark" size={16} color={done ? colors.onPrimary : "transparent"} /></View>
    </Pressable>
    {onSchedule && <Pressable onPress={onSchedule} accessibilityRole="button" accessibilityLabel={`${t("Schedule")} ${task.title}`} style={s.arrow}><Ionicons name="arrow-forward" size={18} color={colors.primary} /></Pressable>}
  </Pressable>;
}
// The 44dp targets use negative margins so the visual layout matches the old 24dp controls.
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, minHeight: 74 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { color: c.foreground, fontSize: 14, fontWeight: "700" }, done: { textDecorationLine: "line-through", color: c.mutedForeground },
  meta: { color: c.cardMeta, fontSize: 11, marginTop: 5, fontWeight: "600" },
  checkTarget: { width: TOUCH_TARGET, height: TOUCH_TARGET, marginHorizontal: -10, alignItems: "center", justifyContent: "center" },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.checkBorder, alignItems: "center", justifyContent: "center" },
  arrow: { width: TOUCH_TARGET, height: TOUCH_TARGET, marginLeft: -2, marginRight: -8, alignItems: "center", justifyContent: "center" },
  conflict: { color: c.conflictText, fontSize: 11, fontWeight: "700", marginTop: 5 },
});
