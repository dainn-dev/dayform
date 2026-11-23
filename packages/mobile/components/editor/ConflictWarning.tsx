import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";

/** Shown after a first save attempt that overlaps another task; the next save goes through. */
export function ConflictWarning() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <View style={s.warning}>
    <Ionicons name="warning-outline" size={19} color={colors.warningIcon} />
    <Text style={s.warningText}>{t("This overlaps another task. You can save it anyway or choose a new time.")}</Text>
  </View>;
}

const makeStyles = ({ colors: c, radius, type }: Theme) => StyleSheet.create({
  warning: { flexDirection: "row", gap: 9, backgroundColor: c.warningBg, padding: 13, borderRadius: radius.md, marginTop: 18 },
  warningText: { ...type.meta, color: c.warningText, flex: 1 },
});
