import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { SettingsSection } from "../../components/settings/SettingsSection";
import { TaskEditor } from "../../components/TaskEditor";
import { TaskCard } from "../../components/TaskCard";
import { useTasks } from "../../lib/tasks-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { dateKey, fromKey, overlaps, Task } from "../../lib/planner";

export default function TasksScreen() {
  const { t, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks, loading, error, clearError, upsert } = useTasks();
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const backlog = tasks.filter(t => !t.start && (filter === "all" || (filter === "done" ? t.status === "done" : t.status !== "done")));
  const scheduled = tasks.filter(t => t.start && (filter === "all" || (filter === "done" ? t.status === "done" : t.status !== "done"))).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.start ?? "").localeCompare(b.start ?? ""));
  const toggle = (t: Task) => upsert({ ...t, status: t.status === "done" ? "todo" : "done" });
  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><Text style={s.kicker}>{t("THE BIG PICTURE")}</Text><LanguageSwitch /></View><Text style={s.title}>{t("Your tasks")}<Text style={{ color: colors.titleDot }}>.</Text></Text>
      <Text style={s.subtitle}>{t('Every little thing, all in one place.')}</Text>
      <View style={s.stats}><View><Text style={s.statNumber}>{tasks.filter(t => t.status !== "done").length}</Text><Text style={s.statLabel}>{t('TO DO')}</Text></View><View style={s.statDivider} /><View><Text style={s.statNumber}>{scheduled.length}</Text><Text style={s.statLabel}>{t('SCHEDULED')}</Text></View><View style={s.statDivider} /><View><Text style={s.statNumber}>{tasks.filter(t => t.status === "done").length}</Text><Text style={s.statLabel}>{t('DONE')}</Text></View></View>
      <View style={s.filters}>{(["all", "active", "done"] as const).map(v => <Pressable key={v} onPress={() => setFilter(v)} style={[s.filter, filter === v && s.filterActive]}><Text style={[s.filterText, filter === v && s.filterTextActive]}>{v === "all" ? t("All tasks") : v === "active" ? t("Active") : t("Completed")}</Text></Pressable>)}</View>
      {error && <Pressable onPress={clearError} style={s.error}><Text style={{ color: colors.errorMessage }}>{t(error)}  ×</Text></Pressable>}
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : <>
        <View style={s.groupHeading}><View style={s.groupIcon}><Ionicons name="albums-outline" size={18} color={colors.primary} /></View><Text style={s.groupTitle}>{t('Backlog')}</Text><Text style={s.count}>{backlog.length}</Text></View>
        {backlog.length ? backlog.map(t => <View key={t.id} style={s.cardWrap}><TaskCard task={t} onPress={() => setEditing(t)} onToggle={() => toggle(t)} onSchedule={() => setEditing(t)} /></View>) : <View style={s.empty}><Text style={s.emptyText}>{t('Nothing waiting here. Add a task whenever inspiration strikes.')}</Text></View>}
        <View style={[s.groupHeading, { marginTop: 30 }]}><View style={[s.groupIcon, { backgroundColor: colors.tealTint }]}><Ionicons name="calendar-outline" size={18} color={colors.tealAccent} /></View><Text style={s.groupTitle}>{t('Scheduled')}</Text><Text style={s.count}>{scheduled.length}</Text></View>
        {scheduled.length ? scheduled.map(t => <View key={t.id} style={s.cardWrap}><Text style={s.dateLabel}>{fromKey(t.date!).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</Text><TaskCard task={t} onPress={() => setEditing(t)} onToggle={() => toggle(t)} conflict={scheduled.some(p => overlaps(t, p))} /></View>) : <View style={s.empty}><Text style={s.emptyText}>{t('No scheduled tasks in this view yet.')}</Text></View>}
      </>}
      <SettingsSection />
    </ScrollView>
    <Pressable onPress={() => setEditing(null)} accessibilityLabel={t("Create a new task")} style={s.fab}><Ionicons name="add" size={30} color={colors.onPrimary} /></Pressable>
    {editing !== undefined && <TaskEditor key={editing?.id ?? "new"} visible task={editing} defaultDate={dateKey(new Date())} onClose={() => setEditing(undefined)} />}
  </SafeAreaView>;
}
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background }, content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 100 },
  kicker: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 }, title: { color: c.foreground, fontSize: 31, fontWeight: "800", letterSpacing: -1 }, subtitle: { color: c.mutedForeground, fontSize: 13, marginTop: 8 },
  stats: { backgroundColor: c.card, borderRadius: 23, marginTop: 29, paddingVertical: 21, flexDirection: "row", justifyContent: "space-around", alignItems: "center" }, statNumber: { color: c.foreground, fontSize: 24, fontWeight: "800", textAlign: "center" }, statLabel: { color: c.statLabel, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 5 }, statDivider: { width: 1, height: 32, backgroundColor: c.statDivider },
  filters: { flexDirection: "row", gap: 8, marginTop: 27, marginBottom: 9 }, filter: { backgroundColor: c.card, paddingHorizontal: 17, paddingVertical: 11, borderRadius: 13 }, filterActive: { backgroundColor: c.primary }, filterText: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: c.onPrimary },
  groupHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 26, marginBottom: 14 }, groupIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: c.primaryTint, justifyContent: "center", alignItems: "center" }, groupTitle: { fontSize: 19, fontWeight: "800", color: c.foreground }, count: { fontSize: 12, fontWeight: "800", color: c.countText, marginLeft: 2 }, cardWrap: { marginBottom: 10 }, dateLabel: { color: c.dateLabel, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginVertical: 8, marginLeft: 4 }, empty: { padding: 18, backgroundColor: c.card, borderRadius: 17 }, emptyText: { color: c.emptyText, fontSize: 12, lineHeight: 19 },
  fab: { position: "absolute", bottom: 18, right: 22, width: 57, height: 57, backgroundColor: c.primary, borderRadius: 20, alignItems: "center", justifyContent: "center", elevation: 7, shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 14 }, error: { padding: 13, backgroundColor: c.errorBg, borderRadius: 12, marginTop: 15 },
});