import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { rankIcon } from "../../constants/rank-icons";
import type { LadderStyle } from "../../lib/realm";

type Props = {
  style: LadderStyle;
  /** The track (a great realm, or a career rank). */
  realm: number;
  layer: number;
  /** 0..3 */
  stage: number;
  size: number;
  /** Not reached yet: drawn faint. */
  dim?: boolean;
};

/**
 * The picture of a rank. Every engineer rank and the first three cultivation realms have art (assets/ranks); a track without
 * art yet gets a ring with its layer number, drawn with the theme's colours, so the ladder is never empty.
 */
export function RankBadge({ style, realm, layer, stage, size, dim = false }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const source = rankIcon(style, realm, layer, stage);
  const faint = dim ? s.dim : null;
  if (source) return <Image source={source} style={[{ width: size, height: size }, faint]} resizeMode="contain" accessible={false} />;
  return <View accessible={false} style={[s.ring, { width: size, height: size, borderRadius: size / 2, borderWidth: 1 + stage }, faint]}>
    <Text style={[s.layer, { fontSize: size * 0.4 }]}>{layer}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  dim: { opacity: 0.22 },
  ring: { alignItems: "center", justifyContent: "center", borderColor: c.primary, backgroundColor: c.primaryTint },
  layer: { color: c.primary, fontWeight: "900" },
});
