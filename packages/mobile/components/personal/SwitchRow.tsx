import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";

type Props = { label: string; value: boolean; onChange: (next: boolean) => void; hint?: string };

/** Label + Switch row. The Switch carries the label for TalkBack; the visible text is not a second focus stop. */
export function SwitchRow({ label, value, onChange, hint }: Props) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <View style={s.row}>
    <View style={s.texts} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={s.label}>{label}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onChange} accessibilityLabel={label}
      trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.onPrimary} />
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md, minHeight: 44 },
  texts: { flex: 1 },
  label: { ...t.type.label, color: t.colors.foreground },
  hint: { ...t.type.caption, ...t.font.regular, color: t.colors.mutedForeground, marginTop: t.space.xxs },
});
