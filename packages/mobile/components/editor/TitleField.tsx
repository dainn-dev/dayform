import React from "react";
import { Text, TextInput } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { useFieldStyles } from "./field-styles";

type Props = { value: string; onChange: (value: string) => void };

export function TitleField({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useFieldStyles();
  return <>
    <Text style={s.label}>{t("TASK NAME")}</Text>
    <TextInput value={value} onChangeText={onChange} placeholder={t("What needs to get done?")} placeholderTextColor={colors.placeholder} style={s.input} maxLength={100} />
  </>;
}
