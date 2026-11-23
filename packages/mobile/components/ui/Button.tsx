import React, { memo } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/use-theme";
import { AppText } from "./AppText";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  /** Visible words (already translated); also what a screen reader announces unless `accessibilityLabel` is set. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  /** Stretch to the parent's width. */
  block?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const TOUCH_TARGET = 44;
const DISABLED_OPACITY = 0.45;
const PRESSED_OPACITY = 0.82;

/**
 * The app's text button. Its shape follows the style (a pill in Minimal, the `md` corner elsewhere); the touch target is
 * always at least 44dp tall, even for size "sm" (the visible button is smaller, the hit area is not). In the bordered
 * styles a secondary button is an outlined card-coloured button; in Dayform it is a violet tint.
 */
export const Button = memo(function Button({ label, onPress, variant = "primary", size = "md", icon, disabled = false, busy = false, block, accessibilityLabel, style }: Props) {
  const t = useTheme();
  const c = t.colors;
  const inactive = disabled || busy;
  const outlined = variant === "secondary" && t.style !== "dayform";
  const fill = outlined ? c.card : { primary: c.primary, secondary: c.secondary, ghost: "transparent", danger: c.errorBg }[variant];
  const ink = outlined ? c.foreground : { primary: c.onPrimary, secondary: c.secondaryForeground, ghost: c.countText, danger: c.deleteText }[variant];
  const height = size === "md" ? 48 : 36;
  return <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: inactive, busy }} hitSlop={height < TOUCH_TARGET ? (TOUCH_TARGET - height) / 2 : undefined}
    style={({ pressed }) => [{
      minHeight: height, borderRadius: t.buttonRadius, backgroundColor: fill, paddingHorizontal: size === "md" ? t.space.xl : t.space.md,
      alignItems: "center", justifyContent: "center", flexDirection: "row", alignSelf: block ? "stretch" : "flex-start",
      opacity: inactive ? DISABLED_OPACITY : pressed ? PRESSED_OPACITY : 1,
    }, outlined ? { borderWidth: 1, borderColor: c.border } : null, style]}>
    {busy ? <ActivityIndicator size="small" color={ink} />
      : <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
        {icon && <Ionicons name={icon} size={size === "md" ? 18 : 16} color={ink} />}
        <AppText variant="label" numberOfLines={1} color={ink}>{label}</AppText>
      </View>}
  </Pressable>;
});
