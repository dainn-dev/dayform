import { applyAccent } from "@/constants/accents";
import { Colors, type ThemeColors } from "@/constants/palettes";
import { useSettings } from "@/lib/settings-context";
import { useResolvedScheme } from "@/lib/theme-context";

/**
 * Returns the color palette for the resolved color scheme (the user's Light/Dark/System choice, see
 * `lib/theme-context.tsx`) with the chosen accent applied (`settings.accent`, see `constants/accents.ts`).
 * `applyAccent` is memoised per palette and accent, so the returned reference only changes when the scheme or
 * the accent does and is safe as a `useMemo` dependency (`useMemo(() => makeStyles(colors), [colors])`).
 *
 * ```tsx
 * const colors = useColors();
 * <View style={{ backgroundColor: colors.background }}>
 *   <Text style={{ color: colors.foreground }}>Hello</Text>
 * </View>
 * ```
 */
export function useColors(): ThemeColors {
  const scheme = useResolvedScheme();
  const { settings } = useSettings();
  return applyAccent(Colors[scheme], settings.accent);
}
