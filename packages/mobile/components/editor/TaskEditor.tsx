import React, { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import { useRevealFocusedInput } from "../../hooks/use-reveal-focused-input";
import { footerLift } from "../../lib/keyboard-inset";
import type { ThemeColors } from "../../constants/theme";
import type { Category, Repeat, Status, Task } from "../../lib/planner";
import { useCategories } from "../../lib/categories-context";
import { useLanguage } from "../../lib/language";
import { newTaskDefaults, type NewTaskDefaults } from "../../lib/new-task-defaults";
import type { Settings } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";
import { NewTaskHints } from "../habits/NewTaskHints";
import { CategoryChips } from "./CategoryChips";
import { ConflictWarning } from "./ConflictWarning";
import { DurationStatusRow } from "./DurationStatusRow";
import { FormActions } from "./FormActions";
import { FormMessages } from "./FormMessages";
import { NotesField } from "./NotesField";
import { ReminderField } from "./ReminderField";
import { RepeatField } from "./RepeatField";
import { RevealOnFocusProvider } from "./reveal-context";
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

const FALLBACK_TIME = "09:00";
const CONTENT_BOTTOM_PADDING = 32;
const SCROLL_EVENT_THROTTLE_MS = 16;
/** A focus change reports before the new input is registered as focused, and before its layout settles. */
const REVEAL_ON_FOCUS_DELAY_MS = 60;

/** An existing task keeps its own values; only a NEW task (no `task`) takes the user's defaults. */
function initialValues(task: Task | null | undefined, settings: Settings, knownCategories: readonly string[], defaultDate: string, defaultTime: string | null | undefined): NewTaskDefaults {
  if (task) {
    return {
      duration: task.duration, category: task.category, remind: task.remind ?? null, scheduled: Boolean(task.start || defaultTime),
      date: task.date ?? defaultDate, time: task.start ?? defaultTime ?? FALLBACK_TIME,
    };
  }
  return newTaskDefaults(settings, { now: new Date(), slotTime: defaultTime ?? null, selectedDate: defaultDate, knownCategories });
}

export function TaskEditor({ visible, task, defaultDate, defaultTime, onClose, extraFields }: Props) {
  const { error } = useTasks();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { settings } = useSettings();
  const { visible: visibleCategories } = useCategories();
  const [initial] = useState(() => initialValues(task, settings, visibleCategories, defaultDate, defaultTime));
  const [title, setTitle] = useState(task?.title ?? "");
  const [duration, setDuration] = useState(String(initial.duration));
  const [scheduled, setScheduled] = useState(initial.scheduled);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [category, setCategoryState] = useState<Category>(initial.category);
  /** Once the user picks a category themselves, a habit hint must not offer to change it. */
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [status, setStatus] = useState<Status>(task?.status ?? "todo");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [remind, setRemind] = useState<number | null>(initial.remind);
  const [repeat, setRepeat] = useState<Repeat | null>(task?.repeat ?? null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(task?.repeatUntil ?? null);
  // The Modal is edge-to-edge, so Android does not resize it for the keyboard: pad the content and scroll the focused input into view.
  const keyboard = useKeyboardInset();
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const { reveal, onScroll } = useRevealFocusedInput(scrollRef, viewportRef, keyboard);
  const revealOnFocus = useCallback(() => { setTimeout(reveal, REVEAL_ON_FOCUS_DELAY_MS); }, [reveal]);
  // The action bar rises with the keyboard, so the scroll area already ends above it: no extra bottom padding needed.
  const insets = useSafeAreaInsets();
  const footerMargin = keyboard.top === null ? 0 : footerLift(keyboard.height, insets.bottom);
  const contentStyle = useMemo(() => [s.content, { paddingBottom: CONTENT_BOTTOM_PADDING }], [s.content]);
  const actions = useEditorActions({ task, onClose, values: { title, duration, scheduled, date, time, category, status, notes, remind, repeat, repeatUntil } });

  const setCategory = (next: Category) => { setCategoryState(next); setCategoryTouched(true); };
  /** A field that affects the overlap check or the scope choice: editing it drops a stale "Save anyway". */
  const resetting = <V,>(set: (value: V) => void) => (value: V) => { set(value); actions.resetConfirmations(); };
  /** Removing the rule also removes its end date, so it cannot come back with a later rule. */
  const changeRepeat = (next: Repeat | null) => { setRepeat(next); if (next === null) setRepeatUntil(null); actions.resetConfirmations(); };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <RevealOnFocusProvider value={revealOnFocus}>
      <View style={s.flex}>
        <View style={s.top}>
          <View><Text style={s.eyebrow}>{t("YOUR PLANNER")}</Text><Text style={s.heading}>{task ? t("Edit task") : t("New task")}</Text></View>
          <Pressable onPress={onClose} accessibilityLabel={t("Close task editor")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
        </View>
        <View ref={viewportRef} style={s.flex} collapsable={false}>
        <ScrollView ref={scrollRef} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScrollBeginDrag={Keyboard.dismiss}
          onScroll={onScroll} scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS} onContentSizeChange={reveal}>
          <TitleField value={title} onChange={setTitle} />
          <DurationStatusRow duration={duration} onDurationChange={resetting(setDuration)} status={status} onStatusChange={setStatus} />
          {!task && <NewTaskHints title={title} duration={duration} category={category} categoryTouched={categoryTouched} repeat={repeat} scheduled={scheduled}
            onApplyDuration={resetting(setDuration)} onApplyCategory={setCategory} onApplyRepeat={changeRepeat} />}
          <CategoryChips value={category} onChange={setCategory} />
          <ScheduleToggle value={scheduled} onChange={resetting(setScheduled)} />
          {scheduled && <ScheduleFields date={date} time={time} onDateChange={resetting(setDate)} onTimeChange={resetting(setTime)} onPickerError={() => actions.setValidation(PICKER_ERROR)} />}
          {/* Reminders need a notification-capable platform; a backlog task can neither remind nor repeat. */}
          {scheduled && Platform.OS !== "web" && <ReminderField value={remind} onChange={setRemind} />}
          {scheduled && <RepeatField value={repeat} onChange={changeRepeat} until={repeatUntil} onUntilChange={resetting(setRepeatUntil)} taskDate={date} onPickerError={() => actions.setValidation(PICKER_ERROR)} />}
          {extraFields}
          <NotesField value={notes} onChange={setNotes} />
        </ScrollView>
        </View>
        {/* Pinned below the scroll area so Save / Delete (and the message that explains a refusal) are always in reach;
            it rises above the keyboard, and the scroll area above it shrinks to fit. */}
        <View style={[s.footer, { marginBottom: footerMargin }]}>
          <FormMessages validation={actions.validation} error={error} />
          {actions.confirmConflict && <ConflictWarning />}
          <FormActions saving={actions.saving} isEditing={Boolean(task)} confirmConflict={actions.confirmConflict} onSave={actions.save} onDelete={actions.deleteTask} />
        </View>
      </View>
      </RevealOnFocusProvider>
      <ScopeDialog visible={actions.dialog.visible} mode={actions.dialog.mode} scopes={actions.dialogScopes} disabled={actions.saving} onChoose={actions.chooseScope} onCancel={actions.cancelDialog} />
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: c.primary, marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.background },
});
