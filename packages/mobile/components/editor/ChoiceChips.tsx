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

/**
 * A wrapping row of single-select chips. Compact (36 px tall) to save screen space; `hitSlop` keeps the touch target at
 * 44 px and stays inside the 8 px row gap, so neighbouring targets never overlap.
 */
export function ChoiceChips<V extends string | number | null>({ choices, value, onChange }: Props<V>) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.chips}>
    {choices.map(choice => {
      const selected = choice.value === value;
      return <Pressable key={String(choice.value)} onPress={() => onChange(choice.value)} hitSlop={CHIP_HIT_SLOP} accessibilityRole="button" accessibilityLabel={choice.label} accessibilityState={{ selected }} style={[s.chip, selected && s.chipActive]}>
        {choice.accent !== undefined && <View style={[s.dot, { backgroundColor: choice.accent }]} />}
        <Text numberOfLines={1} style={[s.chipText, selected && { color: colors.primary }]}>{choice.label}</Text>
      </Pressable>;
    })}
  </View>;
}

/** 36 px chip + 4 px above and below = the 44 px minimum touch target. */
const CHIP_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", columnGap: 6, rowGap: 8 },
  chip: { minHeight: 36, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder },
  chipActive: { backgroundColor: c.primaryTint, borderColor: c.primaryBorder },
  chipText: { flexShrink: 1, color: c.foreground, fontSize: 12, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
