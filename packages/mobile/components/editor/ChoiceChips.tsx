import React from "react";
import { StyleSheet, View } from "react-native";
import { Chip } from "../ui/Chip";

/** `accent` adds a small colour dot before the label (category chips). */
export type Choice<V extends string | number | null> = { value: V; label: string; accent?: string };

type Props<V extends string | number | null> = {
  choices: readonly Choice<V>[];
  value: V;
  onChange: (value: V) => void;
};

/**
 * A wrapping row of single-select chips (the kit's `Chip`, so it follows the style). The chip is drawn 34 px tall and
 * its `hitSlop` makes the touch target 44 px; the 10 px gaps keep neighbouring targets from overlapping.
 */
export function ChoiceChips<V extends string | number | null>({ choices, value, onChange }: Props<V>) {
  return <View style={styles.chips}>
    {choices.map(choice => <Chip key={String(choice.value)} label={choice.label} selected={choice.value === value} onPress={() => onChange(choice.value)}
      dot={choice.accent} style={styles.chip} />)}
  </View>;
}

/** Twice the chip's 5 px hit slop, so two touch targets never overlap (layout only, the same in every style). */
const CHIP_GAP = 10;

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", columnGap: CHIP_GAP, rowGap: CHIP_GAP },
  chip: { maxWidth: "100%" },
});
