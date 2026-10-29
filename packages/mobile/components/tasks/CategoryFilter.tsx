import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Category } from "../../lib/planner";
import { useCategories } from "../../lib/categories-context";
import { categoriesInUse } from "../../lib/category-usage";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";
import { useColors } from "../../hooks/use-colors";
import { useCategoryColors } from "../../hooks/use-category-colors";
import type { ThemeColors } from "../../constants/theme";

const MIN_TOUCH_TARGET = 44;
const CHIP_BORDER = 2;

type Props = { selected: readonly Category[]; onToggle: (category: Category) => void };

/**
 * Multi-select category chips. An empty selection means every category. Offers the visible categories plus any
 * other category that tasks still use (a hidden one), so every task stays reachable from the filter.
 */
export const CategoryFilter = memo(function CategoryFilter({ selected, onToggle }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const palette = useCategoryColors();
  const { state, label } = useCategories();
  const { tasks } = useTasks();
  const ids = useMemo(() => categoriesInUse(tasks, state, selected), [tasks, state, selected]);
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View accessibilityRole="toolbar" accessibilityLabel={t("Filter by category")} style={s.row}>
    {ids.map(category => {
      const on = selected.includes(category);
      const color = palette.get(category);
      return <Pressable key={category} onPress={() => onToggle(category)} accessibilityRole="checkbox" accessibilityLabel={label(category)} accessibilityState={{ checked: on }}
        style={[s.chip, on && { backgroundColor: color.bg, borderColor: color.accent }]}>
        <Ionicons name={color.icon} size={15} color={on ? color.accent : colors.mutedForeground} />
        <Text numberOfLines={1} style={[s.text, on && s.textOn]}>{label(category)}</Text>
      </Pressable>;
    })}
  </View>;
});

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.card, borderWidth: CHIP_BORDER, borderColor: "transparent", paddingHorizontal: 14, minHeight: MIN_TOUCH_TARGET, borderRadius: 13 },
  text: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
  textOn: { color: c.foreground },
});
