import React, { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";

/** A small section label above a rounded card; the rows are its children. The card clips the press highlight to its corners. */
export function MenuGroupCard({ title, children }: { title: string; children: ReactNode }) {
  const s = useThemedStyles(makeStyles);
  return <View style={s.group}>
    <Text accessibilityRole="header" style={s.label}>{title}</Text>
    <View style={s.card}>{children}</View>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  group: { marginTop: 18 },
  label: { ...t.type.micro, color: t.colors.labelText, marginBottom: t.space.sm, marginLeft: 6 },
  card: { backgroundColor: t.colors.card, borderRadius: t.radius.lg, overflow: "hidden", ...t.elevation.card },
});
