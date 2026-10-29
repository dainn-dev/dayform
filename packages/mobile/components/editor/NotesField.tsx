import React from "react";
import { Text, TextInput } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { useFieldStyles } from "./field-styles";

type Props = { value: string; onChange: (value: string) => void };

export function NotesField({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useFieldStyles();
  return <>
    <Text style={s.label}>{t("NOTES · OPTIONAL")}</Text>
    <TextInput value={value} onChangeText={onChange} placeholder={t("Add a little context...")} placeholderTextColor={colors.placeholder} multiline accessibilityLabel={t("Notes")} style={[s.input, { minHeight: 92, textAlignVertical: "top" }]} />
  </>;
}
