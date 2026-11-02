import React, { memo, useMemo } from "react";
import type { Category } from "../../lib/planner";
import { useCategories } from "../../lib/categories-context";
import { categoriesInUse } from "../../lib/category-usage";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { FilterDropdown, type DropdownOption } from "./FilterDropdown";

type Props = { selected: readonly Category[]; onToggle: (category: Category) => void; onClear: () => void };

/**
 * Multi-select category dropdown. An empty selection means every category. Offers the visible categories plus any
 * other category that tasks still use (a hidden one), so every task stays reachable from the filter.
 */
export const CategoryFilter = memo(function CategoryFilter({ selected, onToggle, onClear }: Props) {
  const { t } = useLanguage();
  const palette = useCategoryColors();
  const { state, label } = useCategories();
  const { tasks } = useTasks();
  const ids = useMemo(() => categoriesInUse(tasks, state, selected), [tasks, state, selected]);
  const options = useMemo<DropdownOption[]>(() => ids.map(id => {
    const color = palette.get(id);
    return { key: id, label: label(id), icon: color.icon, accent: color.accent };
  }), [ids, palette, label]);
  const valueLabel = selected.length === 0 ? t("All groups") : selected.length === 1 ? label(selected[0]) : `${selected.length} ${t("groups")}`;
  return <FilterDropdown title={t("Filter by category")} valueLabel={valueLabel} icon="pricetags-outline" options={options} selected={selected} multi allLabel={t("All groups")}
    active={selected.length > 0} onPick={onToggle} onClear={onClear} />;
});
