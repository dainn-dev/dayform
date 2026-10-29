import React from "react";
import { View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { KIND_META, type KindShape, type MarkedKind } from "../../lib/cycle-ui-kinds";

type Props = {
  kind: MarkedKind;
  size: number;
  /** Overrides the kind's accent, e.g. on the selected (filled) Timeline day. */
  color?: string;
};

const RING_RATIO = 0.2;
const DIAMOND_RATIO = 0.74;
const BAR_RATIO = 0.36;
const MIN_STROKE = 1.5;

/**
 * The shape that goes with each kind (disc, ring, diamond, bar), so the calendar never relies on color alone.
 * Plain Views: no icon font, so it stays crisp at any size. Decorative: the parent carries the accessibility label.
 */
export function KindSymbol({ kind, size, color }: Props) {
  const colors = useColors();
  const { group, shape } = KIND_META[kind];
  const tint = color ?? colors.cycle[group].accent;
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={shapeStyle(shape, size, tint)} />
  </View>;
}

function shapeStyle(shape: KindShape, size: number, tint: string) {
  switch (shape) {
    case "disc":
      return { width: size, height: size, borderRadius: size / 2, backgroundColor: tint };
    case "ring":
      return { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(MIN_STROKE, size * RING_RATIO), borderColor: tint };
    case "diamond": {
      const side = size * DIAMOND_RATIO;
      return { width: side, height: side, borderRadius: size * 0.1, backgroundColor: tint, transform: [{ rotate: "45deg" }] };
    }
    case "bar":
      return { width: size, height: Math.max(MIN_STROKE * 2, size * BAR_RATIO), borderRadius: size, backgroundColor: tint };
  }
}
