import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { IconButton } from "../ui/IconButton";
import { useLanguage } from "../../lib/language";
import { fromKey } from "../../lib/planner";
import { MAX_ROUTINE_NAME, planRoutine, savableTasks, type Routine } from "../../lib/routines";
import { RoutineEditor } from "./RoutineEditor";
import { useRoutines } from "../../lib/routines-context";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";

type Props = { visible: boolean; date: string; onClose: () => void };

const randomSuffix = () => Math.random().toString(36).slice(2);
const SAVE_MESSAGES: Record<string, string> = {
  "invalid-name": "Give the routine a name.",
  "invalid-item": "Check each task: a title, a start time like 09:30 and a length that ends before midnight.",
  "no-tasks": "This day has no scheduled tasks to save.",
  limit: "You have reached the maximum number of routines.",
  locked: "Routines could not be loaded, so they cannot be changed now. Try reopening the app.",
  "write-failed": "Your change could not be saved. Please try again.",
  unknown: "That routine no longer exists.",
};

/** Lays a saved routine onto the shown day, or saves the shown day as a new routine. */
export function RoutineSheet({ visible, date, onClose }: Props) {
  const { t, locale, time } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { settings } = useSettings();
  const { items, addFromDay, update, remove } = useRoutines();
  const { tasks, mutate } = useTasks();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState<Routine | null>(null);
  const dayLabel = fromKey(date).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const saveable = useMemo(() => savableTasks(tasks, date), [tasks, date]);
  const saveableKey = saveable.map(task => task.id).join("|");

  // A fresh day (or a changed list of tasks) starts with every task of it ticked.
  useEffect(() => { setPicked(saveable.map(task => task.id)); }, [saveableKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setPicked(list => (list.includes(id) ? list.filter(other => other !== id) : [...list, id]));

  const apply = async (routine: Routine): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      // The tasks are re-read from the store inside mutate, so a second tap cannot add the same ones again.
      let plan = { tasks: [] as ReturnType<typeof planRoutine>["tasks"], duplicates: 0, outside: 0 };
      const done = await mutate(list => {
        plan = planRoutine(routine, {
          date, remind: settings.defaults.remind, nowIso: new Date().toISOString(), newId: () => `${Date.now()}-${randomSuffix()}`,
        }, list);
        return plan.tasks.length === 0 ? list : [...list, ...plan.tasks];
      }, { undo: "bulk" });
      if (!done) return setMessage(t(SAVE_MESSAGES["write-failed"]));
      if (plan.tasks.length > 0) {
        setMessage(null);
        onClose();
      } else {
        setMessage(t(plan.duplicates > 0 ? "Every task of this routine is already on the day." : "Nothing from this routine fits on the day."));
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await addFromDay(name, tasks, date, picked);
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

  const close = () => { setMessage(null); setEditing(null); onClose(); };

  if (editing !== null) {
    return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setEditing(null)}>
      <RoutineEditor routine={editing} onCancel={() => setEditing(null)} update={update} remove={remove} />
    </Modal>;
  }

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View style={s.titles}><Text style={s.eyebrow}>{dayLabel.toUpperCase()}</Text><Text accessibilityRole="header" style={s.heading}>{t("Routines")}</Text></View>
        <IconButton icon="close" label={t("Close routines")} onPress={close} />
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
            <Pressable onPress={() => { setMessage(null); setEditing(routine); }} accessibilityRole="button" accessibilityLabel={`${t("Edit routine")} ${routine.name}`} style={s.iconBtn}>
              <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={() => void apply(routine)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${t("Add routine")} ${routine.name}`} style={s.add}>
              <Ionicons name="add" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>)}

        <Text style={s.label}>{t("SAVE THIS DAY AS A ROUTINE")}</Text>
        {saveable.length > 0 && <View style={s.pickList}>
          {saveable.map(task => {
            const on = picked.includes(task.id);
            return <Pressable key={task.id} onPress={() => toggle(task.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={s.pickRow}>
              <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.mutedForeground} />
              <Text numberOfLines={1} style={s.pickTitle}>{task.title}</Text>
              <Text style={s.rowMeta}>{time(task.start as string)}</Text>
            </Pressable>;
          })}
        </View>}
        <TextInput value={name} onChangeText={setName} maxLength={MAX_ROUTINE_NAME} onSubmitEditing={() => void save()} returnKeyType="done"
          accessibilityLabel={t("Routine name")} placeholder={t("Routine name")} placeholderTextColor={colors.placeholder} style={s.input} />
        <Pressable onPress={() => void save()} disabled={busy || picked.length === 0} accessibilityRole="button" accessibilityState={{ disabled: busy || picked.length === 0 }} style={[s.primary, picked.length === 0 && s.primaryOff]}>
          <Text style={s.primaryText}>{saveable.length === 0 ? t("This day has no scheduled tasks to save.") : picked.length === 0 ? t("Tick the tasks to save.") : t("Save routine")}</Text>
        </Pressable>
        {message !== null && <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const TOUCH_TARGET = 44;
const ADD_SIZE = 44;

const makeStyles = ({ colors: c, type, font, radius, space, gutter, elevation, buttonRadius }: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  titles: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.micro, color: c.primary, marginBottom: 5 },
  heading: { ...type.display, color: c.foreground },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  label: { ...type.micro, color: c.labelText, marginBottom: 9, marginTop: 22 },
  hint: { ...type.body, color: c.mutedForeground },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: 14, borderRadius: radius.lg, backgroundColor: c.card, marginBottom: 10, ...elevation.card },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { ...type.subtitle, color: c.foreground },
  rowMeta: { ...type.meta, color: c.mutedForeground, marginTop: space.xs },
  iconBtn: { width: 40, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  pickList: { marginBottom: space.md },
  pickRow: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 10 },
  pickTitle: { ...type.body, ...font.semibold, flex: 1, minWidth: 0, color: c.foreground },
  add: { width: ADD_SIZE, height: ADD_SIZE, borderRadius: ADD_SIZE / 2, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  input: {
    ...type.body, minHeight: 52, backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: space.lg, color: c.foreground,
    borderWidth: 1, borderColor: c.inputBorder,
  },
  // Drawn by hand (not the kit's Button): its words can be a whole sentence that wraps onto two lines.
  primary: { marginTop: 14, minHeight: 48, borderRadius: buttonRadius, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  primaryOff: { opacity: 0.45 },
  primaryText: { ...type.label, color: c.onPrimary, textAlign: "center" },
  message: { ...type.label, color: c.accentForeground, marginTop: 14, textAlign: "center" },
});
