import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { IconName } from "../../hooks/use-category-colors";
import type { ThemeColors } from "../../constants/theme";
import { COLOR_SLOTS, ICON_KEYS, type ColorSlot, type IconKey } from "../../lib/categories";
import { COLOR_LABELS, ICON_LABELS } from "../../lib/category-labels";
import { useLanguage } from "../../lib/language";

const TARGET = 44;
const RING = 3;

/** One swatch per palette slot. Selected = ring + check mark, so the state is not carried by color alone. */
export function ColorPicker({ value, onChange, disabled }: { value: ColorSlot; onChange: (slot: ColorSlot) => void; disabled?: boolean }) {
  const colors = useColors();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.grid}>
    {COLOR_SLOTS.map(slot => {
      const selected = slot === value;
      const { bg, accent } = colors.category[slot];
      return <Pressable key={slot} disabled={disabled} onPress={() => onChange(slot)} accessibilityRole="radio"
        accessibilityLabel={t(COLOR_LABELS[slot])} accessibilityState={{ selected, disabled: disabled === true }}
        style={[s.cell, { backgroundColor: accent, borderColor: bg }, selected && s.ring]}>
        {selected && <Ionicons name="checkmark" size={22} color={bg} />}
      </Pressable>;
    })}
  </View>;
}

/** The icons offered for custom categories, drawn in the accent of the chosen color. */
export function IconPicker({ value, onChange, slot, disabled }: {
  value: IconKey; onChange: (icon: IconKey) => void; slot: ColorSlot; disabled?: boolean;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { bg, accent } = colors.category[slot];
  return <View style={s.grid}>
    {ICON_KEYS.map(icon => {
      const selected = icon === value;
      return <Pressable key={icon} disabled={disabled} onPress={() => onChange(icon)} accessibilityRole="radio"
        accessibilityLabel={t(ICON_LABELS[icon])} accessibilityState={{ selected, disabled: disabled === true }}
        style={[s.cell, s.iconCell, selected && { backgroundColor: bg, borderColor: accent, borderWidth: RING }]}>
        <Ionicons name={icon as IconName} size={22} color={selected ? accent : colors.mutedForeground} />
      </Pressable>;
    })}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { width: TARGET, height: TARGET, borderRadius: TARGET / 2, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  ring: { borderColor: c.foreground, borderWidth: RING },
  iconCell: { borderRadius: 14, backgroundColor: c.background, borderColor: c.inputBorder },
});
