import { useMemo } from "react";
import { useLanguage } from "../../lib/language";
import { fromKey } from "../../lib/planner";
import { fillPlaceholders } from "../../lib/text-template";
import type { Fill } from "../../lib/cycle-ui-text";

/** Date and text helpers for the cycle screen, bound to the current language. */
export function useCycleFormat() {
  const { t, locale } = useLanguage();
  return useMemo(() => {
    const short = (key: string) => fromKey(key).toLocaleDateString(locale, { day: "numeric", month: "short" });
    const withYear = (key: string) => fromKey(key).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    const long = (key: string) => fromKey(key).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    const month = (year: number, monthNumber: number) =>
      new Date(year, monthNumber - 1, 1, 12).toLocaleDateString(locale, { month: "long", year: "numeric" });
    /** Translates a `Fill` and fills its placeholders. */
    const say = (f: Fill) => fillPlaceholders(t(f.text), f.values);
    const sayText = (text: string, values: Readonly<Record<string, string>> = {}) => fillPlaceholders(t(text), values);
    return { short, withYear, long, month, say, sayText };
  }, [t, locale]);
}
