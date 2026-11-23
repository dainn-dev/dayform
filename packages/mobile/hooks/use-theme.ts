import { useMemo } from "react";
import { buildTheme, type Theme } from "../lib/design-theme";
import { useSettings } from "../lib/settings-context";
import { useResolvedScheme } from "../lib/theme-context";
import { useFontsReady } from "./use-app-fonts";

export type { Theme } from "../lib/design-theme";

/**
 * The design theme for the user's style (settings.style), Light/Dark choice and accent, with the shipped fonts once
 * they have loaded. Memoised: the reference only changes when one of those does.
 */
export function useTheme(): Theme {
  const scheme = useResolvedScheme();
  const { settings } = useSettings();
  const fontsReady = useFontsReady();
  return buildTheme(settings.style, scheme, settings.accent, fontsReady);
}

/**
 * Styles that follow the theme: `const s = useThemedStyles(makeStyles)` with
 * `const makeStyles = (t: Theme) => StyleSheet.create({ title: { ...t.type.title, color: t.colors.foreground } })`.
 * `makeStyles` must be a module-level function, so it never changes and only the theme drives the memo.
 */
export function useThemedStyles<T>(make: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => make(theme), [make, theme]);
}
