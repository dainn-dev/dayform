import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useFieldStyles } from "./field-styles";

type Props = {
  label: string;
  /** Formatted value shown inside the field. */
  display: string;
  icon: "calendar-outline" | "time-outline";
  accessibilityLabel: string;
  /** Highlights the field while its picker is open (iOS inline picker). */
  isActive?: boolean;
  onPress: () => void;
};

/** A label plus an input-looking button that opens a native date/time picker. */
export function PickerField({ label, display, icon, accessibilityLabel, isActive = false, onPress }: Props) {
  const { colors } = useTheme();
  const f = useFieldStyles();
  const s = useThemedStyles(makeStyles);
  return <View style={{ flex: 1 }}>
    <Text style={f.label}>{label}</Text>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityValue={{ text: display }} style={[f.input, s.field, isActive && s.active]}>
      <Text style={s.value}>{display}</Text>
      <Ionicons name={icon} size={18} color={colors.labelText} />
    </Pressable>
  </View>;
}

const makeStyles = ({ colors: c, space, type }: Theme) => StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  active: { borderColor: c.primaryBorder, backgroundColor: c.primaryTint },
  value: { ...type.body, color: c.foreground },
});
