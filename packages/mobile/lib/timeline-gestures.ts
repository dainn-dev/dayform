import { minutes } from "./planner";

// Pure drag/resize logic for the day timeline. Framework-free on purpose: the
// UI wiring (React Native PanResponder) feeds pixels in and applies the result.

export const SNAP_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const LONG_PRESS_MS = 350;

const DAY_MINUTES = 1440;
const DEFAULT_WINDOW_START = 360;
const DEFAULT_WINDOW_END = 1320;

export interface Block {
  readonly start: number;
  readonly duration: number;
}

export type DragMode = "move" | "resize-top" | "resize-bottom";

export type DragState =
  | { readonly phase: "idle" }
  | { readonly phase: "armed" }
  | { readonly phase: "dragging"; readonly mode: DragMode; readonly deltaPx: number };

export type DragEvent =
  | { readonly type: "LONG_PRESS" }
  | { readonly type: "MOVE"; readonly dy: number; readonly mode?: DragMode }
  | { readonly type: "RELEASE" }
  | { readonly type: "CANCEL" };

export interface DragResult {
  readonly state: DragState;
  readonly commit: Block | null;
}

interface WindowBounds {
  readonly windowStart?: number;
  readonly windowEnd?: number;
}

export function pxToMinutes(px: number, scale: number): number {
  return px / scale;
}

/** Round to the nearest step; halves round away from zero so +/- are symmetric. */
export function snapMinutes(minutesValue: number, step: number = SNAP_MINUTES): number {
  const snapped = Math.sign(minutesValue) * Math.round(Math.abs(minutesValue) / step) * step;
  return snapped + 0; // normalise -0
}

export function formatMinutes(total: number): string {
  if (!Number.isInteger(total) || total < 0 || total >= DAY_MINUTES) {
    throw new RangeError(`minutes out of range: ${total}`);
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function bounds({ windowStart = DEFAULT_WINDOW_START, windowEnd = DEFAULT_WINDOW_END }: WindowBounds) {
  return { lo: windowStart, hi: Math.min(windowEnd, DAY_MINUTES) };
}

export function moveBlock(
  args: Block & WindowBounds & { readonly deltaPx: number; readonly scale: number },
): Block {
  const { lo, hi } = bounds(args);
  const raw = snapMinutes(args.start + pxToMinutes(args.deltaPx, args.scale));
  // A task longer than the window gets hi - duration < lo: pin to the window start.
  const start = clamp(raw, lo, Math.max(lo, hi - args.duration));
  return { start, duration: args.duration };
}

export function resizeBlock(
  args: Block &
    WindowBounds & { readonly deltaPx: number; readonly scale: number; readonly edge: "top" | "bottom" },
): Block {
  const { lo, hi } = bounds(args);
  const delta = pxToMinutes(args.deltaPx, args.scale);
  const end = args.start + args.duration;
  // A block entirely outside the window has nothing to resize against.
  if (args.start >= hi || end <= lo) return { start: args.start, duration: args.duration };
  if (args.edge === "bottom") {
    // The window end wins over the minimum duration: a block that starts closer
    // than MIN_DURATION_MINUTES to the end may stay shorter than the minimum.
    const minEnd = Math.min(args.start + MIN_DURATION_MINUTES, hi);
    const nextEnd = clamp(snapMinutes(end + delta), minEnd, hi);
    return { start: args.start, duration: nextEnd - args.start };
  }
  // Same rule at the window start: the start never leaves the window.
  const maxStart = Math.max(lo, end - MIN_DURATION_MINUTES);
  const start = clamp(snapMinutes(args.start + delta), lo, maxStart);
  return { start, duration: end - start };
}

export function toTaskPatch(block: Block): { start: string; duration: number } {
  return { start: formatMinutes(block.start), duration: block.duration };
}

/** Accessibility "move N minutes earlier/later": shifted and clamped, as HH:mm. */
export function shiftStart(
  startTime: string,
  duration: number,
  deltaMinutes: number,
  windowStart: number = DEFAULT_WINDOW_START,
  windowEnd: number = DEFAULT_WINDOW_END,
): string {
  const hi = Math.min(windowEnd, DAY_MINUTES) - duration;
  const upper = Math.min(Math.max(windowStart, hi), DAY_MINUTES - 1);
  return formatMinutes(clamp(minutes(startTime) + deltaMinutes, windowStart, upper));
}

/** Snapped block to render live for the current drag state. */
export function previewBlock(state: DragState, block: Block, scale: number): Block {
  if (state.phase !== "dragging") return { start: block.start, duration: block.duration };
  const { deltaPx } = state;
  if (state.mode === "move") return moveBlock({ ...block, deltaPx, scale });
  const edge = state.mode === "resize-top" ? "top" : "bottom";
  return resizeBlock({ ...block, deltaPx, scale, edge });
}

const IDLE: DragState = { phase: "idle" };

function release(state: DragState, block: Block, scale: number): DragResult {
  if (state.phase !== "dragging") return { state: IDLE, commit: null };
  const next = previewBlock(state, block, scale);
  const changed = next.start !== block.start || next.duration !== block.duration;
  return { state: IDLE, commit: changed ? next : null };
}

/**
 * Drag state machine. `LONG_PRESS` arms; the first `MOVE` after arming starts
 * the drag (`mode` defaults to "move"; resize handles pass a resize mode);
 * `RELEASE` commits only when the snapped result differs from `block`.
 */
export function dragReducer(
  state: DragState,
  event: DragEvent,
  block: Block,
  scale: number,
): DragResult {
  switch (event.type) {
    case "LONG_PRESS":
      return { state: state.phase === "idle" ? { phase: "armed" } : state, commit: null };
    case "MOVE":
      if (state.phase === "armed") {
        return {
          state: { phase: "dragging", mode: event.mode ?? "move", deltaPx: event.dy },
          commit: null,
        };
      }
      if (state.phase === "dragging") {
        return { state: { ...state, deltaPx: event.dy }, commit: null };
      }
      return { state, commit: null };
    case "RELEASE":
      return release(state, block, scale);
    case "CANCEL":
      return { state: IDLE, commit: null };
  }
}
