import React from "react";
import { StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";

/** Small uppercase label that sits above a section title. */
export function SectionEyebrow({ children }: { children: string }) {
  const colors = useColors();
  return <Text accessibilityRole="header" style={[styles.eyebrow, { color: colors.mutedForeground }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.6, marginBottom: 6 },
});
