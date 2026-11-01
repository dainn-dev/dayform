import type { LadderStyle } from "./realm";

/**
 * The words of each style (framework-free, tested). The cultivation English texts are the base keys used everywhere; the
 * engineer style swaps a key for its own English text, and both are translated in lib/i18n/realm.ts. A key that has no engineer
 * wording is the same in both styles.
 */
export const ENGINEER_WORDS: Readonly<Record<string, string>> = {
  "Cultivation": "Engineer career",
  "{realm}, layer {layer} – {stage}": "{realm} Lv.{layer} – {stage}",
  "{xp} experience": "{xp} XP",
  "{xp}/{next} exp": "{xp}/{next} XP",
  "{xp} exp": "{xp} XP",
  "{n} more experience to reach {rank}": "{n} more XP to reach {rank}",
  "{n} more experience to start the breakthrough to {realm}": "{n} more XP to start the review for {realm}",
  "{n} more experience to break through to {realm}": "{n} more XP to be promoted to {realm}",
  "Breakthrough": "Promotion",
  "Gathering strength to break through to {realm}": "Preparing for promotion to {realm}",
  "Reaching {realm} takes {n} more experience. The last {gate} of it is the breakthrough, which only fills once you reach layer 9, perfection.":
    "Reaching {realm} takes {n} more XP. The last {gate} of it is the promotion review, which only fills once you reach Lv.9, Stable.",
  "The highest realm": "The top rank",
  "Realms": "Ranks",
  "Layer {n}": "Level {n}",
  "Cultivation is on": "Ranking is on",
  "Experience for finished tasks": "XP for finished tasks",
  "Finished tasks earn experience and raise your realm. A day without a finished task is a rest day (one per week, four per month); more than that costs experience, and many in a row can lower your realm. Tasks added after their day do not count.":
    "Finished tasks earn XP and raise your rank. A day without a finished task is a rest day (one per week, four per month); more than that costs XP, and many in a row can lower your rank. Tasks added after their day do not count.",
  "Erase your experience and realm?": "Erase your XP and rank?",
  "Congratulations! You entered the {realm} realm!": "Promoted! You are now a {realm}!",
  "Breakthrough! You reached {rank}.": "Level up! You reached {rank}.",
  "Your cultivation was shaken: -{amount} experience, and you fell back a realm. Finish a task today to climb again!":
    "Your career slipped: -{amount} XP, and you dropped a rank. Finish a task today to climb again!",
  "A day without a finished task cost you {amount} experience. Finish one today!": "A day without a finished task cost you {amount} XP. Finish one today!",
  "{days} days without a finished task cost you {amount} experience. Finish one today!": "{days} days without a finished task cost you {amount} XP. Finish one today!",
};

/** The text of `key` in a style: the key itself for cultivation, the engineer wording where there is one. */
export function word(style: LadderStyle, key: string): string {
  return style === "engineer" ? ENGINEER_WORDS[key] ?? key : key;
}
