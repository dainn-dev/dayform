import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useCategories } from "../../lib/categories-context";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import { dateKey, fromKey } from "../../lib/planner";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";
import { moveOnUpdate, reviewWeek } from "../../lib/weekly-review";

type Props = { visible: boolean; anchor: string; onClose: () => void };

const SHOWN_UNFINISHED = 8;

/** Signed difference as text: "+2", "−1", or "same". */
function change(now: number, before: number, t: (text: string) => string): string {
  const delta = now - before;
  return delta === 0 ? t("same as last week") : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${t("vs last week")}`;
}

/** A look back at one week: totals against the week before, where the time went, and the unfinished tasks to move on. */
export function WeeklyReviewSheet({ visible, anchor, onClose }: Props) {
  const { t, locale, duration, time } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks, mutate } = useTasks();
  const { log } = useFocus();
  const { label } = useCategories();
  const weekStart = useSettings().settings.calendar.weekStart;
  const today = dateKey(new Date());
  const review = useMemo(() => reviewWeek(tasks, anchor, today, weekStart, log), [tasks, anchor, today, weekStart, log]);
  const [moving, setMoving] = useState(false);
  const dayName = (key: string) => fromKey(key).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
  const rate = review.completionRate === null ? null : Math.round(review.completionRate * 100);

  const moveOn = async (): Promise<void> => {
    if (moving) return;
    setMoving(true);
    try {
      if (await mutate(moveOnUpdate(review.unfinished.map(task => task.id), review.range, today), { undo: "bulk" })) onClose();
    } finally {
      setMoving(false);
    }
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View>
          <Text style={s.eyebrow}>{`${fromKey(review.range.from).toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${fromKey(review.range.to).toLocaleDateString(locale, { day: "numeric", month: "short" })}`.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={s.heading}>{t("Weekly review")}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("Close weekly review")} style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {review.scheduledCount === 0
          ? <Text style={s.hint}>{t("Nothing was scheduled this week.")}</Text>
          : <>
            <Text style={s.big}>{`${review.doneCount} ${t("of")} ${review.scheduledCount} ${t("tasks done")}`}{rate === null ? "" : ` · ${rate}%`}</Text>
            <Text style={s.sub}>{change(review.doneCount, review.previous.doneCount, t)}</Text>
            <View style={s.tiles}>
              <Tile s={s} label={t("Finished")} value={duration(review.doneMinutes)} />
              <Tile s={s} label={t("Focus time")} value={duration(review.focusMinutes)} />
            </View>
            {review.bestDay !== null && <Text style={s.line}>{`${t("Best day")}: ${dayName(review.bestDay)}`}</Text>}
            {review.topCategory !== null && <Text style={s.line}>{`${t("Most time on")}: ${label(review.topCategory.id)} (${duration(review.topCategory.doneMinutes)})`}</Text>}
          </>}

        {review.unfinished.length > 0 && <>
          <Text style={s.label}>{t("UNFINISHED").concat(` · ${review.unfinished.length}`)}</Text>
          {review.unfinished.slice(0, SHOWN_UNFINISHED).map(task => <View key={task.id} style={s.task}>
            <Text numberOfLines={1} style={s.taskTitle}>{task.title}</Text>
            <Text style={s.taskMeta}>{`${fromKey(task.date as string).toLocaleDateString(locale, { weekday: "short" })} · ${time(task.start as string)}`}</Text>
          </View>)}
          {review.unfinished.length > SHOWN_UNFINISHED && <Text style={s.hint}>{`+${review.unfinished.length - SHOWN_UNFINISHED} ${t("more")}`}</Text>}
          <Pressable onPress={() => void moveOn()} disabled={moving} accessibilityRole="button" style={s.primary}>
            <Ionicons name="arrow-forward" size={20} color={colors.onPrimary} /><Text style={s.primaryText}>{t("Move them to next week")}</Text>
          </Pressable>
          <Text style={s.hint}>{t("Each task keeps its time and moves to the same weekday a week later. You can undo it.")}</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function Tile({ s, label, value }: { s: ReturnType<typeof makeStyles>; label: string; value: string }) {
  return <View style={s.tile}><Text style={s.tileLabel}>{label.toUpperCase()}</Text><Text style={s.tileValue}>{value}</Text></View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: c.primary, marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  big: { color: c.foreground, fontSize: 22, fontWeight: "800", marginTop: 8 },
  sub: { color: c.mutedForeground, fontSize: 13, marginTop: 4 },
  tiles: { flexDirection: "row", gap: 12, marginTop: 18 },
  tile: { flex: 1, backgroundColor: c.card, borderRadius: 18, padding: 14 },
  tileLabel: { color: c.mutedForeground, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  tileValue: { color: c.foreground, fontSize: 17, fontWeight: "800", marginTop: 4 },
  line: { color: c.foreground, fontSize: 14, marginTop: 14 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginTop: 28, marginBottom: 9 },
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 10 },
  task: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 14, minHeight: 46, marginBottom: 8 },
  taskTitle: { flex: 1, color: c.foreground, fontSize: 14, fontWeight: "600" },
  taskMeta: { color: c.mutedForeground, fontSize: 12 },
  primary: { marginTop: 16, minHeight: 52, borderRadius: 16, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryText: { color: c.onPrimary, fontSize: 15, fontWeight: "800" },
});
