import type { DurationSuggestion } from "./habits-duration";
import type { RepeatSuggestion } from "./habits-repeat";
import { fillPlaceholders } from "./text-template";

type Translate = (text: string) => string;

const SUNDAY_2026 = { year: 2026, month: 0, day: 4 }; // a Sunday: day 0 of Date.getDay()
const FALLBACK_WEEKDAY = "";

/** Full weekday name in `locale` for `Date.getDay()` numbering (0 = Sunday), e.g. "Tuesday" / "Thứ Ba". */
export function weekdayName(day: number, locale: string): string {
  if (!Number.isInteger(day) || day < 0 || day > 6) return FALLBACK_WEEKDAY;
  const date = new Date(SUNDAY_2026.year, SUNDAY_2026.month, SUNDAY_2026.day + day);
  try {
    return date.toLocaleDateString(locale, { weekday: "long" });
  } catch {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }
}

/** The sentence under a repeat suggestion, translated and filled in. */
export function repeatHintText(suggestion: RepeatSuggestion, translate: Translate, locale: string): string {
  if (suggestion.repeat === "daily") return translate("You do this every day");
  if (suggestion.repeat === "weekdays") return translate("You do this most weekdays");
  const weekday = weekdayName(suggestion.weekday ?? -1, locale);
  return fillPlaceholders(translate("You usually do this on {weekday}s"), { weekday });
}

/** "Usually 30 min" and "Based on 4 similar tasks", already translated. */
export function durationHintTexts(suggestion: DurationSuggestion, translate: Translate): { usually: string; basedOn: string; apply: string } {
  const minutes = String(suggestion.minutes);
  return {
    usually: fillPlaceholders(translate("Usually {minutes} min"), { minutes }),
    basedOn: fillPlaceholders(translate("Based on {count} similar tasks"), { count: String(suggestion.basedOn) }),
    apply: fillPlaceholders(translate("Use {minutes} min"), { minutes }),
  };
}

export type CategoryOfferInput = {
  suggested: string | null;
  /** Ids a picker currently offers. */
  visible: readonly string[];
  /** True once the user picked a category in this editor session. */
  touched: boolean;
  current: string;
};

/** The suggested category when it can be offered: visible, not yet chosen by the user and not already selected. */
export function categoryToOffer({ suggested, visible, touched, current }: CategoryOfferInput): string | null {
  if (suggested === null || touched || suggested === current) return null;
  return visible.includes(suggested) ? suggested : null;
}

/** Whether the stale-tasks banner shows: there is something stale and it was not dismissed today. */
export function showStaleBanner(count: number, dismissedOn: string | null, today: string): boolean {
  return count > 0 && dismissedOn !== today;
}
