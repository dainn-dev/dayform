import React, { useMemo } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";
import { MAID_FRAME_SOURCES } from "../../constants/maid-frames";
import { MAID_FRAMES, maidLayout } from "../../lib/assistant-maid";
import type { AssistantLook } from "../../lib/settings";

// Leo and Ice Bear are one flat picture moved by transforms (until the Live2D model is rigged, see CLAUDE.md).
const PICTURES = {
  leo: require("../../assets/assistant/leo.png"),
  "ice-bear": require("../../assets/assistant/ice-bear.png"),
} as const;
/** Their closed eyes: a layer of the same size drawn over the picture (see lib/assistant-blink.ts). */
const EYES_CLOSED = {
  leo: require("../../assets/assistant/leo-eyes-closed.png"),
  "ice-bear": require("../../assets/assistant/ice-bear-eyes-closed.png"),
} as const;

type Props = {
  look: AssistantLook;
  width: number;
  height: number;
  transform: NonNullable<Animated.WithAnimatedValue<ViewStyle>["transform"]>;
  /** 1 while the eyes of a one-picture look are shut. */
  eyesShut: Animated.Value;
  /** The maid's frame, an index into MAID_FRAMES (whole numbers only). */
  frame: Animated.Value;
};

/**
 * The assistant's picture. Every picture a look can show stays mounted and only its opacity changes, so a blink or the
 * next frame never waits for an image to load (which would flicker on Android).
 */
export function AssistantFigure({ look, width, height, transform, eyesShut, frame }: Props) {
  const box = { width, height };
  const maidOpacity = useMemo(() => MAID_FRAMES.map((_, i) =>
    frame.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: "clamp" })), [frame]);

  if (look === "maid") {
    // Drawn larger than the box: the standing body fills it, other poses and the speed lines may reach outside.
    const { left, top, size } = maidLayout(width, height);
    const place = { position: "absolute" as const, left, top, width: size, height: size };
    return <Animated.View style={[box, { transform }]}>
      {MAID_FRAMES.map((name, i) => <Animated.Image key={name} source={MAID_FRAME_SOURCES[name]} fadeDuration={0}
        style={[place, { opacity: maidOpacity[i] }]} />)}
    </Animated.View>;
  }

  return <Animated.View style={[box, { transform }]}>
    <Animated.Image source={PICTURES[look]} resizeMode="contain" style={box} />
    <Animated.Image source={EYES_CLOSED[look]} resizeMode="contain" fadeDuration={0}
      style={[box, s.layer, { opacity: eyesShut }]} />
  </Animated.View>;
}

const s = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0 },
});
