import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import type { FontWeightName, TextRole } from "../../constants/styles";
import { useTheme } from "../../hooks/use-theme";

export type TextTone = "default" | "muted" | "primary" | "danger" | "onPrimary";

type Props = TextProps & {
  /** Text role (named `variant` because React Native already has an accessibility `role` prop) from the theme's type scale (constants/styles.ts). Default "body". */
  variant?: TextRole;
  /** Weight of the style's body family; leave out for the role's own weight (and always for a serif heading role). */
  weight?: FontWeightName;
  tone?: TextTone;
  /** A colour that is not a tone (e.g. a category accent). Wins over `tone`. */
  color?: string;
};

/**
 * Text with a role of the type scale. `style` still applies last, for layout (margins, alignment), not for font size or
 * weight, which belong to the role.
 */
export function AppText({ variant = "body", weight, tone = "default", color, style, ...rest }: Props) {
  const t = useTheme();
  const toneColor: Record<TextTone, string> = {
    default: t.colors.foreground,
    muted: t.colors.mutedForeground,
    primary: t.colors.countText,
    danger: t.colors.deleteText,
    onPrimary: t.colors.onPrimary,
  };
  const base: TextStyle = { ...t.type[variant], ...(weight ? t.font[weight] : {}), color: color ?? toneColor[tone] };
  return <Text {...rest} style={[base, style]} />;
}
