import React, { useMemo } from "react";
import { Animated, type ViewStyle } from "react-native";
import { LOOK_FRAME_SOURCES } from "../../constants/assistant-frames";
import { ALL_FRAMES, frameLayout, isFrameLook, LOOK_FRAMES, type FrameLook } from "../../lib/assistant-frames";
import type { AssistantLook } from "../../lib/settings";

type Props = {
  look: AssistantLook;
  width: number;
  height: number;
  transform: NonNullable<Animated.WithAnimatedValue<ViewStyle>["transform"]>;
  /** The frame to show, an index into ALL_FRAMES (whole numbers only). */
  frame: Animated.Value;
};

/**
 * The assistant's picture: the frame of its look (lib/assistant-frames.ts). Every frame of the look stays mounted and only
 * its opacity changes, so a blink or the next frame never waits for an image to load (which would flicker on Android).
 */
export function AssistantFigure({ look, width, height, transform, frame }: Props) {
  return <Animated.View style={[{ width, height }, { transform }]}>
    {isFrameLook(look) && <Frames look={look} width={width} height={height} frame={frame} />}
  </Animated.View>;
}

/** Drawn larger than the box: the standing body fills it, other poses (and their effects) may reach outside. */
function Frames({ look, width, height, frame }: { look: FrameLook; width: number; height: number; frame: Animated.Value }) {
  const place = { position: "absolute" as const, ...frameLayout(look, width, height) };
  const opacities = useMemo(() => LOOK_FRAMES[look].map(name => {
    const i = ALL_FRAMES.indexOf(name);
    return frame.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: "clamp" });
  }), [look, frame]);
  return <>
    {LOOK_FRAMES[look].map((name, n) => <Animated.Image key={`${look}:${name}`} source={LOOK_FRAME_SOURCES[look][name]}
      fadeDuration={0} style={[place, { opacity: opacities[n] }]} />)}
  </>;
}
