import React, { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";

/**
 * One settings card with an optional small uppercase label (a settings page has its title in the header instead) and an
 * optional `action` (an icon button) on the same line, at the right end.
 */
export function PersonalCard({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const s = useThemedStyles(makeStyles);
  return <View style={s.card}>
    {title !== undefined && (action === undefined
      ? <Text accessibilityRole="header" style={[s.label, s.labelAlone]}>{title}</Text>
      : <View style={s.header}>
        <Text accessibilityRole="header" style={[s.label, s.labelBeside]}>{title}</Text>
        {action}
      </View>)}
    {children}
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  card: { backgroundColor: t.colors.card, borderRadius: t.radius.lg, padding: 14, marginBottom: t.space.sm, ...t.elevation.card },
  label: { ...t.type.micro, color: t.colors.labelText },
  labelAlone: { marginBottom: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -6, marginBottom: t.space.xxs },
  labelBeside: { flexShrink: 1 },
});
