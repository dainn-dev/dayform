import React from "react";
import { useTheme } from "../../hooks/use-theme";
import { AppText } from "./AppText";

/** Small label that sits above a section title (upper case in the styles whose `micro` role says so). */
export function SectionEyebrow({ children }: { children: string }) {
  const t = useTheme();
  return <AppText accessibilityRole="header" variant="micro" tone="muted" style={{ marginBottom: t.space.xs + 2 }}>{children}</AppText>;
}
