import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

/** One settings card with an optional small uppercase label (a settings page has its title in the header instead). */
export function PersonalCard({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.card}>
    {title !== undefined && <Text accessibilityRole="header" style={s.label}>{title}</Text>}
    {children}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 17, padding: 16, marginBottom: 10 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 12, textTransform: "uppercase" },
});
