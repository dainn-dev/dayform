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
