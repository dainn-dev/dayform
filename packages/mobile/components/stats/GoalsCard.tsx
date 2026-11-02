import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useCategories } from "../../lib/categories-context";
import { GOAL_CHOICES, MAX_GOALS, goalsProgress } from "../../lib/goals";
import { useGoals } from "../../lib/goals-context";
import { useLanguage } from "../../lib/language";
import type { DateRange, Stats } from "../../lib/stats";

type Props = { stats: Pick<Stats, "perCategory">; range: DateRange };

/** Progress toward the weekly goals of the shown week or month, with a button to set or change them. */
export function GoalsCard({ stats, range }: Props) {
  const { t, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { items, locked } = useGoals();
  const { label } = useCategories();
  const [editing, setEditing] = useState(false);
  const progress = useMemo(() => goalsProgress(items, stats, range), [items, stats, range]);
  return <View style={s.card}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={s.eyebrow}>{t("Goals").toUpperCase()}</Text>
      <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={t("Set goals")} style={s.edit}>
        <Ionicons name={items.length === 0 ? "add" : "create-outline"} size={20} color={colors.primary} />
      </Pressable>
    </View>
    {progress.length === 0
      ? <Text style={s.hint}>{t("Set a goal like 5 hours of Wellness a week and watch it fill up as you finish tasks.")}</Text>
      : progress.map(({ goal, doneMinutes, targetMinutes, ratio, reached }) => <View key={goal.id} accessible
        accessibilityLabel={`${label(goal.category)}: ${duration(doneMinutes)} ${t("of")} ${duration(targetMinutes)}${reached ? `, ${t("goal reached")}` : ""}`} style={s.row}>
        <View style={s.rowTop}>
          <Text numberOfLines={1} style={s.name}>{label(goal.category)}</Text>
          <Text style={[s.amount, reached && s.reached]}>{reached ? "✓ " : ""}{duration(doneMinutes)} / {duration(targetMinutes)}</Text>
        </View>
        <View style={s.track}><View style={[s.fill, reached && s.fillReached, { width: `${ratio * 100}%` }]} /></View>
      </View>)}
    {locked && <Text style={s.error}>{t("Goals could not be loaded, so they cannot be changed now. Try reopening the app.")}</Text>}
    {editing && <GoalSheet onClose={() => setEditing(false)} />}
  </View>;
}

function GoalSheet({ onClose }: { onClose: () => void }) {
  const { t, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { items, set, remove } = useGoals();
  const { visible, label } = useCategories();
  const [message, setMessage] = useState<string | null>(null);
  const full = items.length >= MAX_GOALS;
  const choose = async (category: string, minutes: number): Promise<void> => {
    const result = await set(category, minutes);
    setMessage(result.ok ? null : t(result.reason === "limit" ? "You have reached the maximum number of goals." : "Your change could not be saved. Please try again."));
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <SafeAreaView style={s.sheet} edges={["top", "bottom", "left", "right"]}>
      <View style={s.sheetTop}>
        <View><Text style={s.eyebrow}>{t("PER WEEK")}</Text><Text accessibilityRole="header" style={s.heading}>{t("Goals")}</Text></View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("Close goals")} style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={s.sheetContent}>
        <Text style={s.hint}>{t("Only finished tasks count toward a goal. Pick a time to set or change it.")}</Text>
        {visible.map(category => {
          const goal = items.find(item => item.category === category);
          return <View key={category} style={s.block}>
            <View style={s.blockTop}>
              <Text numberOfLines={1} style={s.name}>{label(category)}</Text>
              {goal && <Pressable onPress={() => void remove(goal.id)} accessibilityRole="button" accessibilityLabel={`${t("Remove goal")} ${label(category)}`} style={s.remove}><Ionicons name="trash-outline" size={18} color={colors.deleteText} /></Pressable>}
            </View>
            <View style={s.chips}>
              {GOAL_CHOICES.map(minutes => {
                const selected = goal?.minutesPerWeek === minutes;
                return <Pressable key={minutes} onPress={() => void choose(category, minutes)} disabled={full && !goal} accessibilityRole="button" accessibilityState={{ selected, disabled: full && !goal }}
                  style={[s.chip, selected && s.chipOn, full && !goal && s.chipOff]}><Text style={[s.chipText, selected && s.chipTextOn]}>{duration(minutes)}</Text></Pressable>;
              })}
            </View>
          </View>;
        })}
        {message !== null && <Text accessibilityLiveRegion="polite" style={s.error}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 23, padding: 18, marginTop: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  eyebrow: { color: c.mutedForeground, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  edit: { width: 44, height: 44, marginRight: -10, alignItems: "center", justifyContent: "center" },
  hint: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 },
  row: { marginTop: 12 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 6 },
  name: { flex: 1, color: c.foreground, fontSize: 14, fontWeight: "700" },
  amount: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
  reached: { color: c.accentForeground },
  track: { height: 8, borderRadius: 4, backgroundColor: c.track, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.primary, opacity: 0.7 },
  fillReached: { opacity: 1 },
  error: { color: c.errorBannerText, fontSize: 12, marginTop: 10 },
  sheet: { flex: 1, backgroundColor: c.background },
  sheetTop: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8, marginTop: 5 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  sheetContent: { paddingHorizontal: 24, paddingBottom: 32 },
  block: { marginTop: 22 },
  blockTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  remove: { width: 44, height: 44, marginVertical: -10, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder, justifyContent: "center" },
  chipOn: { backgroundColor: c.primary, borderColor: c.primary },
  chipOff: { opacity: 0.45 },
  chipText: { color: c.foreground, fontSize: 13, fontWeight: "700" },
  chipTextOn: { color: c.onPrimary },
});
