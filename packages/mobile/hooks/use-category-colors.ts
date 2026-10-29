import { useMemo } from "react";
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import { colorsFor } from "../lib/categories";
import { useCategories } from "../lib/categories-context";
import { useColors } from "./use-colors";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export type CategoryColors = { bg: string; accent: string; icon: IconName };
export type CategoryColorLookup = {
  /** Tint and icon for any category id; an unknown id (deleted category) gets the "Personal" fallback. */
  get: (id: string) => CategoryColors;
};

/**
 * `{ bg, accent, icon }` for any category id from the active palette: built-ins keep their own tints,
 * custom ones use their color slot. The returned object changes only when the palette or categories do.
 */
export function useCategoryColors(): CategoryColorLookup {
  const { category: palette } = useColors();
  const { resolve } = useCategories();
  return useMemo(
    () => ({ get: (id: string) => colorsFor(resolve(id), palette) as CategoryColors }),
    [palette, resolve],
  );
}
