import React from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";

type Props = ViewProps & {
  /** "card" for panels in a page, "raised" for floating things (FAB, popovers), "overlay" for sheets and dialogs. */
  level?: "flat" | "card" | "raised" | "overlay";
  /** Corner size from the theme. Default "xl" for card/overlay, "lg" otherwise. */
  corner?: "sm" | "md" | "lg" | "xl";
  /** Inner padding from the spacing scale. Default "lg". */
  padding?: "none" | "sm" | "md" | "lg" | "xl";
  /** Background token; default the card colour. */
  tone?: "card" | "muted" | "background" | "tint";
  style?: StyleProp<ViewStyle>;
};

/** A panel that follows the style: a soft shadow in Dayform, a 1px border in Paper, Precision and Minimal. */
export function Surface({ level = "card", corner, padding = "lg", tone = "card", style, ...rest }: Props) {
  const t = useTheme();
  const background = { card: t.colors.card, muted: t.colors.muted, background: t.colors.background, tint: t.colors.primaryTint }[tone];
  const radius = t.radius[corner ?? (level === "card" || level === "overlay" ? "xl" : "lg")];
  const depth = level === "flat" ? t.elevation.none : t.elevation[level];
  const pad = padding === "none" ? 0 : t.space[padding];
  return <View {...rest} style={[{ backgroundColor: background, borderRadius: radius, padding: pad }, depth, style]} />;
}
