import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { leaveToPersonal } from "../../hooks/use-back-to-personal";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

const BACK_SIZE = 44;

/** Back to the Personal tab the page was opened from (router.back() would land on the Timeline, see hooks/use-back-to-personal.ts). */
export const leaveSettingsPage = leaveToPersonal;

/** Title row of a settings page with a 44dp back button. */
export function PageHeader({ title }: { title: string }) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.row}>
    <Pressable onPress={leaveSettingsPage} accessibilityRole="button" accessibilityLabel={t("Back")} style={s.back}>
      <Ionicons name="chevron-back" size={22} color={colors.foreground} />
    </Pressable>
    <Text accessibilityRole="header" numberOfLines={2} style={s.title}>{title}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  back: { width: BACK_SIZE, height: BACK_SIZE, borderRadius: 15, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: c.foreground, fontSize: 24, fontWeight: "800", letterSpacing: -0.6 },
});
