import { useMemo } from "react";
import { useCategories } from "../../lib/categories-context";
import { useCycle } from "../../lib/cycle-context";
import { useLanguage } from "../../lib/language";
import { useOta } from "../../lib/ota-context";
import { useSettings } from "../../lib/settings-context";
import { useSpecialDays } from "../../lib/special-days-context";
import type { MenuInputs } from "../../lib/settings-menu";
import { useThemePreference } from "../../lib/theme-context";
import { useUpdates } from "../../lib/update-context";
import { updateSummaryLine } from "../../lib/update-summary";

/**
 * Plain values for `summaryFor` / `rowHref`, read from the app's contexts. Cheap: nothing is computed beyond the
 * update status line. The cycle state is reduced to its three switches here, so no tracker data can reach the menu.
 */
export function useMenuInputs(): MenuInputs {
  const { settings } = useSettings();
  const { t, duration, time, timeFormat, language } = useLanguage();
  const { preference } = useThemePreference();
  const categories = useCategories();
  const specialDays = useSpecialDays();
  const apk = useUpdates();
  const ota = useOta();
  const { state, ready } = useCycle();
  const updateLine = updateSummaryLine(apk, ota, t);
  const cycleEnabled = state.enabled;
  const lockEnabled = state.lock.enabled;

  return useMemo(() => ({
    settings,
    themePreference: preference,
    language,
    categoryCount: categories.visible.length,
    categoryName: categories.label,
    specialDayCount: specialDays.items.length,
    version: apk.currentVersion,
    updateLine,
    cycle: { ready, enabled: cycleEnabled, lockEnabled },
    timeFormat,
    duration,
    time,
    t,
  }), [settings, preference, language, categories.visible.length, categories.label, specialDays.items.length, apk.currentVersion, updateLine,
    ready, cycleEnabled, lockEnabled, timeFormat, duration, time, t]);
}
