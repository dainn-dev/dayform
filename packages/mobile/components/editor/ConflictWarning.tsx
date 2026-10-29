import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

/** Shown after a first save attempt that overlaps another task; the next save goes through. */
export function ConflictWarning() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.warning}>
    <Ionicons name="warning-outline" size={19} color={colors.warningIcon} />
    <Text style={s.warningText}>{t("This overlaps another task. You can save it anyway or choose a new time.")}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  warning: { flexDirection: "row", gap: 9, backgroundColor: c.warningBg, padding: 13, borderRadius: 13, marginTop: 18 },
  warningText: { color: c.warningText, fontSize: 12, lineHeight: 18, flex: 1 },
});
