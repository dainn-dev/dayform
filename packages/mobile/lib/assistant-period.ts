import type { Line } from "./assistant-answers";
import type { CycleState } from "./cycle-model";
import { predict } from "./cycle-predict";

/**
 * The assistant's answer to "when is my next period?" (framework-free, tested). Worked out on the device from the period
 * tracker and never sent anywhere: the AI chat does not see this data, and its prompt and tools stay shut to it. Only
 * the estimated date of the next period is ever said: nothing about fertility, ovulation or "safe" days, which the app
 * shows only on its own private screen with its disclaimer. Callers ask for the unlock first when the tracker is locked.
 * Texts are English keys (lib/i18n/assistant.ts); `{placeholders}` come from `vars`.
 */
export const PERIOD_QUESTION = "When is my next period?";

const ESTIMATE = "It's only an estimate.";

/** Said instead of an answer when the user could not be confirmed, or the tracker is not ready to be read. */
export const PERIOD_LINES = {
  notYou: { text: "I need to confirm it's you first." },
  notReady: { text: "I can't check that right now. Try again in a moment." },
} as const satisfies Record<string, Line>;

/** `formatDate` turns a `YYYY-MM-DD` key into a short date in the user's language. */
export function periodAnswer(state: CycleState, today: string, formatDate: (key: string) => string): Line {
  if (!state.enabled) return { text: "Period tracking is off. You can turn it on under Personal, Cycle." };
  if (state.paused) return { text: "Tracking is paused, so I can't estimate your next period." };
  const prediction = predict(state, today);
  // One start date alone only gives the default cycle length: "later than your usual cycle" would mean nothing yet.
  if (prediction.nextStart === null || prediction.daysUntilNext === null || prediction.cycleCount < 1) {
    return { text: "I need at least two period start dates to estimate the next one. Add them on the Cycle screen." };
  }
  const days = prediction.daysUntilNext;
  if (days < 0) {
    return days === -1
      ? { text: `Your period is 1 day later than your usual cycle. ${ESTIMATE}` }
      : { text: `Your period is {n} days later than your usual cycle. ${ESTIMATE}`, vars: { n: -days } };
  }
  if (days === 0) return { text: `Your next period is expected today. ${ESTIMATE}` };
  if (days === 1) return { text: `Your next period is expected tomorrow. ${ESTIMATE}` };
  return { text: `Your next period is expected in {n} days, around {date}. ${ESTIMATE}`, vars: { n: days, date: formatDate(prediction.nextStart) } };
}
