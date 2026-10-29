import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

/** Back to where the user came from; to the Personal tab when the screen was opened directly. */
export function leaveCycleScreen(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)/personal");
}

/** Title row of the cycle screen with a 44dp back button. Shared by the content and the lock screen. */
export function CycleHeader() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.row}>
    <Pressable onPress={leaveCycleScreen} accessibilityRole="button" accessibilityLabel={t("Back")} style={s.back}>
      <Ionicons name="chevron-back" size={22} color={colors.foreground} />
    </Pressable>
    <Text accessibilityRole="header" style={s.title}>{t("Cycle")}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  back: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: c.foreground, fontSize: 24, fontWeight: "800", letterSpacing: -0.6 },
});
