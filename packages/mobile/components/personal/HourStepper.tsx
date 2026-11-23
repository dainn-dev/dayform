import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";

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
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TOUCH_TARGET },
    label: { ...t.type.label, color: c.foreground },
    control: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
    button: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
    value: { ...t.type.body, ...t.font.heavy, minWidth: 64, textAlign: "center", color: c.foreground },
  });
};
