import { PanResponder, Platform, type PanResponderInstance } from "react-native";
import * as Haptics from "expo-haptics";
import { minutes, type Task } from "../../lib/planner";
import {
  dragReducer,
  previewBlock,
  shiftStart,
  toTaskPatch,
  type Block,
  type DragEvent,
  type DragMode,
  type DragState,
} from "../../lib/timeline-gestures";
import { SCALE } from "./constants";

export type TaskPatch = ReturnType<typeof toTaskPatch>;

/** What the controller needs from the React side; read lazily so callbacks never go stale. */
export interface DragHost {
  latest(): {
    readonly task: Task;
    readonly block: Block;
    onCommit(patch: TaskPatch): Promise<boolean>;
    onPress(): void;
    onLockChange?(locked: boolean): void;
  };
  setDrag(state: DragState): void;
  setPending(block: Block | null): void;
}

export interface DragController {
  readonly body: PanResponderInstance;
  readonly top: PanResponderInstance;
  readonly bottom: PanResponderInstance;
  longPress(): void;
  pressIn(): void;
  pressOut(): void;
  shift(deltaMinutes: number): void;
  dispose(): void;
}

const IDLE: DragState = { phase: "idle" };
/** An armed block that is left alone this long goes back to normal. */
const ARMED_TIMEOUT_MS = 5000;
/** Movement below this (px) is a tap, not a drag. */
const TAP_SLOP_PX = 6;
/** An armed block takes over its touch from the Pressable once the finger moved this far (px). */
const GRAB_SLOP_PX = 3;

const sameBlock = (a: Block, b: Block) => a.start === b.start && a.duration === b.duration;

/** Best-effort feedback: a device without a haptic engine must not break dragging. */
function haptic(kind: "arm" | "tick"): void {
  if (Platform.OS === "web") return;
  const run = kind === "arm" ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync();
  run.catch(() => undefined);
}

/**
 * Framework-free glue between PanResponder events and `dragReducer`. All mutable gesture
 * state lives in this closure (never in React render), so responder callbacks cannot go stale.
 */
export function createDragController(host: DragHost): DragController {
  let state: DragState = IDLE;
  let grip = false; // a responder owned by this block currently holds the touch
  let press = false; // the inner Pressable is currently pressed
  let locked = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function syncLock() {
    const next = state.phase === "dragging" || grip || (state.phase === "armed" && press);
    if (next === locked) return;
    locked = next;
    host.latest().onLockChange?.(next);
  }

  function commit(block: Block) {
    host.setPending(block);
    void host.latest().onCommit(toTaskPatch(block)).finally(() => host.setPending(null));
  }

  function send(event: DragEvent) {
    const { block } = host.latest();
    const prev = state;
    const result = dragReducer(prev, event, block, SCALE);
    state = result.state;
    const moved = !sameBlock(previewBlock(prev, block, SCALE), previewBlock(state, block, SCALE));
    // Re-render only when something visible changed: the preview is snapped to 15 minutes.
    if (prev.phase !== state.phase || moved) host.setDrag(state);
    if (prev.phase === "idle" && state.phase === "armed") haptic("arm");
    if (state.phase === "dragging" && moved) haptic("tick");
    if (state.phase === "idle") clearTimer();
    if (result.commit) commit(result.commit);
    syncLock();
  }

  function scheduleDisarm() {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (state.phase === "armed" && !grip && !press) send({ type: "CANCEL" });
    }, ARMED_TIMEOUT_MS);
  }

  function grab() {
    grip = true;
    clearTimer();
    syncLock();
  }

  /** The finger left a responder. A drag commits; an untouched armed block stays armed. */
  function letGo(): void {
    grip = false;
    if (state.phase === "dragging") send({ type: "RELEASE" });
    else if (state.phase === "armed") scheduleDisarm();
    syncLock();
  }

  function abort(): void {
    grip = false;
    send({ type: "CANCEL" });
  }

  const body = PanResponder.create({
    // Only an armed block takes the touch from its inner Pressable; otherwise taps and page scrolling are untouched.
    onStartShouldSetPanResponderCapture: () => state.phase === "armed",
    onMoveShouldSetPanResponderCapture: (_e, g) => state.phase === "armed" && Math.hypot(g.dx, g.dy) > GRAB_SLOP_PX,
    onPanResponderGrant: grab,
    onPanResponderMove: (_e, g) => send({ type: "MOVE", dy: g.dy }),
    onPanResponderRelease: (_e, g) => {
      const tapped = state.phase === "armed" && Math.abs(g.dx) < TAP_SLOP_PX && Math.abs(g.dy) < TAP_SLOP_PX;
      if (!tapped) return letGo();
      grip = false;
      send({ type: "CANCEL" });
      host.latest().onPress();
    },
    onPanResponderTerminate: abort,
    onPanResponderTerminationRequest: () => false,
  });

  const handle = (mode: DragMode) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => state.phase === "armed",
      onPanResponderGrant: grab,
      onPanResponderMove: (_e, g) => send({ type: "MOVE", dy: g.dy, mode }),
      onPanResponderRelease: letGo,
      onPanResponderTerminate: abort,
      onPanResponderTerminationRequest: () => false,
    });

  return {
    body,
    top: handle("resize-top"),
    bottom: handle("resize-bottom"),
    longPress: () => send({ type: "LONG_PRESS" }),
    pressIn: () => {
      press = true;
      syncLock();
    },
    pressOut: () => {
      press = false;
      if (state.phase === "armed" && !grip) scheduleDisarm();
      syncLock();
    },
    shift: deltaMinutes => {
      const { task, block } = host.latest();
      const start = minutes(shiftStart(task.start!, task.duration, deltaMinutes));
      if (start !== block.start) commit({ start, duration: block.duration });
    },
    dispose: () => {
      clearTimer();
      state = IDLE;
      grip = false;
      press = false;
      syncLock();
    },
  };
}
