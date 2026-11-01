import React, { memo, useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { rankEmblem } from "../../constants/rank-emblems";
import { BADGE, badgeShapes, type Shape } from "../../lib/rank-art";
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
 * The badge of a rank. Only the main picture of each rank is an image (assets/ranks/emblems); the background, the rings of the
 * stage, the glow, the pips of the layer and the marks are drawn from Views by the shapes of lib/rank-art.ts, so the whole
 * ladder costs a few KB instead of hundreds of pictures. A rank without a picture yet gets a generic glowing orb.
 */
function RankBadgeView({ style, realm, layer, stage, size, dim = false }: Props) {
  const source = rankEmblem(style, realm);
  const shapes = useMemo(() => badgeShapes(style, realm, layer, stage, source !== null), [style, realm, layer, stage, source]);
  const k = size / BADGE;
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
    style={[{ width: size, height: size }, dim && styles.dim]}>
    {shapes.map((shape, index) => <ShapeView key={index} shape={shape} k={k} style={style} realm={realm} />)}
  </View>;
}

export const RankBadge = memo(RankBadgeView);

function ShapeView({ shape, k, style, realm }: { shape: Shape; k: number; style: LadderStyle; realm: number }) {
  switch (shape.kind) {
    case "circle": {
      const sw = shape.strokeWidth ?? 0;
      const outer = shape.r + sw / 2;
      return <View style={{
        position: "absolute", left: (shape.cx - outer) * k, top: (shape.cy - outer) * k, width: outer * 2 * k, height: outer * 2 * k, borderRadius: outer * k,
        backgroundColor: shape.fill ?? "transparent", borderWidth: shape.stroke ? sw * k : 0, borderColor: shape.stroke, opacity: shape.opacity,
      }} />;
    }
    case "rect": {
      const sw = shape.stroke ? shape.strokeWidth ?? 0 : 0;
      const w = shape.w + sw;
      const h = shape.h + sw;
      return <View style={{
        position: "absolute", left: (shape.cx - w / 2) * k, top: (shape.cy - h / 2) * k, width: w * k, height: h * k, borderRadius: (shape.radius + sw / 2) * k,
        backgroundColor: shape.fill ?? "transparent", borderWidth: sw * k, borderColor: shape.stroke, opacity: shape.opacity,
        transform: shape.rotate === 0 ? undefined : [{ rotate: `${shape.rotate}deg` }],
      }} />;
    }
    case "hex": {
      // A hexagon with a vertex at the top: a rectangle between two triangles (the triangles are made of borders).
      const half = (Math.sqrt(3) / 2) * shape.r * k;
      const quarter = (shape.r / 2) * k;
      const left = shape.cx * k - half;
      const top = shape.cy * k;
      return <View style={[styles.fill, { opacity: shape.opacity }]} pointerEvents="none">
        <View style={{ position: "absolute", left, top: top - quarter, width: half * 2, height: quarter * 2, backgroundColor: shape.fill }} />
        <View style={{ position: "absolute", left, top: top - quarter * 2, width: 0, height: 0, borderLeftWidth: half, borderRightWidth: half, borderBottomWidth: quarter, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: shape.fill }} />
        <View style={{ position: "absolute", left, top: top + quarter, width: 0, height: 0, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: quarter, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: shape.fill }} />
      </View>;
    }
    case "emblem": {
      const source = rankEmblem(style, realm);
      if (!source) return null;
      return <Image source={source} resizeMode="contain" style={{ position: "absolute", left: (shape.cx - shape.size / 2) * k, top: (shape.cy - shape.size / 2) * k, width: shape.size * k, height: shape.size * k }} />;
    }
  }
}

const styles = StyleSheet.create({
  dim: { opacity: 0.22 },
  fill: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
});
