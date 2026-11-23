import React, { memo, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type Theme } from "../../hooks/use-theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
export type IconButtonTone = "tint" | "primary" | "danger";

type Props = {
  icon: IconName;
  /** Visible words. When set the button shows them instead of the icon (the icon then only stands in while `busy`). */
  text?: string;
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
export const IconButton = memo(function IconButton({ icon, text, label, onPress, tone = "tint", disabled = false, busy = false, style }: Props) {
  const theme = useTheme();
  const colors = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const inactive = disabled || busy;
  const iconColor = tone === "primary" ? colors.onPrimary : tone === "danger" ? colors.deleteText : colors.primary;
  return <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: inactive, busy }} style={[s.button, s[tone], inactive && s.inactive, style]}>
    {busy ? <ActivityIndicator size="small" color={iconColor} />
      : text !== undefined ? <Text numberOfLines={1} style={[s.text, { color: iconColor }]}>{text}</Text>
      : <Ionicons name={icon} size={ICON_SIZE} color={iconColor} />}
  </Pressable>;
});

const makeStyles = ({ colors: c, radius, type, font, style }: Theme) => StyleSheet.create({
  button: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  tint: style === "dayform" ? { backgroundColor: c.primaryTint } : { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  primary: { backgroundColor: c.primary },
  danger: { backgroundColor: c.errorBg },
  inactive: { opacity: DISABLED_OPACITY },
  text: { ...type.subtitle, ...font.heavy },
});
