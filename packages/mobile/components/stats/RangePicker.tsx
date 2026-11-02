import React, { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { RangeKind } from "../../lib/stats";
import { FilterDropdown } from "../tasks/FilterDropdown";

type Props = {
  kind: RangeKind;
  title: string;
  onKindChange: (kind: RangeKind) => void;
  onShift: (delta: number) => void;
  /** Shown on the same line as the Week / Month dropdown (it should be flex: 1 to share the line). */
  action?: ReactNode;
};

const KINDS: readonly RangeKind[] = ["week", "month"];

/** Week | Month dropdown (with an optional action beside it) plus previous/next arrows around the range title. */
export function RangePicker({ kind, title, onKindChange, onShift, action }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const labels: Record<RangeKind, string> = { week: t("Week"), month: t("Month") };
  const prev = kind === "week" ? t("Previous week") : t("Previous month");
  const next = kind === "week" ? t("Next week") : t("Next month");

  return <View>
    <View style={s.controls}>
      <FilterDropdown title={t("Time range")} valueLabel={labels[kind]} options={KINDS.map(value => ({ key: value, label: labels[value] }))} selected={[kind]} active={false}
        onPick={key => onKindChange(key as RangeKind)} />
      {action}
    </View>
    <View style={s.navRow}>
      <Pressable onPress={() => onShift(-1)} style={s.navButton} accessibilityRole="button" accessibilityLabel={prev}><Ionicons name="chevron-back" size={19} color={colors.foreground} /></Pressable>
      <Text accessibilityRole="header" style={s.title} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
      <Pressable onPress={() => onShift(1)} style={s.navButton} accessibilityRole="button" accessibilityLabel={next}><Ionicons name="chevron-forward" size={19} color={colors.foreground} /></Pressable>
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  controls: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 8 },
  navButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", color: c.foreground, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
});
