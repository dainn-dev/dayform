import React, { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
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
import { dateKey, fromKey, Task } from "../../lib/planner";
import { buildExploreSections, conflictIds, taskStats, type ExploreFilter } from "../../lib/explore-groups";

const FILTERS: readonly ExploreFilter[] = ["all", "active", "done"];
const MIN_TOUCH_TARGET = 44;

type ExploreSection = { key: "backlog" | "scheduled"; data: Task[] };
type RowProps = { task: Task; conflict: boolean; dateLabel: string | null; backlog: boolean; onEdit: (task: Task) => void; onToggle: (id: string) => void; labelStyle: object; wrapStyle: object };

/** One task row. Memoised so toggling or filtering does not re-render every card in the list. */
const TaskRow = memo(function TaskRow({ task, conflict, dateLabel, backlog, onEdit, onToggle, labelStyle, wrapStyle }: RowProps) {
  return <View style={wrapStyle}>
    {dateLabel && <Text style={labelStyle}>{dateLabel}</Text>}
    <TaskCard task={task} conflict={conflict} onPress={() => onEdit(task)} onToggle={() => onToggle(task.id)} onSchedule={backlog ? () => onEdit(task) : undefined} />
  </View>;
});

export default function TasksScreen() {
  const { t, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks, loading, error, clearError, mutate } = useTasks();
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [filter, setFilter] = useState<ExploreFilter>("all");
  const stats = useMemo(() => taskStats(tasks), [tasks]);
  const conflicts = useMemo(() => conflictIds(tasks), [tasks]);
  const sections = useMemo<ExploreSection[]>(() => {
    if (loading) return [];
    const { backlog, scheduled } = buildExploreSections(tasks, filter);
    return [{ key: "backlog", data: backlog }, { key: "scheduled", data: scheduled }];
  }, [tasks, filter, loading]);
  // The new list is derived from the committed one inside the store, never from a render-time task snapshot.
  const toggle = useCallback((id: string) => {
    void mutate(list => list.map(item => item.id === id ? { ...item, status: item.status === "done" ? "todo" : "done" } : item));
  }, [mutate]);
  const edit = useCallback((task: Task) => setEditing(task), []);
  const filterLabels: Record<ExploreFilter, string> = { all: t("All tasks"), active: t("Active"), done: t("Completed") };

  const renderItem = ({ item, section }: { item: Task; section: ExploreSection }) => {
    const dateLabel = section.key === "scheduled" && item.date
      ? fromKey(item.date).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
      : null;
    return <TaskRow task={item} conflict={conflicts.has(item.id)} dateLabel={dateLabel} backlog={section.key === "backlog"} onEdit={edit} onToggle={toggle} labelStyle={s.dateLabel} wrapStyle={s.cardWrap} />;
  };
  const renderSectionHeader = ({ section }: { section: ExploreSection }) => {
    const isBacklog = section.key === "backlog";
    return <View style={[s.groupHeading, !isBacklog && { marginTop: 30 }]}>
      <View style={[s.groupIcon, !isBacklog && { backgroundColor: colors.tealTint }]}><Ionicons name={isBacklog ? "albums-outline" : "calendar-outline"} size={18} color={isBacklog ? colors.primary : colors.tealAccent} /></View>
      <Text accessibilityRole="header" style={s.groupTitle}>{isBacklog ? t("Backlog") : t("Scheduled")}</Text>
      <Text style={s.count}>{section.data.length}</Text>
    </View>;
  };
  const renderSectionFooter = ({ section }: { section: ExploreSection }) => section.data.length ? null : <View style={s.empty}>
    <Text style={s.emptyText}>{section.key === "backlog" ? t("Nothing waiting here. Add a task whenever inspiration strikes.") : t("No scheduled tasks in this view yet.")}</Text>
  </View>;

  const header = <View>
    <View style={s.topRow}><Text accessibilityRole="header" style={s.kicker}>{t("THE BIG PICTURE")}</Text><LanguageSwitch /></View>
    <Text accessibilityRole="header" style={s.title}>{t("Your tasks")}<Text style={{ color: colors.titleDot }}>.</Text></Text>
    <Text style={s.subtitle}>{t("Every little thing, all in one place.")}</Text>
    <View style={s.stats}>
      <View><Text style={s.statNumber}>{stats.todo}</Text><Text style={s.statLabel}>{t("TO DO")}</Text></View><View style={s.statDivider} />
      <View><Text style={s.statNumber}>{stats.scheduled}</Text><Text style={s.statLabel}>{t("SCHEDULED")}</Text></View><View style={s.statDivider} />
      <View><Text style={s.statNumber}>{stats.done}</Text><Text style={s.statLabel}>{t("DONE")}</Text></View>
    </View>
    <View style={s.filters}>{FILTERS.map(value => <Pressable key={value} onPress={() => setFilter(value)} accessibilityRole="button" accessibilityState={{ selected: filter === value }} style={[s.filter, filter === value && s.filterActive]}>
      <Text style={[s.filterText, filter === value && s.filterTextActive]}>{filterLabels[value]}</Text>
    </Pressable>)}</View>
    {error && <Pressable onPress={clearError} accessibilityRole="button" style={s.error}><Text style={{ color: colors.errorMessage }}>{t(error)}  ×</Text></Pressable>}
    {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
  </View>;

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <SectionList<Task, ExploreSection>
      sections={sections} keyExtractor={item => item.id} stickySectionHeadersEnabled={false}
      renderItem={renderItem} renderSectionHeader={renderSectionHeader} renderSectionFooter={renderSectionFooter}
      ListHeaderComponent={header} ListFooterComponent={<SettingsSection />}
      contentContainerStyle={s.content} showsVerticalScrollIndicator={false}
      initialNumToRender={12} windowSize={7} maxToRenderPerBatch={10}
    />
    <Pressable onPress={() => setEditing(null)} accessibilityRole="button" accessibilityLabel={t("Create a new task")} style={s.fab}><Ionicons name="add" size={30} color={colors.onPrimary} /></Pressable>
    {editing !== undefined && <TaskEditor key={editing?.id ?? "new"} visible task={editing} defaultDate={dateKey(new Date())} onClose={() => setEditing(undefined)} />}
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 100 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  kicker: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  title: { color: c.foreground, fontSize: 31, fontWeight: "800", letterSpacing: -1 },
  subtitle: { color: c.mutedForeground, fontSize: 13, marginTop: 8 },
  stats: { backgroundColor: c.card, borderRadius: 23, marginTop: 29, paddingVertical: 21, flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  statNumber: { color: c.foreground, fontSize: 24, fontWeight: "800", textAlign: "center" },
  statLabel: { color: c.statLabel, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 5 },
  statDivider: { width: 1, height: 32, backgroundColor: c.statDivider },
  filters: { flexDirection: "row", gap: 8, marginTop: 27, marginBottom: 9 },
  filter: { backgroundColor: c.card, paddingHorizontal: 17, minHeight: MIN_TOUCH_TARGET, justifyContent: "center", borderRadius: 13 },
  filterActive: { backgroundColor: c.primary },
  filterText: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: c.onPrimary },
  groupHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 26, marginBottom: 14 },
  groupIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: c.primaryTint, justifyContent: "center", alignItems: "center" },
  groupTitle: { fontSize: 19, fontWeight: "800", color: c.foreground },
  count: { fontSize: 12, fontWeight: "800", color: c.countText, marginLeft: 2 },
  cardWrap: { marginBottom: 10 },
  dateLabel: { color: c.dateLabel, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginVertical: 8, marginLeft: 4 },
  empty: { padding: 18, backgroundColor: c.card, borderRadius: 17 },
  emptyText: { color: c.emptyText, fontSize: 12, lineHeight: 19 },
  fab: { position: "absolute", bottom: 18, right: 22, width: 57, height: 57, backgroundColor: c.primary, borderRadius: 20, alignItems: "center", justifyContent: "center", elevation: 7, shadowColor: c.fabShadow, shadowOpacity: 0.3, shadowRadius: 14 },
  error: { padding: 13, backgroundColor: c.errorBg, borderRadius: 12, marginTop: 15, minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
});
