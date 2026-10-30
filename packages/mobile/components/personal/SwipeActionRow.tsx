import React, { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { settleSwipe, shouldCaptureSwipe, swipeOffset } from "../../lib/swipe-row";

const SETTLE_MS = 160;

type Props = {
  /** When false the row does not respond to swipes and stays closed. */
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Width of the action uncovered by sliding the row to the left. */
  actionWidth: number;
  /** An opaque colour for the row, so the action underneath is hidden while closed. */
  backgroundColor: string;
  action: ReactNode;
  children: ReactNode;
};

/**
 * A row that slides to the left to uncover an action (swipe from right to left). Built on React Native's PanResponder:
 * the gesture-handler libraries are excluded from this app (Windows path limit). The open/closed state is controlled
 * so the parent can keep a single row open at a time; the decisions are in lib/swipe-row.ts.
 */
export function SwipeActionRow({ enabled, open, onOpenChange, actionWidth, backgroundColor, action, children }: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const startOffset = useRef(0);
  const latest = useRef({ enabled, open, onOpenChange, actionWidth });
  latest.current = { enabled, open, onOpenChange, actionWidth };

  useEffect(() => {
    const id = x.addListener(({ value }) => { offset.current = value; });
    return () => x.removeListener(id);
  }, [x]);

  const target = open && enabled ? -actionWidth : 0;
  useEffect(() => {
    Animated.timing(x, { toValue: target, duration: SETTLE_MS, useNativeDriver: true }).start();
  }, [x, target]);

  const pan = useMemo(() => {
    const finish = (velocityX: number) => {
      const { actionWidth: width, open: wasOpen, onOpenChange: notify } = latest.current;
      const next = settleSwipe(offset.current, velocityX, width) === "open";
      Animated.timing(x, { toValue: next ? -width : 0, duration: SETTLE_MS, useNativeDriver: true }).start();
      if (next !== wasOpen) notify(next);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => latest.current.enabled && shouldCaptureSwipe(gesture.dx, gesture.dy, latest.current.open),
      onPanResponderGrant: () => { x.stopAnimation(value => { startOffset.current = value; }); },
      onPanResponderMove: (_event, gesture) => x.setValue(swipeOffset(startOffset.current, gesture.dx, latest.current.actionWidth)),
      onPanResponderRelease: (_event, gesture) => finish(gesture.vx),
      onPanResponderTerminate: () => finish(0),
      // The page's vertical ScrollView must not steal a swipe that is already in progress.
      onPanResponderTerminationRequest: () => false,
    });
  }, [x]);

  return <View style={s.container}>
    <View style={[s.action, { width: actionWidth }]} accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"}>
      {action}
    </View>
    <Animated.View {...pan.panHandlers} style={{ backgroundColor, transform: [{ translateX: x }] }}>
      {children}
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  container: { overflow: "hidden" },
  action: { position: "absolute", top: 0, bottom: 0, right: 0 },
});
