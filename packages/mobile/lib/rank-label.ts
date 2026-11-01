import { word } from "./ladder-words";
import { CULTIVATION, rankOf, rankParts, type Ladder, type Rank } from "./realm";
import { fillPlaceholders } from "./text-template";

type Translate = (text: string) => string;

/** "Kim Đan tầng 3 – Hậu kỳ" or "Senior Lv.3 – Beta": the rank's name in the user's language. */
export function rankLabel(rank: Rank, t: Translate, ladder: Ladder = CULTIVATION): string {
  const parts = rankParts(rank, ladder);
  return fillPlaceholders(t(word(ladder.id, "{realm}, layer {layer} – {stage}")), { realm: t(parts.realm), layer: String(parts.layer), stage: t(parts.stage) });
}

/** The first step of a track: reaching it is a breakthrough / promotion into a new track, not only a new stage. */
export function isNewRealm(rank: Rank): boolean {
  return rank.layer === 1 && rank.stage === 0 && !rank.breakthrough;
}

/** A number with thousands separators in the language's style (1.234 in Vietnamese, 1,234 in English). */
export function formatNumber(value: number, language: "en" | "vi"): string {
  const digits = String(Math.max(0, Math.round(value)));
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, language === "vi" ? "." : ",");
}

/**
 * The short experience line of the profile card: how much of the current stage is gathered over what it takes ("20/40 exp"), or
 * the whole total at the top of the ladder. `text` is in the style's wording; the caller translates it and fills the values.
 */
export function expLine(rank: Rank, total: number, language: "en" | "vi", ladder: Ladder = CULTIVATION): GoalLine {
  if (rank.next === null) return { text: word(ladder.id, "{xp} exp"), vars: { xp: formatNumber(total, language) } };
  return {
    text: word(ladder.id, "{xp}/{next} exp"),
    vars: { xp: formatNumber(Math.max(0, total - rank.floor), language), next: formatNumber(rank.next - rank.floor, language) },
  };
}

/** A line of text as a translation key plus the values for its placeholders (translated by the caller). */
export type GoalLine = { text: string; vars: Record<string, string> };

/**
 * What the cultivator is working towards, with how much is still missing (`needed`, as a formatted number): the next stage,
 * or, at layer 9 last stage, the breakthrough into the next track. null at the top of the ladder. `text` is already in the
 * style's wording; the caller translates it and fills the values.
 */
export function goalLine(rank: Rank, total: number, t: Translate, language: "en" | "vi", ladder: Ladder = CULTIVATION): GoalLine | null {
  if (rank.next === null) return null;
  const needed = formatNumber(rank.next - total, language);
  const target = rankOf(rank.next, ladder);
  const style = ladder.id;
  // The last stage of a track leads into the breakthrough gauge, then the breakthrough leads into the next track.
  if (!rank.breakthrough && target.breakthrough) {
    return { text: word(style, "{n} more experience to start the breakthrough to {realm}"), vars: { n: needed, realm: t(ladder.tracks[rank.realm + 1]) } };
  }
  if (rank.breakthrough) {
    return { text: word(style, "{n} more experience to break through to {realm}"), vars: { n: needed, realm: t(ladder.tracks[rank.realm + 1]) } };
  }
  return { text: word(style, "{n} more experience to reach {rank}"), vars: { n: needed, rank: rankLabel(target, t, ladder) } };
}
