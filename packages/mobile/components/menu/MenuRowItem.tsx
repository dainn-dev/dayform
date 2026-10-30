import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { IconName } from "../../hooks/use-category-colors";
import type { ThemeColors } from "../../constants/theme";
import type { MenuTint } from "../../lib/settings-menu";

const CHIP_SIZE = 40;
const ROW_MIN_HEIGHT = 60;
const ICON_SIZE = 21;

type Props = {
  title: string;
  summary: string;
  icon: string;
  tint: MenuTint;
  /** Draws the hairline above the row (every row but the first of its card). */
  divider: boolean;
  onPress: () => void;
};

/** One tappable menu row: icon chip, title, a live one-line summary and a chevron. Read by TalkBack as "title, summary". */
export function MenuRowItem({ title, summary, icon, tint, divider, onPress }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const chip = colors.category[tint];
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${summary}`}
    style={({ pressed }) => [s.row, divider && s.divider, pressed && s.pressed]}>
    <View style={[s.chip, { backgroundColor: chip.bg }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Ionicons name={icon as IconName} size={ICON_SIZE} color={chip.accent} />
    </View>
    <View style={s.texts}>
      <Text style={s.title} numberOfLines={2}>{title}</Text>
      <Text style={s.summary} numberOfLines={2}>{summary}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  pressed: { backgroundColor: c.muted },
  chip: { width: CHIP_SIZE, height: CHIP_SIZE, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1 },
  title: { color: c.foreground, fontSize: 15, fontWeight: "700" },
  summary: { color: c.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 1 },
});
