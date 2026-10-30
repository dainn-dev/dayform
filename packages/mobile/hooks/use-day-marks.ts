import { useMemo } from "react";
import { dayMarks, type DayMark } from "../lib/day-marks";
import { HOLIDAY_GROUPS } from "../lib/holidays-vn";
import { useLanguage } from "../lib/language";
import { useSettings } from "../lib/settings-context";
import { useSpecialDays } from "../lib/special-days-context";

/**
 * The marks (holidays and the user's special days) of the given days, in the interface language and following the
 * "Show holidays" settings. Pass a stable `keys` array (for example the days of the shown week): the result is
 * recomputed only when it, the settings, the language or the special days change.
 */
export function useDayMarks(keys: readonly string[]): Readonly<Record<string, DayMark[]>> {
  const { settings } = useSettings();
  const { language, t } = useLanguage();
  const { items } = useSpecialDays();
  const { showHolidays, holidayGroups } = settings.calendar;
  return useMemo(() => {
    const groups = new Set(HOLIDAY_GROUPS.filter(group => holidayGroups[group]));
    return dayMarks(keys, { holidays: showHolidays, groups, language, specials: items, t });
  }, [keys, showHolidays, holidayGroups, language, items, t]);
}
