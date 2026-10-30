import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import {
  checkDraft, defaultCalendar, draftFromDay, emptyDraft, type DraftField, type SpecialDraft,
} from "../../lib/special-day-draft";
import { useSpecialDays } from "../../lib/special-days-context";
import {
  MAX_SPECIAL_DAYS, MAX_SPECIAL_TITLE, SPECIAL_CALENDARS, SPECIAL_KINDS, SPECIAL_REMINDS,
  type SpecialCalendar, type SpecialKind, type SpecialRemind,
} from "../../lib/special-days";
import { fillPlaceholders } from "../../lib/text-template";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";

export type SpecialDayTarget = { kind: "new" } | { kind: "edit"; id: string };

type Props = { target: SpecialDayTarget | null; onClose: () => void };

const KIND_LABELS: Record<SpecialKind, string> = {
  birthday: "Birthday", wedding: "Wedding anniversary", memorial: "Memorial (giỗ)", custom: "Other",
};
const CALENDAR_LABELS: Record<SpecialCalendar, string> = { solar: "Solar date", lunar: "Lunar date" };
const REMIND_LABELS: Record<SpecialRemind, string> = {
  none: "No reminder", "day-before": "The day before, 08:00", "same-day": "On the day, 08:00",
};
const FIELD_MESSAGES: Record<DraftField, string> = {
  title: "Enter a name.",
  date: "Enter a valid day and month.",
  year: "Enter a four-digit year between 1900 and 2100, or leave it empty.",
};
const FAILURE_MESSAGES: Record<string, string> = {
  limit: "You can keep up to {count} special days.",
  locked: "Your special days could not be read safely, so changes are paused this session.",
  "write-failed": "Could not save your special days. Please try again.",
};

/** Dialog to add a special day or edit one. Dismissable by Cancel, the backdrop or Android back; Save stays above the keyboard. */
export function SpecialDayEditorModal({ target, onClose }: Props) {
  return <Modal visible={target !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    {target !== null && <EditorBody key={target.kind === "new" ? "new" : target.id} target={target} onClose={onClose} />}
  </Modal>;
}

function EditorBody({ target, onClose }: { target: SpecialDayTarget; onClose: () => void }) {
  const days = useSpecialDays();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const id = target.kind === "edit" ? target.id : null;
  const existing = id === null ? undefined : days.items.find(item => item.id === id);
  const [draft, setDraft] = useState<SpecialDraft>(() => (existing === undefined ? emptyDraft("birthday") : draftFromDay(existing)));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const change = (patch: Partial<SpecialDraft>) => { setDraft(current => ({ ...current, ...patch })); setFailure(null); };
  const check = checkDraft(draft);
  const blocked = days.locked || busy;
  const canSave = check.ok && !blocked;
  const problem: DraftField | null = !check.ok && (touched || draft.title !== "" || draft.day !== "") ? check.field : null;

  const run = async (action: () => ReturnType<typeof days.add>) => {
    setBusy(true);
    setFailure(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onClose(); else setFailure(result.reason);
  };
  const save = () => {
    setTouched(true);
    if (!check.ok || blocked) return;
    if (id === null) void run(() => days.add(check.input));
    else void run(() => days.update(id, check.input));
  };
  const remove = () => {
    if (id === null || blocked) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    void run(() => days.remove(id));
  };

  const kinds: Choice<SpecialKind>[] = SPECIAL_KINDS.map(value => ({ value, label: t(KIND_LABELS[value]) }));
  const calendars: Choice<SpecialCalendar>[] = SPECIAL_CALENDARS.map(value => ({ value, label: t(CALENDAR_LABELS[value]) }));
  const reminds: Choice<SpecialRemind>[] = SPECIAL_REMINDS.map(value => ({ value, label: t(REMIND_LABELS[value]) }));
  const message = failure !== null
    ? fillPlaceholders(t(FAILURE_MESSAGES[failure] ?? FAILURE_MESSAGES["write-failed"]), { count: String(MAX_SPECIAL_DAYS) })
    : problem === null ? null : t(FIELD_MESSAGES[problem]);

  return <KeyboardAvoidingView style={s.flex} behavior="padding">
    <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessible={false} importantForAccessibility="no" />
    <View style={s.center} pointerEvents="box-none">
      <View style={s.card} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={s.title}>{id === null ? t("New special day") : t("Edit special day")}</Text>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.caption}>{t("Name")}</Text>
          <TextInput value={draft.title} onChangeText={title => change({ title })} onBlur={() => setTouched(true)} editable={!blocked}
            placeholder={t("Name")} placeholderTextColor={colors.placeholder} maxLength={MAX_SPECIAL_TITLE} autoCorrect={false}
            returnKeyType="done" accessibilityLabel={t("Name")} style={s.input} />
          <Text style={s.caption}>{t("Kind")}</Text>
          <ChoiceChips choices={kinds} value={draft.kind} onChange={kind => change({ kind, calendar: id === null ? defaultCalendar(kind) : draft.calendar })} />
          <Text style={s.caption}>{t("Calendar")}</Text>
          <ChoiceChips choices={calendars} value={draft.calendar} onChange={calendar => change({ calendar })} />
          <View style={s.row}>
            <View style={s.field}>
              <Text style={s.caption}>{t("Day")}</Text>
              <TextInput value={draft.day} onChangeText={day => change({ day: day.replace(/\D/g, "") })} editable={!blocked} keyboardType="number-pad"
                maxLength={2} placeholder="15" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Day")} style={s.input} />
            </View>
            <View style={s.field}>
              <Text style={s.caption}>{t("Month")}</Text>
              <TextInput value={draft.month} onChangeText={month => change({ month: month.replace(/\D/g, "") })} editable={!blocked} keyboardType="number-pad"
                maxLength={2} placeholder="3" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Month")} style={s.input} />
            </View>
            <View style={s.field}>
              <Text style={s.caption}>{t("Year")}</Text>
              <TextInput value={draft.year} onChangeText={year => change({ year: year.replace(/\D/g, "") })} editable={!blocked} keyboardType="number-pad"
                maxLength={4} placeholder="1995" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Year")} style={s.input} />
            </View>
          </View>
          <Text style={s.helper}>{t("A lunar day in a leap month is kept in the regular month of the same number.")}</Text>
          <Text style={s.caption}>{t("Reminder")}</Text>
          <ChoiceChips choices={reminds} value={draft.remind} onChange={remind => change({ remind })} />
          {message !== null && <Text accessibilityRole="alert" style={s.error}>{message}</Text>}
        </ScrollView>
        <View style={s.actions}>
          {id !== null && <Pressable onPress={remove} disabled={blocked} accessibilityRole="button" style={[s.delete, confirmDelete && s.deleteArmed]}>
            <Text numberOfLines={1} style={[s.deleteText, confirmDelete && s.deleteTextArmed]}>{confirmDelete ? t("Tap again to delete") : t("Delete")}</Text>
          </Pressable>}
          <View style={s.flex} />
          <Pressable onPress={onClose} accessibilityRole="button" style={s.ghost}><Text style={s.ghostText}>{t("Cancel")}</Text></Pressable>
          <Pressable onPress={save} disabled={!canSave} accessibilityRole="button" accessibilityState={{ disabled: !canSave, busy }}
            style={[s.save, !canSave && s.disabled]}>
            <Text style={s.saveText}>{t("Save")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </KeyboardAvoidingView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scrim: { backgroundColor: c.scrim },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 },
  card: { width: "100%", maxWidth: 440, maxHeight: "100%", alignSelf: "center", backgroundColor: c.card, borderRadius: 22, padding: 20, flexShrink: 1 },
  title: { color: c.foreground, fontSize: 19, fontWeight: "800", marginBottom: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  input: { minHeight: 48, backgroundColor: c.background, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 10, color: c.foreground, fontSize: 16, borderWidth: 1, borderColor: c.inputBorder },
  row: { flexDirection: "row", gap: 8 },
  field: { flex: 1 },
  helper: { color: c.labelText, fontSize: 11, lineHeight: 16, marginTop: 8 },
  error: { color: c.errorMessage, fontSize: 12, lineHeight: 17, marginTop: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  delete: { minHeight: 44, paddingHorizontal: 12, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 1 },
  deleteArmed: { backgroundColor: c.errorBg },
  deleteText: { color: c.deleteText, fontSize: 13, fontWeight: "700" },
  deleteTextArmed: { color: c.errorMessage, fontWeight: "800" },
  ghost: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  ghostText: { color: c.mutedForeground, fontSize: 13, fontWeight: "700" },
  save: { minHeight: 44, paddingHorizontal: 22, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  saveText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
