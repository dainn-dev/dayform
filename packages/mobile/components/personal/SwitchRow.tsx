import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

type Props = { label: string; value: boolean; onChange: (next: boolean) => void; hint?: string };

/** Label + Switch row. The Switch carries the label for TalkBack; the visible text is not a second focus stop. */
export function SwitchRow({ label, value, onChange, hint }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.row}>
    <View style={s.texts} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={s.label}>{label}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onChange} accessibilityLabel={label}
      trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.onPrimary} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 },
  texts: { flex: 1 },
  label: { color: c.foreground, fontSize: 13, fontWeight: "700" },
  hint: { color: c.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 2 },
});
