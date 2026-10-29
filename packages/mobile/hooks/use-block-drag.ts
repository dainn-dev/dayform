import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GestureResponderHandlers } from "react-native";
import { createDragController, type DragHost, type ShiftResult, type TaskPatch } from "../components/timeline/drag-controller";
import { SCALE } from "../components/timeline/constants";
import { minutes, type Task } from "../lib/planner";
import { formatMinutes, LONG_PRESS_MS, previewBlock, type Block, type DragState } from "../lib/timeline-gestures";

export interface UseBlockDragArgs {
  /** The stored task (a scheduled one: `start` is set). */
  task: Task;
  /** Persist the new time/length; resolves false when the save failed. */
  onCommit: (patch: TaskPatch) => Promise<boolean>;
  /** A plain tap. */
  onPress: () => void;
  /** True while a finger is down on an armed or dragging block: the page must not scroll. */
  onLockChange?: (locked: boolean) => void;
}

export interface BlockDrag {
  phase: DragState["phase"];
  /** The task as it should be drawn: the live snapped preview while dragging, else the stored one. */
  shown: Task;
  body: GestureResponderHandlers;
  topHandle: GestureResponderHandlers;
  bottomHandle: GestureResponderHandlers;
  /** Props for the block's inner Pressable. */
  pressable: { delayLongPress: number; onLongPress: () => void; onPressIn: () => void; onPressOut: () => void };
  /** Accessibility alternative to dragging: move by a number of minutes. */
  shift: (deltaMinutes: number) => Promise<ShiftResult>;
}

const IDLE: DragState = { phase: "idle" };

function latestOf({ task, onCommit, onPress, onLockChange }: UseBlockDragArgs): ReturnType<DragHost["latest"]> {
  return { task, block: { start: minutes(task.start!), duration: task.duration }, onCommit, onPress, onLockChange };
}

function drawn(task: Task, block: Block): Task {
  if (block.start === minutes(task.start!) && block.duration === task.duration) return task;
  return { ...task, start: formatMinutes(block.start), duration: block.duration };
}

/**
 * Long-press to arm a timeline block, then drag its body to move it or an edge handle to
 * resize it (PanResponder + the pure `dragReducer`; no native gesture libraries). Gesture
 * state lives in a controller, so the responder callbacks always see the latest props.
 */
export function useBlockDrag(args: UseBlockDragArgs): BlockDrag {
  const [drag, setDrag] = useState<DragState>(IDLE);
  const [pending, setPending] = useState<Block | null>(null);
  const latest = useRef(latestOf(args));
  // Layout effect: responder callbacks must see the new props before the next touch event, not after paint.
  useLayoutEffect(() => {
    latest.current = latestOf(args);
  });
  const [controller] = useState(() => createDragController({ latest: () => latest.current, setDrag, setPending }));
  useEffect(() => () => controller.dispose(), [controller]);

  const stored = latestOf(args).block;
  // While a save is in flight keep showing the committed position instead of snapping back.
  const block = drag.phase === "dragging" ? previewBlock(drag, stored, SCALE) : (pending ?? stored);

  return {
    phase: drag.phase,
    shown: drawn(args.task, block),
    body: controller.body.panHandlers,
    topHandle: controller.top.panHandlers,
    bottomHandle: controller.bottom.panHandlers,
    pressable: {
      delayLongPress: LONG_PRESS_MS,
      onLongPress: controller.longPress,
      onPressIn: controller.pressIn,
      onPressOut: controller.pressOut,
    },
    shift: controller.shift,
  };
}
