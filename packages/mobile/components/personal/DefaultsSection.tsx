import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";
import { reminderChoices, reminderLabel } from "../editor/reminder-choices";
import { PERMISSION_HINT, useReminderPermission } from "../editor/use-reminder-permission";
import { useLanguage } from "../../lib/language";
import { useCategories } from "../../lib/categories-context";
import { pickCategory } from "../../lib/new-task-defaults";
import { DURATION_OPTIONS, type Settings } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { fillPlaceholders } from "../../lib/text-template";
import { DefaultStartTimeField } from "./DefaultStartTimeField";
import { SwitchRow } from "./SwitchRow";

type StartMode = Settings["defaults"]["startMode"];

const PICKER_ERROR = "Could not open the picker. Please try again.";

/** "New tasks": what a task created from the + button or an empty slot starts with (settings.defaults). */
export function DefaultsSection() {
  const { settings, update } = useSettings();
  const { t, duration: formatDuration, time: formatTime } = useLanguage();
  const categoryColors = useCategoryColors();
  const { visible, label } = useCategories();
  const permission = useReminderPermission();
  const [pickerFailed, setPickerFailed] = useState(false);
  const s = useThemedStyles(makeStyles);
  const { defaults } = settings;
  const change = (patch: Partial<Settings["defaults"]>) => { void update({ defaults: patch }); };

  const durations: Choice<Settings["defaults"]["duration"]>[] = DURATION_OPTIONS.map(value => ({ value, label: formatDuration(value) }));
  // A stored default that was hidden or deleted is shown (and used by new tasks) as the fallback newTaskDefaults picks.
  const defaultCategory = pickCategory(defaults.category, visible);
  const cats: Choice<string>[] = visible.map(id => ({ value: id, label: label(id), accent: categoryColors.get(id).accent }));
  const modes: Choice<StartMode>[] = [{ value: "next-hour", label: t("Next full hour") }, { value: "fixed", label: t("Fixed time") }];
  const pickReminder = (next: number | null) => { change({ remind: next }); void permission.request(next); };

  const startText = defaults.startMode === "fixed" ? formatTime(defaults.startFixed) : t("next full hour");
  const reminderText = defaults.remind === null ? t("No reminder") : reminderLabel(defaults.remind, t);
  const details = defaults.scheduleNew
    ? [formatDuration(defaults.duration), label(defaultCategory), startText, reminderText]
    : [formatDuration(defaults.duration), label(defaultCategory), t("not scheduled")];

  return <View>
    <Text style={s.caption}>{t("Default duration")}</Text>
    <ChoiceChips choices={durations} value={defaults.duration} onChange={duration => change({ duration })} />
    <Text style={s.caption}>{t("Default category")}</Text>
    <ChoiceChips choices={cats} value={defaultCategory} onChange={category => change({ category })} />
    <Text style={s.caption}>{t("Default reminder")}</Text>
    <ChoiceChips choices={reminderChoices(defaults.remind, t)} value={defaults.remind} onChange={pickReminder} />
    {permission.denied && defaults.remind !== null && <Text accessibilityRole="alert" style={s.hint}>{t(PERMISSION_HINT)}</Text>}
    <View style={s.gap}>
      <SwitchRow label={t("Schedule new tasks by default")} value={defaults.scheduleNew} onChange={scheduleNew => change({ scheduleNew })}
        hint={t("A task created from a tapped time slot is always scheduled there.")} />
    </View>
    <Text style={s.caption}>{t("Start time of new tasks")}</Text>
    <ChoiceChips choices={modes} value={defaults.startMode} onChange={startMode => change({ startMode })} />
    {defaults.startMode === "fixed" && <DefaultStartTimeField value={defaults.startFixed} onChange={startFixed => change({ startFixed })} onPickerError={() => setPickerFailed(true)} />}
    {pickerFailed && <Text accessibilityRole="alert" style={s.hint}>{t(PICKER_ERROR)}</Text>}
    <Text style={s.preview}>{fillPlaceholders(t("A new task: {details}"), { details: details.join(" · ") })}</Text>
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    caption: { ...t.type.meta, color: c.mutedForeground, marginTop: t.space.md, marginBottom: t.space.xs + 2 },
    gap: { marginTop: t.space.sm },
    hint: { ...t.type.meta, ...t.font.regular, color: c.warningText, backgroundColor: c.warningBg, marginTop: t.space.sm, padding: 10, borderRadius: t.radius.md, overflow: "hidden" },
    preview: { ...t.type.meta, ...t.font.regular, color: c.emptyText, marginTop: t.space.md },
  });
};
