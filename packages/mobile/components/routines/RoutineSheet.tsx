import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fromKey } from "../../lib/planner";
import { MAX_ROUTINE_NAME, routineTasks, savableTasks, type Routine } from "../../lib/routines";
import { useRoutines } from "../../lib/routines-context";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";

type Props = { visible: boolean; date: string; onClose: () => void };

const randomSuffix = () => Math.random().toString(36).slice(2);
const SAVE_MESSAGES: Record<string, string> = {
  "invalid-name": "Give the routine a name.",
  "no-tasks": "This day has no scheduled tasks to save.",
  limit: "You have reached the maximum number of routines.",
  locked: "Routines could not be loaded, so they cannot be changed now. Try reopening the app.",
  "write-failed": "Your change could not be saved. Please try again.",
  unknown: "That routine no longer exists.",
};

/** Lays a saved routine onto the shown day, or saves the shown day as a new routine. */
export function RoutineSheet({ visible, date, onClose }: Props) {
  const { t, locale, time } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { settings } = useSettings();
  const { items, addFromDay } = useRoutines();
  const { tasks, mutate } = useTasks();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dayLabel = fromKey(date).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const saveable = savableTasks(tasks, date).length;

  const apply = async (routine: Routine): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const added = routineTasks(routine, {
        date, remind: settings.defaults.remind, nowIso: new Date().toISOString(), newId: () => `${Date.now()}-${randomSuffix()}`,
      });
      if (added.length === 0) return setMessage(t("Nothing from this routine fits on the day."));
      if (await mutate(list => [...list, ...added], { undo: "bulk" })) {
        setMessage(null);
        onClose();
      } else {
        setMessage(t(SAVE_MESSAGES["write-failed"]));
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await addFromDay(name, tasks, date);
      if (result.ok) {
        setName("");
        setMessage(t("Routine saved."));
      } else {
        setMessage(t(SAVE_MESSAGES[result.reason] ?? SAVE_MESSAGES.unknown));
      }
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setMessage(null); onClose(); };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View><Text style={s.eyebrow}>{dayLabel.toUpperCase()}</Text><Text accessibilityRole="header" style={s.heading}>{t("Routines")}</Text></View>
        <Pressable onPress={close} accessibilityLabel={t("Close routines")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{t("ADD TO THIS DAY")}</Text>
        {items.length === 0
          ? <Text style={s.hint}>{t("No routines yet. Plan a day the way you like it, then save it below.")}</Text>
          : items.map(routine => <View key={routine.id} style={s.row}>
            <View style={s.rowText}>
              <Text numberOfLines={1} style={s.rowName}>{routine.name}</Text>
              <Text style={s.rowMeta}>{`${routine.items.length} ${t(routine.items.length === 1 ? "task" : "tasks")} · ${time(routine.items[0].start)}`}</Text>
            </View>
            <Pressable onPress={() => void apply(routine)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${t("Add routine")} ${routine.name}`} style={s.add}>
              <Ionicons name="add" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>)}

        <Text style={s.label}>{t("SAVE THIS DAY AS A ROUTINE")}</Text>
        <TextInput value={name} onChangeText={setName} maxLength={MAX_ROUTINE_NAME} onSubmitEditing={() => void save()} returnKeyType="done"
          accessibilityLabel={t("Routine name")} placeholder={t("Routine name")} placeholderTextColor={colors.placeholder} style={s.input} />
        <Pressable onPress={() => void save()} disabled={busy || saveable === 0} accessibilityRole="button" accessibilityState={{ disabled: busy || saveable === 0 }} style={[s.primary, saveable === 0 && s.primaryOff]}>
          <Text style={s.primaryText}>{saveable === 0 ? t("This day has no scheduled tasks to save.") : t("Save routine")}</Text>
        </Pressable>
        {message !== null && <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: c.primary, marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 9, marginTop: 22 },
  hint: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.card, marginBottom: 10 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: c.foreground, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: c.mutedForeground, fontSize: 12, marginTop: 4 },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 52, backgroundColor: c.card, borderRadius: 15, paddingHorizontal: 16, color: c.foreground, fontSize: 15, borderWidth: 1, borderColor: c.inputBorder },
  primary: { marginTop: 14, minHeight: 50, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: c.onPrimary, fontSize: 14, fontWeight: "800", textAlign: "center" },
  message: { color: c.accentForeground, fontSize: 13, fontWeight: "700", marginTop: 14, textAlign: "center" },
});
