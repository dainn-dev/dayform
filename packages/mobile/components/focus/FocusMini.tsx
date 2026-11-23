import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusClock } from "../../hooks/use-focus-clock";
import { useTabBarHeight } from "../../hooks/use-tab-bar-height";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
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
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = ({ colors: c, type, space, elevation }: Theme) => StyleSheet.create({
  pill: {
    position: "absolute", height: FAB_SIZE, borderRadius: FAB_SIZE / 2, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: 18,
    // The bordered styles' `raised` also draws a 1px line: on a filled pill it takes the fill colour, so it shows no grey ring.
    ...elevation.raised, borderColor: c.primary,
  },
  texts: { flex: 1, minWidth: 0 },
  time: { ...type.title, color: c.onPrimary, fontVariant: ["tabular-nums"] },
  title: { ...type.caption, color: c.onPrimary, opacity: 0.9 },
});
