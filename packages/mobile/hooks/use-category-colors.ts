import { useMemo } from "react";
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import { categories, categoryStyle, type Category } from "../lib/planner";
import { useColors } from "./use-colors";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export type CategoryColors = { bg: string; accent: string; icon: IconName };

/**
 * Per-category `{ bg, accent, icon }` from the active palette. Tints come from
 * the theme; icons still come from `categoryStyle` in lib/planner.ts.
 */
export function useCategoryColors(): Record<Category, CategoryColors> {
  const colors = useColors();
  return useMemo(() => {
    const entries = categories.map(category => [
      category,
      { ...colors.category[category], icon: categoryStyle[category].icon as IconName },
    ]);
    return Object.fromEntries(entries) as Record<Category, CategoryColors>;
  }, [colors]);
}
