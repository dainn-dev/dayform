import React, { useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { Category, Repeat, Status, Task } from "../../lib/planner";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";
import { CategoryChips } from "./CategoryChips";
import { ConflictWarning } from "./ConflictWarning";
import { DurationStatusRow } from "./DurationStatusRow";
import { FormActions } from "./FormActions";
import { FormMessages } from "./FormMessages";
import { NotesField } from "./NotesField";
import { ReminderField } from "./ReminderField";
import { RepeatField } from "./RepeatField";
import { ScheduleFields } from "./ScheduleFields";
import { ScheduleToggle } from "./ScheduleToggle";
import { ScopeDialog } from "./ScopeDialog";
import { TitleField } from "./TitleField";
import { useEditorActions } from "./use-editor-actions";

type Props = {
  visible: boolean;
  task?: Task | null;
  defaultDate: string;
  defaultTime?: string | null;
  onClose: () => void;
  /**
   * EXTENSION POINT: extra form sections rendered after the built-in reminder and repeat fields
   * and before the notes field. Fields that must be saved need their state lifted into this
   * shell and merged into the values handed to `useEditorActions`.
   */
  extraFields?: ReactNode;
};

const PICKER_ERROR = "Could not open the picker. Please try again.";

export function TaskEditor({ visible, task, defaultDate, defaultTime, onClose, extraFields }: Props) {
  const { error } = useTasks();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState(task?.title ?? "");
  const [duration, setDuration] = useState(String(task?.duration ?? 30));
  const [scheduled, setScheduled] = useState(Boolean(task?.start || defaultTime));
  const [date, setDate] = useState(task?.date ?? defaultDate);
  const [time, setTime] = useState(task?.start ?? defaultTime ?? "09:00");
  const [category, setCategory] = useState<Category>(task?.category ?? "Focus");
  const [status, setStatus] = useState<Status>(task?.status ?? "todo");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [remind, setRemind] = useState<number | null>(task?.remind ?? null);
  const [repeat, setRepeat] = useState<Repeat | null>(task?.repeat ?? null);
  const actions = useEditorActions({ task, onClose, values: { title, duration, scheduled, date, time, category, status, notes, remind, repeat } });

  const updateSchedule = (value: boolean) => { setScheduled(value); actions.resetConfirmations(); };
  const updateDate = (value: string) => { setDate(value); actions.resetConfirmations(); };
  const updateTime = (value: string) => { setTime(value); actions.resetConfirmations(); };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.top}>
          <View><Text style={s.eyebrow}>{t("YOUR PLANNER")}</Text><Text style={s.heading}>{task ? t("Edit task") : t("New task")}</Text></View>
          <Pressable onPress={onClose} accessibilityLabel={t("Close task editor")} style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <TitleField value={title} onChange={setTitle} />
          <DurationStatusRow duration={duration} onDurationChange={setDuration} status={status} onStatusChange={setStatus} />
          <CategoryChips value={category} onChange={setCategory} />
          <ScheduleToggle value={scheduled} onChange={updateSchedule} />
          {scheduled && <ScheduleFields date={date} time={time} onDateChange={updateDate} onTimeChange={updateTime} onPickerError={() => actions.setValidation(PICKER_ERROR)} />}
          {/* Reminders need a notification-capable platform; a backlog task can neither remind nor repeat. */}
          {scheduled && Platform.OS !== "web" && <ReminderField value={remind} onChange={setRemind} />}
          {scheduled && <RepeatField value={repeat} onChange={setRepeat} />}
          {extraFields}
          <NotesField value={notes} onChange={setNotes} />
          <FormMessages validation={actions.validation} error={error} />
          {actions.confirmConflict && <ConflictWarning />}
          <FormActions saving={actions.saving} isEditing={Boolean(task)} confirmConflict={actions.confirmConflict} onSave={actions.save} onDelete={actions.deleteTask} />
        </ScrollView>
      </KeyboardAvoidingView>
      <ScopeDialog visible={actions.dialog !== null} mode={actions.dialog?.mode ?? "edit"} onChoose={actions.chooseScope} onCancel={actions.cancelDialog} />
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: c.primary, marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
});
