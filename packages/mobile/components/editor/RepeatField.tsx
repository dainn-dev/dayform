import React from "react";
import { Text } from "react-native";
import { useLanguage } from "../../lib/language";
import type { Repeat } from "../../lib/planner";
import { ChoiceChips, type Choice } from "./ChoiceChips";
import { EndsField } from "./EndsField";
import { useFieldStyles } from "./field-styles";

type Props = {
  value: Repeat | null;
  onChange: (value: Repeat | null) => void;
  /** The repeat's last day ('YYYY-MM-DD'); null = never ends. */
  until: string | null;
  onUntilChange: (until: string | null) => void;
  /** The task's own date, the earliest possible end date. */
  taskDate: string;
  /** Called when the native picker could not be opened. */
  onPickerError?: () => void;
};

const REPEAT_CHOICES: readonly Choice<Repeat | null>[] = [
  { value: null, label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

/** Repeat rule picker plus its end date. The shell only mounts it for scheduled tasks (a backlog task cannot repeat). */
export function RepeatField({ value, onChange, until, onUntilChange, taskDate, onPickerError }: Props) {
  const { t } = useLanguage();
  const f = useFieldStyles();
  const choices = REPEAT_CHOICES.map(choice => ({ ...choice, label: t(choice.label) }));
  return <>
    <Text style={f.label}>{t("REPEAT")}</Text>
    <ChoiceChips choices={choices} value={value} onChange={onChange} />
    {value !== null && <EndsField until={until} taskDate={taskDate} onChange={onUntilChange} onPickerError={onPickerError} />}
  </>;
}
