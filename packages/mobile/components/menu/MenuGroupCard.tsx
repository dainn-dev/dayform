import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

/** A small section label above a rounded card; the rows are its children. The card clips the press highlight to its corners. */
export function MenuGroupCard({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.group}>
    <Text accessibilityRole="header" style={s.label}>{title}</Text>
    <View style={s.card}>{children}</View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  group: { marginTop: 18 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8, marginLeft: 6, textTransform: "uppercase" },
  card: { backgroundColor: c.card, borderRadius: 17, overflow: "hidden" },
});
