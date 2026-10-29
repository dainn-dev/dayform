import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

type Props = { title?: string; children: ReactNode };

/** A rounded surface of the cycle screen, with an optional small uppercase title. */
export function CycleCard({ title, children }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.card}>
    {title ? <Text accessibilityRole="header" style={s.title}>{title}</Text> : null}
    {children}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 20, padding: 16, marginBottom: 12 },
  title: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 12, textTransform: "uppercase" },
});
