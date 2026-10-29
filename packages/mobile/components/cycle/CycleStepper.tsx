import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

const TOUCH_TARGET = 44;
const DISABLED_OPACITY = 0.35;

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
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: TOUCH_TARGET },
  label: { flex: 1, color: c.foreground, fontSize: 13, fontWeight: "700" },
  control: { flexDirection: "row", alignItems: "center", gap: 2 },
  button: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  off: { opacity: DISABLED_OPACITY },
  value: { minWidth: 76, textAlign: "center", color: c.foreground, fontSize: 13, fontWeight: "800" },
});
