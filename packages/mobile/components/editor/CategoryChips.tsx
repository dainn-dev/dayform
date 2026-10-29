import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { categories, type Category } from "../../lib/planner";
import { useFieldStyles } from "./field-styles";

type Props = { value: Category; onChange: (value: Category) => void };

export function CategoryChips({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <>
    <Text style={f.label}>{t("CATEGORY")}</Text>
    <View style={s.chips}>{categories.map(c => <Pressable key={c} onPress={() => onChange(c)} style={[s.chip, value === c && s.chipActive]}><Text style={[s.chipText, value === c && { color: colors.primary }]}>{t(c)}</Text></Pressable>)}</View>
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 15, paddingVertical: 11, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.inputBorder },
  chipActive: { backgroundColor: c.primaryTint, borderColor: c.primaryBorder },
  chipText: { color: c.foreground, fontSize: 12, fontWeight: "700" },
});
