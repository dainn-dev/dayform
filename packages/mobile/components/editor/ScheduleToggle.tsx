import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";

type Props = { value: boolean; onChange: (value: boolean) => void };

export function ScheduleToggle({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <View style={s.scheduleRow}>
    <View style={s.texts}><Text style={s.scheduleTitle}>{t("Schedule this task")}</Text><Text style={s.helper}>{t("Otherwise, keep it in your backlog")}</Text></View>
    <Switch accessibilityLabel={t("Schedule this task")} value={value} onValueChange={onChange} trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }} thumbColor={value ? colors.primary : colors.card} />
  </View>;
}

const makeStyles = ({ colors: c, radius, space, type, elevation }: Theme) => StyleSheet.create({
  scheduleRow: {
    marginTop: space.xxl, padding: 17, backgroundColor: c.card, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    ...elevation.card,
  },
  texts: { flex: 1, paddingRight: space.sm },
  scheduleTitle: { ...type.subtitle, color: c.foreground },
  helper: { ...type.meta, color: c.labelText, marginTop: space.xs },
});
