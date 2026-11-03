import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { MAX_ROUTINE_NAME, type Routine, type RoutineItem } from "../../lib/routines";
import type { RoutinesContextValue } from "../../lib/routines-context";

type Props = {
  routine: Routine;
  colors: ThemeColors;
  onCancel: () => void;
  update: RoutinesContextValue["update"];
  remove: RoutinesContextValue["remove"];
};

/** An item while it is edited: the length stays text until saved. */
type Draft = { key: number; title: string; start: string; duration: string; category: string; steps: string[] };

const MESSAGES: Record<string, string> = {
  "invalid-name": "Give the routine a name.",
  "invalid-item": "Check each task: a title, a start time like 09:30 and a length that ends before midnight.",
  "no-tasks": "A routine needs at least one task. Delete the routine instead.",
  locked: "Routines could not be loaded, so they cannot be changed now. Try reopening the app.",
  "write-failed": "Your change could not be saved. Please try again.",
  unknown: "That routine no longer exists.",
};

/** Edit one routine: its name and, for each task, the title, start time and length; remove tasks or the whole routine. */
export function RoutineEditor({ routine, colors, onCancel, update, remove }: Props) {
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState(routine.name);
  const [drafts, setDrafts] = useState<Draft[]>(() => routine.items.map((item, key) => ({ key, ...item, duration: String(item.duration) })));
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (key: number, change: Partial<Draft>) => setDrafts(list => list.map(item => (item.key === key ? { ...item, ...change } : item)));

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const items: RoutineItem[] = drafts.map(({ title, start, duration, category, steps }) => ({ title, start: start.trim(), duration: Number(duration), category, steps }));
      const result = await update(routine.id, { name, items });
      if (result.ok) onCancel();
      else setMessage(t(MESSAGES[result.reason] ?? MESSAGES.unknown));
    } finally {
      setBusy(false);
    }
  };

  const del = async (): Promise<void> => {
    if (!armed) { setArmed(true); return; }
    if (busy) return;
    setBusy(true);
    try {
      const result = await remove(routine.id);
      if (result.ok) onCancel();
      else setMessage(t(MESSAGES[result.reason] ?? MESSAGES.unknown));
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
    <View style={s.top}>
      <Text accessibilityRole="header" style={s.heading}>{t("Edit routine")}</Text>
      <Pressable onPress={onCancel} accessibilityLabel={t("Cancel")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>{t("Routine name")}</Text>
      <TextInput value={name} onChangeText={setName} maxLength={MAX_ROUTINE_NAME} accessibilityLabel={t("Routine name")} placeholderTextColor={colors.placeholder} style={s.input} />

      <Text style={s.label}>{t("TASKS")}</Text>
      {drafts.map(item => <View key={item.key} style={s.item}>
        <View style={s.itemTop}>
          <TextInput value={item.title} onChangeText={title => patch(item.key, { title })} maxLength={300} accessibilityLabel={t("Task title")} placeholderTextColor={colors.placeholder} style={[s.input, s.titleInput]} />
          <Pressable onPress={() => setDrafts(list => list.filter(other => other.key !== item.key))} accessibilityRole="button" accessibilityLabel={`${t("Remove task")} ${item.title}`} style={s.trash}>
            <Ionicons name="trash-outline" size={20} color={colors.deleteText} />
          </Pressable>
        </View>
        <View style={s.itemRow}>
          <View style={s.field}><Text style={s.small}>{t("Start")}</Text>
            <TextInput value={item.start} onChangeText={start => patch(item.key, { start })} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="09:30" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Start")} style={s.input} /></View>
          <View style={s.field}><Text style={s.small}>{t("Minutes")}</Text>
            <TextInput value={item.duration} onChangeText={duration => patch(item.key, { duration: duration.replace(/\D/g, "") })} maxLength={4} keyboardType="number-pad" accessibilityLabel={t("Minutes")} placeholderTextColor={colors.placeholder} style={s.input} /></View>
        </View>
      </View>)}

      {message !== null && <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>}
      <Pressable onPress={() => void save()} disabled={busy} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{t("Save changes")}</Text></Pressable>
      <Pressable onPress={() => void del()} disabled={busy} accessibilityRole="button" style={[s.danger, armed && s.dangerArmed]}>
        <Text style={s.dangerText}>{armed ? t("Tap again to delete") : t("Delete routine")}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 26, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 9, marginTop: 20 },
  small: { color: c.mutedForeground, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  input: { minHeight: 48, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 14, color: c.foreground, fontSize: 15, borderWidth: 1, borderColor: c.inputBorder },
  item: { padding: 12, borderRadius: 16, backgroundColor: c.primarySoft, marginBottom: 10, gap: 10 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  titleInput: { flex: 1, minWidth: 0 },
  trash: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  itemRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, minWidth: 0 },
  message: { color: c.errorMessage, fontSize: 13, fontWeight: "700", marginTop: 8, textAlign: "center" },
  primary: { marginTop: 16, minHeight: 50, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
  danger: { marginTop: 10, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dangerArmed: { backgroundColor: c.errorBg },
  dangerText: { color: c.deleteText, fontSize: 14, fontWeight: "800" },
});
