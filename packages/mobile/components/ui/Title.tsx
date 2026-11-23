import React from "react";
import type { TextProps } from "react-native";
import { useTheme } from "../../hooks/use-theme";
import { AppText } from "./AppText";

type Props = Omit<TextProps, "children"> & { children: string; variant?: "hero" | "display" | "headline" | "title" };

/** A big heading. In the original style it ends with the coloured "." of the Dayform look; other styles leave it out. */
export function Title({ children, variant = "display", ...rest }: Props) {
  const t = useTheme();
  return <AppText accessibilityRole="header" variant={variant} {...rest}>
    {children}{t.titlePunctuation ? <AppText variant={variant} color={t.colors.titleDot}>.</AppText> : null}
  </AppText>;
}
