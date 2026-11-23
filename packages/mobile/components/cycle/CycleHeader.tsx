import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { leaveToPersonal } from "../../hooks/use-back-to-personal";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { Title } from "../ui/Title";

/** Back to the Personal tab the screen was opened from (router.back() would land on the Timeline, see hooks/use-back-to-personal.ts). */
export const leaveCycleScreen = leaveToPersonal;

const TOUCH_TARGET = 44;

/** Title row of the cycle screen with a 44dp back button. Shared by the content and the lock screen. */
export function CycleHeader() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <View style={s.row}>
    <Pressable onPress={leaveCycleScreen} accessibilityRole="button" accessibilityLabel={t("Back")} style={s.back}>
      <Ionicons name="chevron-back" size={22} color={colors.foreground} />
    </Pressable>
    {/* The label keeps the spoken title exactly "Cycle", without the Dayform style's coloured full stop. */}
    <Title variant="headline" accessibilityLabel={t("Cycle")} style={s.title}>{t("Cycle")}</Title>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  back: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: t.radius.lg, backgroundColor: t.colors.card, alignItems: "center", justifyContent: "center", ...t.elevation.card },
  title: { flex: 1 },
});
