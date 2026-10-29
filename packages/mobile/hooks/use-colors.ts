import { Colors, type ThemeColors } from "@/constants/palettes";
import { useResolvedScheme } from "@/lib/theme-context";

/**
 * Returns the color palette for the resolved color scheme (the user's Light/Dark/System choice, see
 * `lib/theme-context.tsx`). Palette objects are module-level constants, so the returned reference is
 * stable and safe as a `useMemo` dependency (`useMemo(() => makeStyles(colors), [colors])`).
 *
 * ```tsx
 * const colors = useColors();
 * <View style={{ backgroundColor: colors.background }}>
 *   <Text style={{ color: colors.foreground }}>Hello</Text>
 * </View>
 * ```
 */
export function useColors(): ThemeColors {
  return Colors[useResolvedScheme()];
}
