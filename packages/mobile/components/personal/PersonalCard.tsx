import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

/**
 * One settings card with an optional small uppercase label (a settings page has its title in the header instead) and an
 * optional `action` (an icon button) on the same line, at the right end.
 */
export function PersonalCard({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 17, padding: 14, marginBottom: 8 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  labelAlone: { marginBottom: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -6, marginBottom: 2 },
  labelBeside: { flexShrink: 1 },
});
