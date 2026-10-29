import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { RangeKind } from "../../lib/stats";

type Props = {
  kind: RangeKind;
  title: string;
  onKindChange: (kind: RangeKind) => void;
  onShift: (delta: number) => void;
};

const KINDS: readonly RangeKind[] = ["week", "month"];

/** Week | Month segmented control plus previous/next arrows around the range title. */
export function RangePicker({ kind, title, onKindChange, onShift }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const labels: Record<RangeKind, string> = { week: t("Week"), month: t("Month") };
  const prev = kind === "week" ? t("Previous week") : t("Previous month");
  const next = kind === "week" ? t("Next week") : t("Next month");

  return <View>
    <View accessibilityRole="tablist" accessibilityLabel={t("Time range")} style={s.segments}>
      {KINDS.map(value => <Pressable key={value} onPress={() => onKindChange(value)} accessibilityRole="tab" accessibilityState={{ selected: kind === value }} style={[s.segment, kind === value && s.segmentActive]}>
        <Text style={[s.segmentText, kind === value && s.segmentTextActive]}>{labels[value]}</Text>
      </Pressable>)}
    </View>
    <View style={s.navRow}>
      <Pressable onPress={() => onShift(-1)} style={s.navButton} accessibilityRole="button" accessibilityLabel={prev}><Ionicons name="chevron-back" size={19} color={colors.foreground} /></Pressable>
      <Text accessibilityRole="header" style={s.title} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
      <Pressable onPress={() => onShift(1)} style={s.navButton} accessibilityRole="button" accessibilityLabel={next}><Ionicons name="chevron-forward" size={19} color={colors.foreground} /></Pressable>
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  segments: { flexDirection: "row", backgroundColor: c.card, borderRadius: 16, padding: 4, marginTop: 22 },
  segment: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: c.primary },
  segmentText: { color: c.mutedForeground, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: c.onPrimary },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 8 },
  navButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", color: c.foreground, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
});
