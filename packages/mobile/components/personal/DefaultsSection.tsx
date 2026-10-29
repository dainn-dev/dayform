import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";
import { reminderChoices, reminderLabel } from "../editor/reminder-choices";
import { PERMISSION_HINT, useReminderPermission } from "../editor/use-reminder-permission";
import { useLanguage } from "../../lib/language";
import { categories } from "../../lib/planner";
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
  const colors = useColors();
  const categoryColors = useCategoryColors();
  const permission = useReminderPermission();
  const [pickerFailed, setPickerFailed] = useState(false);
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { defaults } = settings;
  const change = (patch: Partial<Settings["defaults"]>) => { void update({ defaults: patch }); };

  const durations: Choice<Settings["defaults"]["duration"]>[] = DURATION_OPTIONS.map(value => ({ value, label: formatDuration(value) }));
  const cats: Choice<string>[] = categories.map(name => ({ value: name, label: t(name), accent: categoryColors[name].accent }));
  const modes: Choice<StartMode>[] = [{ value: "next-hour", label: t("Next full hour") }, { value: "fixed", label: t("Fixed time") }];
  const pickReminder = (next: number | null) => { change({ remind: next }); void permission.request(next); };

  const startText = defaults.startMode === "fixed" ? formatTime(defaults.startFixed) : t("next full hour");
  const reminderText = defaults.remind === null ? t("No reminder") : reminderLabel(defaults.remind, t);
  const details = defaults.scheduleNew
    ? [formatDuration(defaults.duration), t(defaults.category), startText, reminderText]
    : [formatDuration(defaults.duration), t(defaults.category), t("not scheduled")];

  return <View>
    <Text style={s.caption}>{t("Default duration")}</Text>
    <ChoiceChips choices={durations} value={defaults.duration} onChange={duration => change({ duration })} />
    <Text style={s.caption}>{t("Default category")}</Text>
    <ChoiceChips choices={cats} value={defaults.category} onChange={category => change({ category })} />
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  gap: { marginTop: 12 },
  hint: { color: c.warningText, backgroundColor: c.warningBg, fontSize: 12, lineHeight: 17, marginTop: 10, padding: 12, borderRadius: 12, overflow: "hidden" },
  preview: { color: c.emptyText, fontSize: 12, lineHeight: 18, marginTop: 16 },
});
