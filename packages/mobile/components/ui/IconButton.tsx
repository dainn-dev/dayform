import React, { memo, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
export type IconButtonTone = "tint" | "primary" | "danger";

type Props = {
  icon: IconName;
  /** Spoken label (already translated). The button shows no text, so this is what a screen reader announces. */
  label: string;
  onPress: () => void;
  tone?: IconButtonTone;
  disabled?: boolean;
  /** Shows a spinner instead of the icon and ignores presses. */
  busy?: boolean;
  /** Layout from the parent, e.g. `{ flex: 1 }` to share a row. */
  style?: StyleProp<ViewStyle>;
};

const TOUCH_TARGET = 44;
const ICON_SIZE = 20;
const DISABLED_OPACITY = 0.45;

/** A button that is only an icon: a 44dp touch target with an accessibility label in place of visible text. */
export const IconButton = memo(function IconButton({ icon, label, onPress, tone = "tint", disabled = false, busy = false, style }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const inactive = disabled || busy;
  const iconColor = tone === "primary" ? colors.onPrimary : tone === "danger" ? colors.deleteText : colors.primary;
  return <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: inactive, busy }} style={[s.button, s[tone], inactive && s.inactive, style]}>
    {busy ? <ActivityIndicator size="small" color={iconColor} /> : <Ionicons name={icon} size={ICON_SIZE} color={iconColor} />}
  </Pressable>;
});

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  button: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  tint: { backgroundColor: c.primaryTint },
  primary: { backgroundColor: c.primary },
  danger: { backgroundColor: c.errorBg },
  inactive: { opacity: DISABLED_OPACITY },
});
