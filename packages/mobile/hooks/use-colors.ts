import type { ThemeColors } from "@/constants/palettes";
import { useTheme } from "./use-theme";

/**
 * The colour palette of the current theme: the user's style (settings.style), Light/Dark choice (lib/theme-context.tsx)
 * and, for the original style, the chosen accent (constants/accents.ts). Memoised in lib/design-theme.ts, so the
 * reference only changes when one of those does and is safe as a `useMemo` dependency. New code should prefer
 * `useTheme()` / `useThemedStyles()` (hooks/use-theme.ts), which also give the type scale, corners and depth.
 */
export function useColors(): ThemeColors {
  return useTheme().colors;
}
