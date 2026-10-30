import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";

const MIN_TOUCH_TARGET = 44;
const ICON_SIZE = 16;

type ToggleProps = { count: number; expanded: boolean; onToggle: () => void };

/** Compact row at the top of the Scheduled group: expands (or collapses) the tasks dated before today. */
export function EarlierTasksToggle({ count, expanded, onToggle }: ToggleProps) {
  const { t } = useLanguage();
  const { s, color } = useStyles();
  const label = expanded ? t("Hide earlier tasks") : fillPlaceholders(t("Earlier tasks ({count})"), { count: String(count) });
  return <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} style={s.row}>
    <Text style={s.text}>{label}</Text>
    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={ICON_SIZE} color={color} />
  </Pressable>;
}

/** Footer of the Scheduled group while later days remain: the auto-load fallback for assistive technology and slow scrolling. */
export function ShowNextDays({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  const { s, color } = useStyles();
  return <Pressable onPress={onPress} accessibilityRole="button" style={s.row}>
    <Text style={s.text}>{t("Show next days")}</Text>
    <Ionicons name="chevron-down" size={ICON_SIZE} color={color} />
  </Pressable>;
}

function useStyles() {
  const colors = useColors();
  return { s: useMemo(() => makeStyles(colors), [colors]), color: colors.accentForeground };
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, marginBottom: 10, borderRadius: 13, backgroundColor: c.primaryTint },
  text: { color: c.accentForeground, fontSize: 13, fontWeight: "800" },
});
