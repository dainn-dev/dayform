import React, { useMemo } from "react";
import { Text } from "react-native";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useCategories } from "../../lib/categories-context";
import { categoryChoices } from "../../lib/category-usage";
import { useLanguage } from "../../lib/language";
import type { Category } from "../../lib/planner";
import { ChoiceChips, type Choice } from "./ChoiceChips";
import { useFieldStyles } from "./field-styles";

type Props = { value: Category; onChange: (value: Category) => void };

/** Visible categories plus the task's current one (hidden or deleted), so opening an old task never changes it. */
export function CategoryChips({ value, onChange }: Props) {
  const { t } = useLanguage();
  const f = useFieldStyles();
  const { visible, label } = useCategories();
  const colors = useCategoryColors();
  const choices = useMemo<Choice<string>[]>(
    () => categoryChoices(visible, value).map(id => ({ value: id, label: label(id), accent: colors.get(id).accent })),
    [visible, value, label, colors],
  );
  return <>
    <Text style={f.label}>{t("CATEGORY")}</Text>
    <ChoiceChips choices={choices} value={value} onChange={onChange} />
  </>;
}
