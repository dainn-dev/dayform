// The main picture of each rank (assets/ranks/emblems, about 4 KB each). Metro needs every path written out. A track without a
// picture yet (cultivation realms 6 to 9) has no entry: lib/rank-art.ts draws a generic orb for it. Everything else of a badge
// (background, rings, glow, pips, marks) is drawn by components/cultivation/RankBadge.tsx.
import type { ImageSourcePropType } from "react-native";
import type { LadderStyle } from "../lib/realm";

export const RANK_EMBLEMS: Readonly<Record<LadderStyle, Readonly<Record<number, ImageSourcePropType>>>> = {
  cultivation: {
    0: require("../assets/ranks/emblems/cultivation-0.png"),
    1: require("../assets/ranks/emblems/cultivation-1.png"),
    2: require("../assets/ranks/emblems/cultivation-2.png"),
    3: require("../assets/ranks/emblems/cultivation-3.png"),
    4: require("../assets/ranks/emblems/cultivation-4.png"),
  },
  engineer: {
    0: require("../assets/ranks/emblems/engineer-0.png"),
    1: require("../assets/ranks/emblems/engineer-1.png"),
    2: require("../assets/ranks/emblems/engineer-2.png"),
    3: require("../assets/ranks/emblems/engineer-3.png"),
    4: require("../assets/ranks/emblems/engineer-4.png"),
  },
};

/** The picture of a track in a style, or null when it has none yet. */
export function rankEmblem(style: LadderStyle, track: number): ImageSourcePropType | null {
  return RANK_EMBLEMS[style][track] ?? null;
}
