import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

export type CycleButtonVariant = "primary" | "secondary" | "danger";
type Props = {
  label: string;
  onPress: () => void;
  variant?: CycleButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  /** Spoken label when it should differ from the visible text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const DISABLED_OPACITY = 0.45;

/** A full-width 48dp button. Long (Vietnamese) labels wrap instead of being cut. */
export function CycleButton({ label, onPress, variant = "primary", disabled = false, busy = false, accessibilityLabel, accessibilityHint }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const inactive = disabled || busy;
  const textColor = variant === "secondary" ? colors.foreground : colors.onPrimary;
  return <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: inactive, busy }} style={[s.button, s[variant], inactive && s.inactive]}>
    {busy ? <ActivityIndicator color={textColor} /> : <Text style={[s.text, { color: textColor }]}>{label}</Text>}
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10 },
  primary: { backgroundColor: c.primary },
  secondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primaryBorder },
  danger: { backgroundColor: c.destructive },
  inactive: { opacity: DISABLED_OPACITY },
  text: { fontSize: 14, fontWeight: "800", textAlign: "center" },
});
