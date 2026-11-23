import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import { TaskEditor } from "../../components/editor/TaskEditor";
import { RoutineSheet } from "../../components/routines/RoutineSheet";
import { TaskCard } from "../../components/TaskCard";
import { CarryOverBanner } from "../../components/timeline/CarryOverBanner";
import { DayHeader, GreetingHeader } from "../../components/timeline/DayHeader";
import { OutsideHours } from "../../components/timeline/OutsideHours";
import { Timeline } from "../../components/timeline/Timeline";
import { WeekStrip } from "../../components/timeline/WeekStrip";
import type { TaskPatch } from "../../components/timeline/drag-controller";
import { SectionEyebrow } from "../../components/ui/SectionEyebrow";
import { Surface } from "../../components/ui/Surface";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useNow } from "../../hooks/use-now";
import { useTimelineConfig } from "../../hooks/use-timeline-config";
import { partitionVisible } from "../../lib/timeline-config";
import { useSettings } from "../../lib/settings-context";
import { carryOverCandidates, carryOverUpdate } from "../../lib/carry-over";
import { keepUntilValid } from "../../lib/recurrence";
import { findEditTarget } from "../../lib/notification-actions";
import { useTasks } from "../../lib/tasks-context";
import { addDays, dateKey, minutes, weekStartOf, Task } from "../../lib/planner";

export default function PlannerScreen() {
  const { t: tr } = useLanguage();
  const colors = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const now = useNow();
  const today = dateKey(now);
  const [selected, setSelected] = useState(today);
  // Any day of the shown week; the week itself is derived so a changed week-start setting re-flows it.
  const [weekAnchor, setWeekAnchor] = useState(today);
  const week = weekStartOf(weekAnchor, useSettings().settings.calendar.weekStart);
  const config = useTimelineConfig();
  const previousToday = useRef(today);
  useEffect(() => {
    const previous = previousToday.current;
    if (previous === today) return;
    previousToday.current = today;
    // Midnight passed: follow the new day only if the user was looking at the old "today".
    if (selected !== previous) return;
    setSelected(today);
    setWeekAnchor(today);
  }, [today, selected]);
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const { openSheet: openFocus } = useFocus();
  const { tasks, loading, error, clearError, mutate } = useTasks();
  // A tapped reminder opens its task: `?edit=<id>` (validated by findEditTarget), cleared once consumed.
  // An editor that is already open is never replaced (its unsaved edits would be lost): the param waits
  // until the editor closes.
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  useEffect(() => {
    if (edit === undefined || loading || editing !== undefined) return;
    const target = findEditTarget(tasks, edit);
    if (target) {
      if (target.date) { setSelected(target.date); setWeekAnchor(target.date); }
      setEditing(target);
    }
    router.setParams({ edit: undefined });
  }, [edit, loading, tasks, editing]);
  const scheduled = useMemo(() => tasks.filter(t => t.date === selected && t.start).sort((a, b) => minutes(a.start!) - minutes(b.start!)), [tasks, selected]);
  const backlog = tasks.filter(t => !t.start);
  const { visible, outside } = useMemo(() => partitionVisible(config, scheduled), [config, scheduled]);

  const openNew = (time: string | null = null) => { setSlot(time); setEditing(null); };
  const close = () => { setEditing(undefined); setSlot(null); };
  // Patch the stored task inside the serial queue, never a render-time snapshot: a task deleted or edited
  // in the meantime is not resurrected or overwritten (a missing id is a no-op).
  const patchTask = (id: string, patch: (stored: Task) => Partial<Task>) =>
    // keepUntilValid: dragging a repeating task past its end date lifts the end date so the record stays valid.
    mutate(list => list.map(x => (x.id === id ? keepUntilValid({ ...x, ...patch(x) }) : x)));
  const toggle = (t: Task) => patchTask(t.id, x => ({ status: x.status === "done" ? "todo" : "done" }));
  // Drag/resize saves this occurrence only: every occurrence of a series is its own task.
  const moveBlock = (t: Task, patch: TaskPatch) => patchTask(t.id, () => patch);
  const chooseToday = () => { setSelected(today); setWeekAnchor(today); };
  // Unfinished tasks of a past day can be moved to today with one tap; the view then follows them.
  const carryOver = useMemo(() => carryOverCandidates(tasks, selected, today), [tasks, selected, today]);
  const moveToToday = async () => { if (await mutate(carryOverUpdate(selected, today), { undo: "bulk" })) chooseToday(); };

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <ScrollView scrollEnabled={!scrollLocked} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
      <GreetingHeader onToday={chooseToday} onFocus={() => openFocus()} now={now} />
      <WeekStrip week={week} selected={selected} today={today} tasks={tasks} onSelect={setSelected} onShiftWeek={days => setWeekAnchor(addDays(week, days))} />

      {error && <Pressable onPress={clearError} accessibilityRole="button" style={s.errorBanner}><Ionicons name="alert-circle-outline" size={18} color={colors.errorIcon} /><Text style={s.errorText}>{tr(error)}</Text><Ionicons name="close" size={16} color={colors.errorIcon} /></Pressable>}
      <Surface padding="none" style={s.dailyPanel}>
        <DayHeader selected={selected} today={today} scheduled={scheduled} onAdd={() => openNew()} onRoutines={() => setRoutinesOpen(true)} />
        {!loading && carryOver.length > 0 && <CarryOverBanner count={carryOver.length} onMove={moveToToday} />}
        {loading
          ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 42 }} />
          : <Timeline visible={visible} scheduledCount={scheduled.length} now={selected === today ? now : null} onAddAt={openNew} onEdit={setEditing} onToggle={toggle} onMove={moveBlock} onLockChange={setScrollLocked} />}
        <OutsideHours outside={outside} scheduled={scheduled} onEdit={setEditing} onToggle={toggle} />
      </Surface>

      <View style={s.backlogHeader}><View><SectionEyebrow>{tr("WHEN YOU'RE READY")}</SectionEyebrow><Text accessibilityRole="header" style={s.backlogTitle}>{tr("On your mind")} <Text style={s.backlogCount}>{backlog.length}</Text></Text></View><Pressable onPress={() => router.push("/(tabs)/explore")} accessibilityRole="link" accessibilityLabel={tr("View all tasks")}><Text style={s.seeAll}>{tr("View all  →")}</Text></Pressable></View>
      {backlog.length ? backlog.slice(0, 2).map(t => <View key={t.id} style={{ marginBottom: 10 }}><TaskCard task={t} onPress={() => setEditing(t)} onToggle={() => toggle(t)} onSchedule={() => setEditing(t)} /></View>) : <Text style={s.backlogEmpty}>{tr("Your backlog is clear. Enjoy the space.")}</Text>}
    </ScrollView>
    <RoutineSheet visible={routinesOpen} date={selected} onClose={() => setRoutinesOpen(false)} />
    {editing !== undefined && <TaskEditor key={editing?.id ?? `new-${slot ?? "blank"}`} visible task={editing} defaultDate={selected} defaultTime={slot} onClose={close} />}
  </SafeAreaView>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scroll: { paddingHorizontal: t.gutter, paddingTop: t.space.xxl, paddingBottom: 110, maxWidth: 680, width: "100%", alignSelf: "center" },
    errorBanner: { flexDirection: "row", gap: t.space.sm, padding: 13, backgroundColor: c.errorBg, borderRadius: t.radius.md, alignItems: "center", marginBottom: t.space.md },
    errorText: { ...t.type.meta, ...t.font.regular, flex: 1, color: c.errorBannerText },
    // Surface draws the card colour, the corner and the style's depth (a soft shadow, or a 1px line).
    dailyPanel: { paddingTop: t.space.xxl, paddingHorizontal: 18, paddingBottom: t.space.xxl },
    backlogHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 30, marginBottom: t.space.lg, paddingHorizontal: t.space.xxs },
    backlogTitle: { ...t.type.headline, color: c.foreground },
    // A smaller count inside the headline; it keeps the headline's line height so the line does not jump on Android.
    backlogCount: { ...t.type.subtitle, lineHeight: t.type.headline.lineHeight, color: c.primary },
    seeAll: { ...t.type.meta, ...t.font.heavy, color: c.primary, marginBottom: 3 },
    backlogEmpty: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, paddingVertical: 13 },
  });
};
