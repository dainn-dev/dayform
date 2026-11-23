import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { leaveToPersonal } from "../../hooks/use-back-to-personal";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";

const BACK_SIZE = 44;

/** Back to the Personal tab the page was opened from (router.back() would land on the Timeline, see hooks/use-back-to-personal.ts). */
export const leaveSettingsPage = leaveToPersonal;

/** Title row of a settings page with a 44dp back button. */
export function PageHeader({ title }: { title: string }) {
  const { t } = useLanguage();
  const colors = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  return <View style={s.row}>
    <Pressable onPress={leaveSettingsPage} accessibilityRole="button" accessibilityLabel={t("Back")} style={s.back}>
      <Ionicons name="chevron-back" size={22} color={colors.foreground} />
    </Pressable>
    <Text accessibilityRole="header" numberOfLines={2} style={s.title}>{title}</Text>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: t.space.lg },
  // Flat on the page like before: the bordered styles outline it, Dayform keeps it shadowless.
  back: {
    width: BACK_SIZE, height: BACK_SIZE, borderRadius: t.radius.lg, backgroundColor: t.colors.card, alignItems: "center", justifyContent: "center",
    ...(t.elevation.card.borderWidth !== undefined ? t.elevation.card : t.elevation.none),
  },
  title: { ...t.type.headline, flex: 1, color: t.colors.foreground },
});
