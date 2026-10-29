import React, { useMemo } from "react";
import { StyleSheet, View, type DimensionValue, type GestureResponderHandlers } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

/** Touch target of a resize handle (px); the visible grip is smaller. */
export const HANDLE_HIT_PX = 28;
/** How far the hit area reaches outside the block edge (px). */
const OUTSIDE_PX = 10;
const GRIP_HEIGHT = 7;

type Props = {
  edge: "top" | "bottom";
  blockTop: number;
  blockHeight: number;
  /** Same horizontal placement as the block, so the handle sits on its own lane. */
  place: { left: DimensionValue; width: DimensionValue };
  handlers: GestureResponderHandlers;
  label: string;
};

/** Drag handle on the top or bottom edge of an armed block. A sibling of the block, never a child. */
export function EdgeHandle({ edge, blockTop, blockHeight, place, handlers, label }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // Where the block edge falls inside the hit area: 10px from its top for the top handle, 18px for the bottom one.
  const edgeInHit = edge === "top" ? OUTSIDE_PX : HANDLE_HIT_PX - OUTSIDE_PX;
  const edgeY = edge === "top" ? blockTop : blockTop + blockHeight;
  return <View
    {...handlers}
    accessible
    accessibilityLabel={label}
    style={[s.hit, place, { top: edgeY - edgeInHit, paddingTop: edgeInHit - GRIP_HEIGHT / 2 }]}
  >
    <View style={s.grip} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hit: { position: "absolute", height: HANDLE_HIT_PX, zIndex: 21, elevation: 11, alignItems: "center" },
  grip: { width: 40, height: GRIP_HEIGHT, borderRadius: GRIP_HEIGHT / 2, backgroundColor: c.primary, borderWidth: 1.5, borderColor: c.card },
});
