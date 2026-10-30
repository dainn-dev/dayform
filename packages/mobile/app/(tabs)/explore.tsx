import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language";
import { TaskEditor } from "../../components/TaskEditor";
import { TaskCard } from "../../components/TaskCard";
import { useTasks } from "../../lib/tasks-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { dateKey, fromKey, Task, type Category } from "../../lib/planner";
import { filterTasks } from "../../lib/search";
import { SearchBar } from "../../components/tasks/SearchBar";
import { CategoryFilter } from "../../components/tasks/CategoryFilter";
import { buildExploreSections, conflictIds, taskStats, type ExploreFilter } from "../../lib/explore-groups";
import { initialDays, nextDays, pageScheduled, pagingStep, shownScheduled } from "../../lib/explore-paging";
import { EarlierTasksToggle, ShowNextDays } from "../../components/tasks/ScheduledControls";
import { useHabitHints } from "../../components/habits/useHabitHints";
import { StaleBanner, StaleReviewStrip } from "../../components/habits/StaleBanner";
import { showStaleBanner } from "../../lib/habits-copy";
import { DEFAULT_STALE_DAYS } from "../../lib/habits-nudge";
import { useSettings } from "../../lib/settings-context";
import { useTodayKey } from "../../components/stats/use-today-key";

const FILTERS: readonly ExploreFilter[] = ["all", "active", "done"];
const MIN_TOUCH_TARGET = 44;

const SCROLL_EVENT_THROTTLE_MS = 64;

type ExploreSection = { key: "backlog" | "scheduled"; data: Task[] };
/** What the Scheduled group needs besides its visible rows. Paged is false while searching or filtering (everything is listed). */
type ScheduledMeta = { total: number; paged: boolean; earlierCount: number; hasMore: boolean; nextDays: number };
const ALL_SCHEDULED: ScheduledMeta = { total: 0, paged: false, earlierCount: 0, hasMore: false, nextDays: 0 };
type RowProps = { task: Task; conflict: boolean; dateLabel: string | null; backlog: boolean; highlight: string; onEdit: (task: Task) => void; onToggle: (id: string) => void; labelStyle: StyleProp<TextStyle>; wrapStyle: StyleProp<ViewStyle> };

/** One task row. Memoised so toggling or filtering does not re-render every card in the list. */
const TaskRow = memo(function TaskRow({ task, conflict, dateLabel, backlog, highlight, onEdit, onToggle, labelStyle, wrapStyle }: RowProps) {
  return <View style={wrapStyle}>
    {dateLabel && <Text style={labelStyle}>{dateLabel}</Text>}
    <TaskCard task={task} conflict={conflict} highlight={highlight} onPress={() => onEdit(task)} onToggle={() => onToggle(task.id)} onSchedule={backlog ? () => onEdit(task) : undefined} />
  </View>;
});

export default function TasksScreen() {
  const { t, locale } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks, loading, error, clearError, mutate } = useTasks();
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [filter, setFilter] = useState<ExploreFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<readonly Category[]>([]);
  const habitHintsOn = useSettings().settings.habits.hints;
  const { stale } = useHabitHints({ summary: true });
  const today = useTodayKey();
  // Dismissal lasts for the current day only and lives in memory (a new day or a restart brings the banner back).
  const [staleDismissedOn, setStaleDismissedOn] = useState<string | null>(null);
  // The ids are captured when "Review them" is pressed, so a task stays listed after it is ticked off.
  const [reviewIds, setReviewIds] = useState<readonly string[] | null>(null);
  const onlyIds = habitHintsOn ? reviewIds ?? undefined : undefined;
  const searching = query.trim() !== "" || selectedCategories.length > 0 || onlyIds !== undefined;
  const stats = useMemo(() => taskStats(tasks), [tasks]);
  const conflicts = useMemo(() => conflictIds(tasks), [tasks]);
  const visibleTasks = useMemo(() => filterTasks(tasks, { query, categories: selectedCategories, status: filter, onlyIds }), [tasks, query, selectedCategories, filter, onlyIds]);
  // The Scheduled group is paged by calendar days from today, only in the plain view. Searching or filtering lists every match.
  const paged = !searching && filter === "all";
  const pageKey = paged ? today : "all";
  // Days the user has paged to, valid for one key only: a new day or leaving a search/filter starts again at today + tomorrow.
  const [loaded, setLoaded] = useState<{ key: string; days: number }>({ key: "", days: 0 });
  const [showEarlier, setShowEarlier] = useState(false);
  // Leaving the plain view (search, filter) or a new day forgets the paging, so coming back starts at today + tomorrow.
  useEffect(() => { setLoaded({ key: "", days: 0 }); }, [pageKey]);
  const { sections, meta } = useMemo<{ sections: ExploreSection[]; meta: ScheduledMeta }>(() => {
    if (loading) return { sections: [], meta: ALL_SCHEDULED };
    const { backlog, scheduled } = buildExploreSections(visibleTasks, "all");
    let rows = scheduled;
    let scheduledMeta: ScheduledMeta = { ...ALL_SCHEDULED, total: scheduled.length };
    if (paged) {
      const daysShown = Math.max(initialDays(scheduled, today), loaded.key === pageKey ? loaded.days : 0);
      const page = pageScheduled(scheduled, today, daysShown);
      rows = shownScheduled(page, showEarlier);
      scheduledMeta = { total: scheduled.length, paged: true, earlierCount: page.earlierCount, hasMore: page.hasMore, nextDays: nextDays(scheduled, today, daysShown) };
    }
    const all: ExploreSection[] = [{ key: "backlog", data: backlog }, { key: "scheduled", data: rows }];
    // While searching, a section without matches is noise (its empty-state copy talks about adding tasks).
    return { sections: searching ? all.filter(section => section.data.length > 0) : all, meta: scheduledMeta };
  }, [visibleTasks, loading, searching, paged, today, pageKey, loaded, showEarlier]);
  const loadMoreDays = useCallback(() => setLoaded({ key: pageKey, days: meta.nextDays }), [pageKey, meta.nextDays]);
  // Scroll-driven paging (see pagingStep): measured on every scroll, so a short list at the bottom of the page pages too.
  // onEndReached is not used: React Native fires it once per content length and not again while the list stays in its end zone.
  const armed = useRef(true);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const step = pagingStep(contentSize.height - (contentOffset.y + layoutMeasurement.height), armed.current);
    armed.current = step.armed;
    if (step.load && meta.paged && meta.hasMore) loadMoreDays();
  };
  // The new list is derived from the committed one inside the store, never from a render-time task snapshot.
  const toggle = useCallback((id: string) => {
    void mutate(list => list.map(item => item.id === id ? { ...item, status: item.status === "done" ? "todo" : "done" } : item));
  }, [mutate]);
  const toggleCategory = useCallback((category: Category) => {
    setSelectedCategories(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category]);
  }, []);
  const reviewStale = () => { setFilter("all"); setSelectedCategories([]); setReviewIds(stale.ids); };
  const edit = useCallback((task: Task) => setEditing(task), []);
  // One formatter per locale: building it per row per render is slow on long lists.
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }), [locale]);
  const filterLabels: Record<ExploreFilter, string> = { all: t("All tasks"), active: t("Active"), done: t("Completed") };

  const renderItem = ({ item, section }: { item: Task; section: ExploreSection }) => {
    const dateLabel = section.key === "scheduled" && item.date
      ? dateFormat.format(fromKey(item.date)).toUpperCase()
      : null;
    return <TaskRow task={item} conflict={conflicts.has(item.id)} dateLabel={dateLabel} backlog={section.key === "backlog"} highlight={query} onEdit={edit} onToggle={toggle} labelStyle={s.dateLabel} wrapStyle={s.cardWrap} />;
  };
  const earlierToggle = meta.paged && meta.earlierCount > 0
    ? <EarlierTasksToggle count={meta.earlierCount} expanded={showEarlier} onToggle={() => setShowEarlier(current => !current)} />
    : null;
  const renderSectionHeader = ({ section }: { section: ExploreSection }) => {
    const isBacklog = section.key === "backlog";
    return <View>
      <View style={[s.groupHeading, !isBacklog && { marginTop: 30 }]}>
        <View style={[s.groupIcon, !isBacklog && { backgroundColor: colors.tealTint }]}><Ionicons name={isBacklog ? "albums-outline" : "calendar-outline"} size={18} color={isBacklog ? colors.primary : colors.tealAccent} /></View>
        <Text accessibilityRole="header" style={s.groupTitle}>{isBacklog ? t("Backlog") : t("Scheduled")}</Text>
        <Text style={s.count}>{isBacklog ? section.data.length : meta.total}</Text>
      </View>
      {!isBacklog && earlierToggle}
    </View>;
  };
  const renderSectionFooter = ({ section }: { section: ExploreSection }) => {
    if (section.key === "scheduled" && section.data.length > 0) return meta.paged && meta.hasMore ? <ShowNextDays onPress={loadMoreDays} /> : null;
    if (section.data.length > 0) return null;
    const upcomingOnly = section.key === "scheduled" && meta.paged && meta.earlierCount > 0;
    return <View style={s.empty}>
      <Text style={s.emptyText}>{section.key === "backlog" ? t("Nothing waiting here. Add a task whenever inspiration strikes.") : t(upcomingOnly ? "No upcoming scheduled tasks." : "No scheduled tasks in this view yet.")}</Text>
    </View>;
  };

  const resultCountLabel = `${visibleTasks.length} ${t(visibleTasks.length === 1 ? "result" : "results")}`;
  const noMatches = <View style={s.noMatches}>
    <Ionicons name="search-outline" size={26} color={colors.mutedForeground} />
    <Text accessibilityRole="header" style={s.noMatchesTitle}>{t("No tasks match your search")}</Text>
    <Text style={s.emptyText}>{t("Try different words or clear the filters.")}</Text>
  </View>;

  const header = <View>
    <View style={s.topRow}><Text accessibilityRole="header" style={s.kicker}>{t("THE BIG PICTURE")}</Text></View>
    <Text accessibilityRole="header" style={s.title}>{t("Your tasks")}<Text style={{ color: colors.titleDot }}>.</Text></Text>
    <Text style={s.subtitle}>{t("Every little thing, all in one place.")}</Text>
    {onlyIds !== undefined
      ? <StaleReviewStrip onShowAll={() => setReviewIds(null)} />
      : showStaleBanner(stale.count, staleDismissedOn, today) && <StaleBanner count={stale.count} days={DEFAULT_STALE_DAYS} onReview={reviewStale} onDismiss={() => setStaleDismissedOn(today)} />}
    <SearchBar value={query} onChange={setQuery} />
    <View style={s.stats}>
      <View><Text style={s.statNumber}>{stats.todo}</Text><Text style={s.statLabel}>{t("TO DO")}</Text></View><View style={s.statDivider} />
      <View><Text style={s.statNumber}>{stats.scheduled}</Text><Text style={s.statLabel}>{t("SCHEDULED")}</Text></View><View style={s.statDivider} />
      <View><Text style={s.statNumber}>{stats.done}</Text><Text style={s.statLabel}>{t("DONE")}</Text></View>
    </View>
    <View style={s.filters}>{FILTERS.map(value => <Pressable key={value} onPress={() => setFilter(value)} accessibilityRole="button" accessibilityState={{ selected: filter === value }} style={[s.filter, filter === value && s.filterActive]}>
      <Text style={[s.filterText, filter === value && s.filterTextActive]}>{filterLabels[value]}</Text>
    </Pressable>)}</View>
    <CategoryFilter selected={selectedCategories} onToggle={toggleCategory} />
    {searching && !loading && <Text accessibilityLiveRegion="polite" style={s.resultCount}>{resultCountLabel}</Text>}
    {error && <Pressable onPress={clearError} accessibilityRole="button" style={s.error}><Text style={{ color: colors.errorMessage }}>{t(error)}  ×</Text></Pressable>}
    {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
  </View>;

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <SectionList<Task, ExploreSection>
      sections={sections} keyExtractor={item => item.id} stickySectionHeadersEnabled={false}
      renderItem={renderItem} renderSectionHeader={renderSectionHeader} renderSectionFooter={renderSectionFooter}
      ListHeaderComponent={header} ListEmptyComponent={searching && !loading ? noMatches : null}
      contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
      onScroll={onScroll} scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS} onContentSizeChange={() => { armed.current = true; }}
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
  resultCount: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 14, marginLeft: 4 },
  noMatches: { alignItems: "center", gap: 8, padding: 26, marginTop: 20, backgroundColor: c.card, borderRadius: 17 },
  noMatchesTitle: { color: c.foreground, fontSize: 15, fontWeight: "800", textAlign: "center" },
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
