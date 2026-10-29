import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useLanguage } from "../../lib/language";
import { TaskEditor } from "../../components/editor/TaskEditor";
import { TaskCard } from "../../components/TaskCard";
import { DayHeader, GreetingHeader } from "../../components/timeline/DayHeader";
import { OutsideHours } from "../../components/timeline/OutsideHours";
import { Timeline } from "../../components/timeline/Timeline";
import { WeekStrip } from "../../components/timeline/WeekStrip";
import type { TaskPatch } from "../../components/timeline/drag-controller";
import { partitionVisible } from "../../components/timeline/layout";
import { SectionEyebrow } from "../../components/ui/SectionEyebrow";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useTasks } from "../../lib/tasks-context";
import { addDays, dateKey, minutes, mondayOf, Task } from "../../lib/planner";

export default function PlannerScreen() {
  const { t: tr } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const today = dateKey(new Date());
  const [selected, setSelected] = useState(today);
  const [week, setWeek] = useState(mondayOf(today));
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const { tasks, loading, error, clearError, upsert } = useTasks();
  const scheduled = useMemo(() => tasks.filter(t => t.date === selected && t.start).sort((a, b) => minutes(a.start!) - minutes(b.start!)), [tasks, selected]);
  const backlog = tasks.filter(t => !t.start);
  const { visible, outside } = partitionVisible(scheduled);

  const openNew = (time: string | null = null) => { setSlot(time); setEditing(null); };
  const close = () => { setEditing(undefined); setSlot(null); };
  const toggle = (t: Task) => upsert({ ...t, status: t.status === "done" ? "todo" : "done" });
  // Drag/resize saves this occurrence only: every occurrence of a series is its own task.
  const moveBlock = (t: Task, patch: TaskPatch) => upsert({ ...t, ...patch });
  const chooseToday = () => { setSelected(today); setWeek(mondayOf(today)); };

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <ScrollView scrollEnabled={!scrollLocked} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
      <GreetingHeader onToday={chooseToday} />
      <WeekStrip week={week} selected={selected} today={today} tasks={tasks} onSelect={setSelected} onShiftWeek={days => setWeek(addDays(week, days))} />

      {error && <Pressable onPress={clearError} style={s.errorBanner}><Ionicons name="alert-circle-outline" size={18} color={colors.errorIcon} /><Text style={{ color: colors.errorBannerText, fontSize: 12, flex: 1 }}>{tr(error)}</Text><Ionicons name="close" size={16} color={colors.errorIcon} /></Pressable>}
      <View style={s.dailyPanel}>
        <DayHeader selected={selected} today={today} scheduled={scheduled} onAdd={() => openNew()} />
        {loading
          ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 42 }} />
          : <Timeline visible={visible} scheduledCount={scheduled.length} showNow={selected === today} onAddAt={openNew} onEdit={setEditing} onMove={moveBlock} onLockChange={setScrollLocked} />}
        <OutsideHours outside={outside} scheduled={scheduled} onEdit={setEditing} onToggle={toggle} />
      </View>

      <View style={s.backlogHeader}><View><SectionEyebrow>{tr("WHEN YOU'RE READY")}</SectionEyebrow><Text style={s.backlogTitle}>{tr("On your mind")} <Text style={s.backlogCount}>{backlog.length}</Text></Text></View><Pressable onPress={() => router.push("/(tabs)/explore")} accessibilityLabel={tr("View all tasks")}><Text style={s.seeAll}>{tr("View all  →")}</Text></Pressable></View>
      {backlog.length ? backlog.slice(0, 2).map(t => <View key={t.id} style={{ marginBottom: 10 }}><TaskCard task={t} onPress={() => setEditing(t)} onToggle={() => toggle(t)} onSchedule={() => setEditing(t)} /></View>) : <Text style={s.backlogEmpty}>{tr("Your backlog is clear. Enjoy the space.")}</Text>}
    </ScrollView>
    <Pressable onPress={() => openNew()} accessibilityLabel={tr("Create a new task")} style={s.fab}><Ionicons name="add" size={30} color={colors.onPrimary} /></Pressable>
    {editing !== undefined && <TaskEditor key={editing?.id ?? `new-${slot ?? "blank"}`} visible task={editing} defaultDate={selected} defaultTime={slot} onClose={close} />}
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  scroll: { paddingHorizontal: 21, paddingTop: 24, paddingBottom: 110, maxWidth: 680, width: "100%", alignSelf: "center" },
  errorBanner: { flexDirection: "row", gap: 8, padding: 13, backgroundColor: c.errorBg, borderRadius: 14, alignItems: "center", marginBottom: 12 },
  dailyPanel: { backgroundColor: c.card, borderRadius: 27, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 24, shadowColor: c.shadowPanel, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  backlogHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 30, marginBottom: 16, paddingHorizontal: 2 },
  backlogTitle: { color: c.foreground, fontSize: 21, fontWeight: "800", letterSpacing: -0.6 },
  backlogCount: { color: c.primary, fontSize: 15 },
  seeAll: { color: c.primary, fontSize: 12, fontWeight: "800", marginBottom: 3 },
  backlogEmpty: { color: c.mutedForeground, fontSize: 12, paddingVertical: 13 },
  fab: { position: "absolute", bottom: 18, right: 22, width: 57, height: 57, backgroundColor: c.primary, borderRadius: 20, alignItems: "center", justifyContent: "center", shadowColor: c.fabShadow, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
});
