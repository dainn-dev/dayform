/**
 * The rank ladders (framework-free, tested). A ladder has a number of tracks (great realms / career ranks), each with nine
 * layers (tầng / levels), and each layer with four stages. There are two styles, one experience total shared by both:
 *  - "cultivation": 9 realms (Luyện Khí … Độ Kiếp), stages sơ kỳ / trung kỳ / hậu kỳ / đại viên mãn: 9 x 9 x 4 = 324 steps;
 *  - "engineer": 5 ranks (Intern … Senior), stages Alpha / Beta / RC / Stable: 5 x 9 x 4 = 180 steps.
 * The rank is never stored, only derived from the experience total, so a changed table, a penalty or a switch of style can
 * never leave a rank that disagrees with the points. The English names are the translation keys (lib/i18n/realm.ts).
 *
 * The layers of a track cost different amounts: the first stage of the first track costs 100 and each layer after it costs
 * 20% more than the one before (see `stageCostAt`); the next track starts from a higher first stage (`growth`).
 *
 * Climbing a stage is cheap, but entering the next track is a bottleneck: after the last stage of a track (layer 9, last
 * stage) the cultivator must gather a large extra amount (`gateFactor` stages' worth) before the breakthrough / promotion.
 * Meanwhile the rank stays at layer 9, last stage, with `breakthrough: true`. The first track's `realm` field is called
 * `realm` for both styles.
 */
export type LadderStyle = "cultivation" | "engineer";
export const LADDER_STYLES: readonly LadderStyle[] = ["cultivation", "engineer"];

export type Ladder = {
  id: LadderStyle;
  /** English names, also translation keys. */
  tracks: readonly string[];
  stages: readonly string[];
  /** Experience for one stage of the first track, and how much each next track multiplies it. */
  base: number;
  growth: number;
  /** The breakthrough into the next track costs this many stages of the track being left. */
  gateFactor: number;
};

export const REALM_NAMES = [
  "Qi Refining", "Foundation Establishment", "Golden Core", "Nascent Soul", "Spirit Transformation",
  "Void Refinement", "Body Integration", "Mahayana", "Tribulation",
] as const;
export const STAGE_NAMES = ["Early stage", "Middle stage", "Late stage", "Perfection"] as const;

export const CULTIVATION: Ladder = { id: "cultivation", tracks: REALM_NAMES, stages: STAGE_NAMES, base: 100, growth: 1.5, gateFactor: 15 };
export const ENGINEER: Ladder = { id: "engineer", tracks: ["Intern", "Fresher", "Junior", "Middle", "Senior"], stages: ["Alpha", "Beta", "RC", "Stable"], base: 100, growth: 2, gateFactor: 15 };
export const LADDERS: Readonly<Record<LadderStyle, Ladder>> = { cultivation: CULTIVATION, engineer: ENGINEER };

export const LAYERS = 9;
export const STAGES = STAGE_NAMES.length;
const STEPS_PER_REALM = LAYERS * STAGES;
export const BREAKTHROUGH_FACTOR = CULTIVATION.gateFactor;

const lastTrack = (ladder: Ladder) => ladder.tracks.length - 1;

/** Experience for the first stage of a track, at layer 1 (a multiple of 5): 100 in the first track. Later layers cost more, see `stageCostAt`. */
export function stageCost(realm: number, ladder: Ladder = CULTIVATION): number {
  return Math.round((ladder.base * ladder.growth ** realm) / 5) * 5;
}

/** Every layer of a track costs this many times the layer before it (1.2: 20% more). */
export const LAYER_GROWTH = 1.2;

/** Experience for one stage of a layer (1..9) of a track: layer 1 costs `stageCost`, each layer after it 20% more (a multiple of 5). */
export function stageCostAt(realm: number, layer: number, ladder: Ladder = CULTIVATION): number {
  return Math.round((stageCost(realm, ladder) * LAYER_GROWTH ** (layer - 1)) / 5) * 5;
}

/** Experience for the four stages of each layer of a track, layer 1 first. */
export function layerCosts(realm: number, ladder: Ladder = CULTIVATION): readonly number[] {
  return Array.from({ length: LAYERS }, (_, index) => stageCostAt(realm, index + 1, ladder) * STAGES);
}

/** The extra experience that opens the way into the next track; the last track has no next one. */
export function breakthroughCost(realm: number, ladder: Ladder = CULTIVATION): number {
  return realm >= lastTrack(ladder) ? 0 : Math.round((stagesCost(realm, ladder) * ladder.gateFactor) / STEPS_PER_REALM / 5) * 5;
}

/** Experience to climb every stage of a track, before its breakthrough. */
function stagesCost(realm: number, ladder: Ladder): number {
  return layerCosts(realm, ladder).reduce((sum, cost) => sum + cost, 0);
}

/** Experience at which a track begins. */
export function realmStart(realm: number, ladder: Ladder = CULTIVATION): number {
  let total = 0;
  for (let i = 0; i < Math.min(realm, ladder.tracks.length); i++) total += stagesCost(i, ladder) + breakthroughCost(i, ladder);
  return total;
}

/** Experience of the very last step: the top of a ladder. */
export function maxXp(ladder: Ladder = CULTIVATION): number {
  return realmStart(ladder.tracks.length, ladder);
}
export const MAX_XP = maxXp(CULTIVATION);

export type Rank = {
  /** The track: 0..8 for cultivation, 0..4 for engineer. */
  realm: number;
  /** 1..9 */
  layer: number;
  /** 0..3 into the ladder's stages */
  stage: number;
  /** 0..323 (cultivation) or 0..179 (engineer) over the whole ladder. */
  step: number;
  /** Experience where this stage begins, and where the next begins (null at the top). */
  floor: number;
  next: number | null;
  /** 0..1 inside the current stage (or inside the breakthrough). */
  progress: number;
  /** At layer 9, last stage, gathering the experience for the breakthrough into the next track. */
  breakthrough: boolean;
  max: boolean;
};

export function rankOf(xp: number, ladder: Ladder = CULTIVATION): Rank {
  const total = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  const last = lastTrack(ladder);
  const top = maxXp(ladder);
  if (total >= top) {
    return {
      realm: last, layer: LAYERS, stage: STAGES - 1, step: ladder.tracks.length * STEPS_PER_REALM - 1,
      floor: top - stageCostAt(last, LAYERS, ladder), next: null, progress: 1, breakthrough: false, max: true,
    };
  }
  let realm = 0;
  while (realm + 1 < ladder.tracks.length && total >= realmStart(realm + 1, ladder)) realm++;
  const start = realmStart(realm, ladder);
  const inRealm = total - start;
  if (inRealm >= stagesCost(realm, ladder)) {
    const floor = start + stagesCost(realm, ladder);
    const gate = breakthroughCost(realm, ladder);
    return {
      realm, layer: LAYERS, stage: STAGES - 1, step: realm * STEPS_PER_REALM + STEPS_PER_REALM - 1,
      floor, next: floor + gate, progress: (total - floor) / gate, breakthrough: true, max: false,
    };
  }
  // The layers of a track cost different amounts (see layerCosts), so find the layer first, then the stage inside it.
  const costs = layerCosts(realm, ladder);
  let layerOffset = 0;
  let layerIndex = 0;
  while (layerIndex < LAYERS - 1 && inRealm >= layerOffset + costs[layerIndex]) {
    layerOffset += costs[layerIndex];
    layerIndex++;
  }
  const cost = costs[layerIndex] / STAGES;
  const stage = Math.floor((inRealm - layerOffset) / cost);
  const floor = start + layerOffset + stage * cost;
  return {
    realm,
    layer: layerIndex + 1,
    stage,
    step: realm * STEPS_PER_REALM + layerIndex * STAGES + stage,
    floor,
    next: floor + cost,
    progress: (total - floor) / cost,
    breakthrough: false,
    max: false,
  };
}

/** The parts of a rank's name as translation keys plus the layer number, for the UI to translate and join. */
export function rankParts(rank: Rank, ladder: Ladder = CULTIVATION): { realm: string; layer: number; stage: string } {
  return { realm: ladder.tracks[rank.realm], layer: rank.layer, stage: ladder.stages[rank.stage] };
}

/** Experience still missing for the next track, or null in the last one. */
export function toNextRealm(total: number, rank: Rank, ladder: Ladder = CULTIVATION): number | null {
  return rank.realm >= lastTrack(ladder) ? null : Math.max(0, realmStart(rank.realm + 1, ladder) - Math.max(0, total));
}
