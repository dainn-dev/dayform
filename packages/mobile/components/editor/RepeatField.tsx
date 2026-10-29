import React from "react";
import { Text } from "react-native";
import { useLanguage } from "../../lib/language";
import type { Repeat } from "../../lib/planner";
import { ChoiceChips, type Choice } from "./ChoiceChips";
import { useFieldStyles } from "./field-styles";

type Props = { value: Repeat | null; onChange: (value: Repeat | null) => void };

const REPEAT_CHOICES: readonly Choice<Repeat | null>[] = [
  { value: null, label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Every week" },
];

/** Repeat rule picker. The shell only mounts it for scheduled tasks (a backlog task cannot repeat). */
export function RepeatField({ value, onChange }: Props) {
  const { t } = useLanguage();
  const f = useFieldStyles();
  const choices = REPEAT_CHOICES.map(choice => ({ ...choice, label: t(choice.label) }));
  return <>
    <Text style={f.label}>{t("REPEAT")}</Text>
    <ChoiceChips choices={choices} value={value} onChange={onChange} />
  </>;
}
