import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { useLanguage } from "../../lib/language";
import { MAX_ROUTINE_NAME, type Routine, type RoutineItem } from "../../lib/routines";
import type { RoutinesContextValue } from "../../lib/routines-context";

type Props = {
  routine: Routine;
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
export function RoutineEditor({ routine, onCancel, update, remove }: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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
      <IconButton icon="close" label={t("Cancel")} onPress={onCancel} />
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
      <Button label={t("Save changes")} onPress={() => void save()} disabled={busy} block style={s.primary} />
      <Pressable onPress={() => void del()} disabled={busy} accessibilityRole="button" style={[s.danger, armed && s.dangerArmed]}>
        <Text style={s.dangerText}>{armed ? t("Tap again to delete") : t("Delete routine")}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const TOUCH_TARGET = 44;

const makeStyles = ({ colors: c, type, font, radius, space, gutter, buttonRadius }: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  heading: { ...type.display, flex: 1, color: c.foreground },
  content: { paddingHorizontal: gutter, paddingBottom: 40 },
  label: { ...type.micro, color: c.labelText, marginBottom: 9, marginTop: space.xl },
  small: { ...type.caption, ...font.bold, color: c.mutedForeground, marginBottom: space.xs },
  input: {
    ...type.body, minHeight: 48, backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 14, color: c.foreground,
    borderWidth: 1, borderColor: c.inputBorder,
  },
  item: { padding: space.md, borderRadius: radius.lg, backgroundColor: c.primarySoft, marginBottom: 10, gap: 10 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  titleInput: { flex: 1, minWidth: 0 },
  trash: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  itemRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, minWidth: 0 },
  message: { ...type.label, color: c.errorMessage, marginTop: space.sm, textAlign: "center" },
  primary: { marginTop: space.lg },
  // Drawn by hand (not the kit's danger button): it stays plain text until the first tap arms it.
  danger: { marginTop: 10, minHeight: 48, borderRadius: buttonRadius, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  dangerArmed: { backgroundColor: c.errorBg },
  dangerText: { ...type.label, color: c.deleteText },
});
