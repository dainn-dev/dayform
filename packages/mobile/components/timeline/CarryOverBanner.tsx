import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

const MIN_TOUCH_TARGET = 44;

type Props = { count: number; onMove: () => void };

/** Offered on a past day that still has unfinished tasks: one tap moves them to today. */
export function CarryOverBanner({ count, onMove }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const summary = `${count} ${t(count === 1 ? "unfinished task" : "unfinished tasks")}`;
  return <View style={s.banner}>
    <Text style={s.summary}>{summary}</Text>
    <Pressable onPress={onMove} accessibilityRole="button" accessibilityLabel={`${summary}. ${t("Move to today")}`} style={s.button}>
      <Text style={s.buttonText}>{t("Move to today")}</Text>
      <Ionicons name="arrow-forward" size={15} color={colors.primary} />
    </Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 16, marginHorizontal: 4, paddingLeft: 14, paddingRight: 6, backgroundColor: c.primaryTint, borderRadius: 14 },
  summary: { flexShrink: 1, color: c.foreground, fontSize: 13, fontWeight: "700" },
  button: { minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 },
  buttonText: { color: c.primary, fontSize: 13, fontWeight: "800" },
});
