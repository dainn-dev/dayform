import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

/** `accent` adds a small colour dot before the label (category chips). */
export type Choice<V extends string | number | null> = { value: V; label: string; accent?: string };

type Props<V extends string | number | null> = {
  choices: readonly Choice<V>[];
  value: V;
  onChange: (value: V) => void;
};

/** A wrapping row of single-select chips (44px touch targets). */
export function ChoiceChips<V extends string | number | null>({ choices, value, onChange }: Props<V>) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.chips}>
    {choices.map(choice => {
      const selected = choice.value === value;
      return <Pressable key={String(choice.value)} onPress={() => onChange(choice.value)} accessibilityRole="button" accessibilityLabel={choice.label} accessibilityState={{ selected }} style={[s.chip, selected && s.chipActive]}>
        {choice.accent !== undefined && <View style={[s.dot, { backgroundColor: choice.accent }]} />}
        <Text numberOfLines={1} style={[s.chipText, selected && { color: colors.primary }]}>{choice.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 15, paddingVertical: 11, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.inputBorder },
  chipActive: { backgroundColor: c.primaryTint, borderColor: c.primaryBorder },
  chipText: { flexShrink: 1, color: c.foreground, fontSize: 12, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
