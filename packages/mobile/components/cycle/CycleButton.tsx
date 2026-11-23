import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";

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
const MIN_HEIGHT = 48;

/**
 * A full-width 48dp button. Long (Vietnamese) labels wrap instead of being cut, which is why the cycle screen keeps
 * its own button rather than the one-line kit `Button`; the shape and type still come from the theme.
 */
export function CycleButton({ label, onPress, variant = "primary", disabled = false, busy = false, accessibilityLabel, accessibilityHint }: Props) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const inactive = disabled || busy;
  const textColor = variant === "secondary" ? colors.foreground : colors.onPrimary;
  return <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: inactive, busy }} style={[s.button, s[variant], inactive && s.inactive]}>
    {busy ? <ActivityIndicator color={textColor} /> : <Text style={[s.text, { color: textColor }]}>{label}</Text>}
  </Pressable>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  button: { minHeight: MIN_HEIGHT, borderRadius: t.buttonRadius, alignItems: "center", justifyContent: "center", paddingHorizontal: t.space.lg, paddingVertical: 10 },
  primary: { backgroundColor: t.colors.primary },
  secondary: { backgroundColor: t.colors.card, borderWidth: 1, borderColor: t.colors.primaryBorder },
  danger: { backgroundColor: t.colors.destructive },
  inactive: { opacity: DISABLED_OPACITY },
  text: { ...t.type.label, textAlign: "center" },
});
