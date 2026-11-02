import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useFocusClock } from "../../hooks/use-focus-clock";
import { useTabBarHeight } from "../../hooks/use-tab-bar-height";
import type { ThemeColors } from "../../constants/theme";
import { formatClock, remainingMs } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import { FAB_MARGIN, FAB_SIZE } from "../../lib/shell-layout";
import { useTasks } from "../../lib/tasks-context";

const SIDE_MARGIN = 16;
/** Leaves the right corner to the floating "new task" button. */
const RIGHT_CLEARANCE = FAB_MARGIN + FAB_SIZE + 12;

/** A small pill above the tab bar while a focus session exists and its sheet is closed: the time left, a tap opens the sheet. */
export function FocusMini() {
  const { session, openSheet } = useFocus();
  const { tasks } = useTasks();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const bottom = useTabBarHeight() + FAB_MARGIN;
  const now = useFocusClock();
  if (session === null) return null;
  const left = formatClock(remainingMs(session, now));
  const title = session.taskId === null ? t("Free focus") : tasks.find(task => task.id === session.taskId)?.title ?? t("Free focus");
  const phase = session.phase === "break" ? t("Break") : session.pausedAt !== null ? t("Paused") : t("Focus");
  return <Pressable onPress={() => openSheet(session.taskId)} accessibilityRole="button" accessibilityLabel={`${phase}, ${left}. ${t("Open the focus timer")}`}
    style={[s.pill, { bottom, left: SIDE_MARGIN, right: RIGHT_CLEARANCE }]}>
    <Ionicons name={session.phase === "break" ? "cafe-outline" : "timer-outline"} size={22} color={colors.onPrimary} />
    <View style={s.texts}>
      <Text style={s.time}>{left}</Text>
      <Text numberOfLines={1} style={s.title}>{phase} · {title}</Text>
    </View>
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  pill: { position: "absolute", height: FAB_SIZE, borderRadius: FAB_SIZE / 2, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, elevation: 6, shadowColor: c.shadowSoft, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  texts: { flex: 1, minWidth: 0 },
  time: { color: c.onPrimary, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  title: { color: c.onPrimary, fontSize: 11, fontWeight: "600", opacity: 0.9 },
});
