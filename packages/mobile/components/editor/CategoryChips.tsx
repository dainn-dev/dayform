import React from "react";
import { Text } from "react-native";
import { useLanguage } from "../../lib/language";
import { categories, type Category } from "../../lib/planner";
import { ChoiceChips } from "./ChoiceChips";
import { useFieldStyles } from "./field-styles";

type Props = { value: Category; onChange: (value: Category) => void };

export function CategoryChips({ value, onChange }: Props) {
  const { t } = useLanguage();
  const f = useFieldStyles();
  const choices = categories.map(c => ({ value: c, label: t(c) }));
  return <>
    <Text style={f.label}>{t("CATEGORY")}</Text>
    <ChoiceChips choices={choices} value={value} onChange={onChange} />
  </>;
}
