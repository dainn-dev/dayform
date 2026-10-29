import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import type { ThemeColors } from "../../constants/theme";
import { BackupSection } from "./BackupSection";
import { ThemeSwitch } from "./ThemeSwitch";

/** Settings block at the bottom of the Tasks tab: appearance and backup. */
export function SettingsSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.root}>
    <Text accessibilityRole="header" style={s.title}>{t("Settings")}</Text>
    <View style={s.card}>
      <Text style={s.label}>{t("Appearance")}</Text>
      <ThemeSwitch />
    </View>
    <View style={s.card}>
      <Text style={s.label}>{t("Backup")}</Text>
      <BackupSection />
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { marginTop: 38 },
  title: { fontSize: 19, fontWeight: "800", color: c.foreground, marginBottom: 14 },
  card: { backgroundColor: c.card, borderRadius: 17, padding: 16, marginBottom: 10 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 12, textTransform: "uppercase" },
});
