import React, { memo } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/use-theme";
import { AppText } from "./AppText";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Greyed out and not pressable, but still announced as a button with a disabled state. */
  disabled?: boolean;
  /** A colour dot before the label (e.g. a category accent). */
  dot?: string;
  icon?: IconName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const TOUCH_TARGET = 44;
const HEIGHT = 34;
const DOT = 8;
const DISABLED_OPACITY = 0.45;

/** A selectable chip (filters, choices). Selected chips fill with the primary colour; bordered styles outline the others. */
export const Chip = memo(function Chip({ label, selected = false, onPress, disabled = false, dot, icon, accessibilityLabel, style }: Props) {
  const t = useTheme();
  const c = t.colors;
  const ink = selected ? c.onPrimary : c.foreground;
  const outlined = !selected && t.style !== "dayform";
  return <Pressable onPress={onPress} disabled={!onPress || disabled} accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={onPress ? { selected, disabled } : undefined} hitSlop={(TOUCH_TARGET - HEIGHT) / 2}
    style={[{
      minHeight: HEIGHT, paddingHorizontal: t.space.md, borderRadius: t.radius.pill, flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: selected ? c.primary : outlined ? c.card : c.muted,
    }, outlined ? { borderWidth: 1, borderColor: c.border } : null, disabled ? { opacity: DISABLED_OPACITY } : null, style]}>
    {dot && <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: dot }} />}
    {icon && <Ionicons name={icon} size={15} color={ink} />}
    <AppText variant="label" numberOfLines={1} color={ink} style={{ flexShrink: 1 }}>{label}</AppText>
  </Pressable>;
});
