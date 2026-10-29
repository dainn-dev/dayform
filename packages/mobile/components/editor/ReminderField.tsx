import React, { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { reminderOptions } from "../../lib/planner";
import { ensureReminderChannel, requestReminderPermission } from "../../lib/reminders-expo";
import { ChoiceChips, type Choice } from "./ChoiceChips";
import { useFieldStyles } from "./field-styles";

type Props = { value: number | null; onChange: (value: number | null) => void };

const PERMISSION_HINT = "Notifications are turned off. Turn them on in system settings to get reminders.";
const MINUTES_PER_HOUR = 60;

function reminderLabel(minutesBefore: number): string {
  if (minutesBefore === 0) return "At start time";
  if (minutesBefore === MINUTES_PER_HOUR) return "1 hour before";
  return `${minutesBefore} min before`;
}

/** The presets, plus the task's current value when it is a custom one (so it stays visible). */
function choicesFor(current: number | null): Choice<number | null>[] {
  const minutesList: number[] = [...reminderOptions];
  if (current !== null && !minutesList.includes(current)) minutesList.push(current);
  minutesList.sort((a, b) => a - b);
  return [{ value: null, label: "No reminder" }, ...minutesList.map(value => ({ value, label: reminderLabel(value) }))];
}

/**
 * Reminder lead-time chips. Picking one asks for notification permission (never on mount);
 * a refusal keeps the selection and shows a hint. The shell only mounts it for scheduled tasks.
 */
export function ReminderField({ value, onChange }: Props) {
  const { t, language } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const select = async (next: number | null) => {
    onChange(next);
    if (next === null) return setPermissionDenied(false);
    try {
      await ensureReminderChannel(language);
      setPermissionDenied((await requestReminderPermission()) !== "granted");
    } catch {
      setPermissionDenied(true);
    }
  };
  const choices = choicesFor(value).map(choice => ({ ...choice, label: t(choice.label) }));
  return <>
    <Text style={f.label}>{t("Reminder")}</Text>
    <ChoiceChips choices={choices} value={value} onChange={next => { void select(next); }} />
    {permissionDenied && value !== null && <Text accessibilityRole="alert" style={s.hint}>{t(PERMISSION_HINT)}</Text>}
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.warningText, backgroundColor: c.warningBg, fontSize: 12, lineHeight: 17, marginTop: 10, padding: 12, borderRadius: 12, overflow: "hidden" },
});
