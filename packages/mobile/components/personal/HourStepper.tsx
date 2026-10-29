import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

const TOUCH_TARGET = 44;

type Props = {
  label: string;
  /** The hour as shown to the user ("6 AM" / "06:00"). */
  valueText: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
};

/** A labelled "- value +" control that moves a whole hour per tap; both buttons are 44dp targets. */
export function HourStepper({ label, valueText, decreaseLabel, increaseLabel, onDecrease, onIncrease }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.row}>
    <Text style={s.label}>{label}</Text>
    <View style={s.control}>
      <Pressable onPress={onDecrease} accessibilityRole="button" accessibilityLabel={decreaseLabel} style={s.button}>
        <Ionicons name="remove" size={20} color={colors.foreground} />
      </Pressable>
      <Text accessibilityLabel={`${label}: ${valueText}`} style={s.value}>{valueText}</Text>
      <Pressable onPress={onIncrease} accessibilityRole="button" accessibilityLabel={increaseLabel} style={s.button}>
        <Ionicons name="add" size={20} color={colors.foreground} />
      </Pressable>
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TOUCH_TARGET },
  label: { color: c.foreground, fontSize: 13, fontWeight: "700" },
  control: { flexDirection: "row", alignItems: "center", gap: 4 },
  button: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  value: { minWidth: 64, textAlign: "center", color: c.foreground, fontSize: 14, fontWeight: "800" },
});
