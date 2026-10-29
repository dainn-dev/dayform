import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { ChoiceChips } from "./ChoiceChips";
import { useFieldStyles } from "./field-styles";
import { reminderChoices } from "./reminder-choices";
import { PERMISSION_HINT, useReminderPermission } from "./use-reminder-permission";

type Props = { value: number | null; onChange: (value: number | null) => void };

/**
 * Reminder lead-time chips. Picking one asks for notification permission (never on mount);
 * a refusal keeps the selection and shows a hint. The shell only mounts it for scheduled tasks.
 */
export function ReminderField({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const permission = useReminderPermission();

  const select = (next: number | null) => {
    onChange(next);
    void permission.request(next);
  };
  return <>
    <Text style={f.label}>{t("REMINDER")}</Text>
    <ChoiceChips choices={reminderChoices(value, t)} value={value} onChange={select} />
    {permission.denied && value !== null && <Text accessibilityRole="alert" style={s.hint}>{t(PERMISSION_HINT)}</Text>}
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.warningText, backgroundColor: c.warningBg, fontSize: 12, lineHeight: 17, marginTop: 10, padding: 12, borderRadius: 12, overflow: "hidden" },
});
