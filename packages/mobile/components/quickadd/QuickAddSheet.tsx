import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useCategories } from "../../lib/categories-context";
import { useLanguage } from "../../lib/language";
import { addDays, dateKey, fromKey, type Repeat } from "../../lib/planner";
import { planQuickAdd } from "../../lib/quick-add-plan";
import { useSettings } from "../../lib/settings-context";
import { hasConflict } from "../../lib/task-save";
import { useTasks } from "../../lib/tasks-context";

type Props = { visible: boolean; onClose: () => void; /** Text to start with, e.g. what another app shared. */ initialText?: string };

const REPEAT_LABEL: Record<Repeat, string> = { daily: "Every day", weekdays: "Weekdays", weekly: "Every week", monthly: "Every month" };

const randomSuffix = () => Math.random().toString(36).slice(2);

/** Type a sentence ("họp team 3pm mai 45p #work"), see what was understood, add it. Several tasks can be added in a row. */
export function QuickAddSheet({ visible, onClose, initialText = "" }: Props) {
  const { t, locale, time, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { settings } = useSettings();
  const { visible: categoryIds, label } = useCategories();
  const { tasks, mutate } = useTasks();
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  useEffect(() => { if (visible) { setText(initialText); setAdded(null); setFailed(false); } }, [visible, initialText]);
  const today = dateKey(new Date());

  const categories = useMemo(() => categoryIds.map(id => ({ id, name: label(id) })), [categoryIds, label]);
  const { form, plan } = useMemo(() => planQuickAdd(text, {
    now: new Date(), categories, settings, newId: () => `${Date.now()}-${randomSuffix()}`, newSeriesId: () => `series-${Date.now()}-${randomSuffix()}`,
  }), [text, categories, settings]);
  const overlapping = plan !== null && hasConflict(plan.candidate, tasks);

  const dateText = (key: string): string => {
    if (key === today) return t("Today");
    if (key === addDays(today, 1)) return t("Tomorrow");
    return fromKey(key).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  };
  // What was understood, as plain words: the words say it, so the chips carry no icons.
  const chips: string[] = [];
  if (form !== null) {
    chips.push(form.scheduled ? `${dateText(form.date)} ${time(form.time)}` : t("On your mind"), duration(form.duration));
    if (form.repeat !== null) chips.push(t(REPEAT_LABEL[form.repeat]));
    chips.push(label(form.category));
  }

  const add = async (): Promise<void> => {
    if (plan === null || saving.current) return;
    saving.current = true;
    setFailed(false);
    try {
      if (await mutate(plan.update)) {
        setAdded(plan.candidate.title);
        setText("");
      } else {
        setFailed(true);
      }
    } finally {
      saving.current = false;
    }
  };
  const close = () => { setText(""); setAdded(null); setFailed(false); onClose(); };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View><Text style={s.eyebrow}>{t("WRITE IT LIKE YOU SAY IT")}</Text><Text accessibilityRole="header" style={s.heading}>{t("Quick add")}</Text></View>
        <Pressable onPress={close} accessibilityLabel={t("Close quick add")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextInput value={text} onChangeText={value => { setText(value); setAdded(null); }} onSubmitEditing={() => void add()} autoFocus returnKeyType="done" blurOnSubmit={false}
          accessibilityLabel={t("Quick add")} placeholder={t("Team meeting 3pm tomorrow 45m")} placeholderTextColor={colors.placeholder} style={s.input} />
        {form !== null
          ? <>
            <Text accessibilityRole="header" style={s.title}>{form.title}</Text>
            <View style={s.chips}>{chips.map((chip, i) => <View key={i} style={s.chip}><Text style={s.chipText}>{chip}</Text></View>)}</View>
            {overlapping && <Text style={s.warn}>{t("⚠ Overlaps another task")}</Text>}
          </>
          : <Text style={s.hint}>{t("Try: Gym 6pm Friday, Pay rent every month, Read for 20m")}</Text>}
        <Pressable onPress={() => void add()} disabled={plan === null} accessibilityRole="button" accessibilityState={{ disabled: plan === null }} style={[s.primary, plan === null && s.primaryOff]}>
          <Text style={s.primaryText}>{t("Add task")}</Text>
        </Pressable>
        {added !== null && <Text accessibilityLiveRegion="polite" style={s.ok}>{`${t("Added")}: ${added}`}</Text>}
        {failed && <Text accessibilityLiveRegion="polite" style={s.warn}>{t("Your change could not be saved. Please try again.")}</Text>}
        <Text style={s.tips}>{t("Words I understand: today, tomorrow, Monday, 15/11, 3pm, 15h30, 45m, 2 hours, every day, every Friday, #category.")}</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: c.primary, marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  input: { minHeight: 56, backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 16, color: c.foreground, fontSize: 16, borderWidth: 1, borderColor: c.inputBorder },
  title: { color: c.foreground, fontSize: 20, fontWeight: "800", marginTop: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { justifyContent: "center", minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.primarySoft },
  chipText: { color: c.accentForeground, fontSize: 12, fontWeight: "700" },
  warn: { color: c.conflictText, fontSize: 12, fontWeight: "700", marginTop: 12 },
  hint: { color: c.mutedForeground, fontSize: 13, marginTop: 22 },
  primary: { marginTop: 26, minHeight: 54, borderRadius: 18, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: "800" },
  ok: { color: c.accentForeground, fontSize: 13, fontWeight: "700", marginTop: 14, textAlign: "center" },
  tips: { color: c.mutedForeground, fontSize: 11, marginTop: 28, lineHeight: 17 },
});
