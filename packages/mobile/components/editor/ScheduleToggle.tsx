import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

type Props = { value: boolean; onChange: (value: boolean) => void };

export function ScheduleToggle({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.scheduleRow}>
    <View style={{ flex: 1, paddingRight: 8 }}><Text style={s.scheduleTitle}>{t("Schedule this task")}</Text><Text style={s.helper}>{t("Otherwise, keep it in your backlog")}</Text></View>
    <Switch accessibilityLabel={t("Schedule this task")} value={value} onValueChange={onChange} trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }} thumbColor={value ? colors.primary : colors.card} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  scheduleRow: { marginTop: 24, padding: 17, backgroundColor: c.card, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scheduleTitle: { color: c.foreground, fontWeight: "700", fontSize: 15 },
  helper: { color: c.labelText, fontSize: 12, marginTop: 4 },
});
