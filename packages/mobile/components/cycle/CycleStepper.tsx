import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";

const TOUCH_TARGET = 44;
const DISABLED_OPACITY = 0.35;
const VALUE_MIN_WIDTH = 76;

type Props = {
  label: string;
  /** The value as shown ("28 days"). */
  valueText: string;
  decreaseLabel: string;
  increaseLabel: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
};

/**
 * A labelled "- value +" control with 44dp buttons. Unlike the hour stepper the label shrinks and wraps, so a long
 * Vietnamese label never pushes the buttons off a small screen.
 */
export function CycleStepper({ label, valueText, decreaseLabel, increaseLabel, canDecrease, canIncrease, onDecrease, onIncrease }: Props) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <View style={s.row}>
    <Text style={s.label}>{label}</Text>
    <View style={s.control}>
      <Pressable onPress={onDecrease} disabled={!canDecrease} accessibilityRole="button" accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: !canDecrease }} style={[s.button, !canDecrease && s.off]}>
        <Ionicons name="remove" size={20} color={colors.foreground} />
      </Pressable>
      <Text accessibilityLabel={`${label}: ${valueText}`} style={s.value}>{valueText}</Text>
      <Pressable onPress={onIncrease} disabled={!canIncrease} accessibilityRole="button" accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: !canIncrease }} style={[s.button, !canIncrease && s.off]}>
        <Ionicons name="add" size={20} color={colors.foreground} />
      </Pressable>
    </View>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm, minHeight: TOUCH_TARGET },
  label: { ...t.type.label, flex: 1, color: t.colors.foreground },
  control: { flexDirection: "row", alignItems: "center", gap: t.space.xxs },
  button: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.card, borderWidth: 1, borderColor: t.colors.inputBorder },
  off: { opacity: DISABLED_OPACITY },
  value: { ...t.type.label, minWidth: VALUE_MIN_WIDTH, textAlign: "center", color: t.colors.foreground },
});
