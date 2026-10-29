import { isValidName, normalizeName, normalizeSlogan } from "./settings";
import { fillPlaceholders } from "./text-template";

/** Part of the day the header greeting and slogan are written for. */
export type DayPeriod = "morning" | "afternoon" | "evening";

const AFTERNOON_STARTS_AT = 12;
const EVENING_STARTS_AT = 17;
const MS_PER_DAY = 86_400_000;

/**
 * Slogans shown under the greeting, four per part of the day. The English text is the translation key:
 * every entry except the original one is translated in lib/i18n/slogans.ts.
 */
export const SLOGANS: Record<DayPeriod, readonly string[]> = {
  morning: [
    "Make room for what matters.",
    "One clear task is a good start.",
    "Plan the day, then enjoy it.",
    "Small steps still move you forward.",
  ],
  afternoon: [
    "Keep the momentum going.",
    "Check in with your plan.",
    "Take a breath, then pick the next thing.",
    "Progress beats perfect.",
  ],
  evening: [
    "Wrap up what you can, leave the rest.",
    "Look back at what you finished today.",
    "Set up tomorrow, then unwind.",
    "You did enough today.",
  ],
};

const GREETINGS: Record<DayPeriod, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** Same greetings with a "{name}" placeholder; translated in lib/i18n/greeting.ts. */
const NAMED_GREETINGS: Record<DayPeriod, string> = {
  morning: "Good morning, {name}",
  afternoon: "Good afternoon, {name}",
  evening: "Good evening, {name}",
};

export type SloganStyle = "rotate" | "custom" | "off";
export type SloganOptions = { style: SloganStyle; custom: string };
type Translate = (text: string) => string;

export function dayPeriod(now: Date): DayPeriod {
  const hour = now.getHours();
  if (hour < AFTERNOON_STARTS_AT) return "morning";
  return hour < EVENING_STARTS_AT ? "afternoon" : "evening";
}

export function greetingFor(now: Date): string {
  return GREETINGS[dayPeriod(now)];
}

/** Whole days since 1970-01-01 for the local calendar date, so consecutive days always differ by one. */
function dayNumber(now: Date): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY);
}

/** One slogan per day and part of the day: stable while the day lasts, a different one tomorrow. */
export function sloganFor(now: Date): string {
  const list = SLOGANS[dayPeriod(now)];
  return list[dayNumber(now) % list.length];
}

/** The English key to translate: the named greeting when a name is shown and usable, else the plain greeting. */
export function greetingLine(now: Date, name: string, showName: boolean): string {
  const period = dayPeriod(now);
  return showName && isValidName(name) ? NAMED_GREETINGS[period] : GREETINGS[period];
}

/** Ready-to-render greeting: the translated key with the sanitised name filled in (never parsed as a template). */
export function greetingText(now: Date, name: string, showName: boolean, translate: Translate): string {
  return fillPlaceholders(translate(greetingLine(now, name, showName)), { name: normalizeName(name) });
}

type ResolvedSlogan = { text: string; translatable: boolean };

function resolveSlogan(now: Date, { style, custom }: SloganOptions): ResolvedSlogan | null {
  if (style === "off") return null;
  const own = style === "custom" ? normalizeSlogan(custom) : "";
  return own === "" ? { text: sloganFor(now), translatable: true } : { text: own, translatable: false };
}

/** Slogan under the greeting as stored (English key for the rotation, raw text for a custom one); null when off. */
export function sloganLine(now: Date, options: SloganOptions): string | null {
  return resolveSlogan(now, options)?.text ?? null;
}

/** Ready-to-render slogan: the rotation is translated, the user's own text never is; null when off. */
export function sloganText(now: Date, options: SloganOptions, translate: Translate): string | null {
  const slogan = resolveSlogan(now, options);
  if (slogan === null) return null;
  return slogan.translatable ? translate(slogan.text) : slogan.text;
}
