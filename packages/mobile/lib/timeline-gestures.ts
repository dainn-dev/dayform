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

/**
 * Move a block by the snapped drag distance. The distance is snapped, not the resulting
 * time, so a zero-distance drag never changes an off-grid start. A block that overhangs the
 * window end (it starts inside but ends after) is never pulled back just because of that:
 * it can only move earlier.
 */
export function moveBlock(
  args: Block & WindowBounds & { readonly deltaPx: number; readonly scale: number },
): Block {
  const { lo, hi } = bounds(args);
  const delta = snapMinutes(pxToMinutes(args.deltaPx, args.scale));
  const upper = Math.max(hi - args.duration, args.start);
  const start = clamp(args.start + delta, Math.min(lo, args.start), upper);
  return { start, duration: args.duration };
}

function resizeBottom(block: Block, delta: number, hi: number): Block {
  const end = block.start + block.duration;
  // The window end wins over the minimum duration, and a block that already ends past the
  // window (or is already shorter than the minimum) keeps its current end as the limit.
  const nextEnd = clamp(end + delta, Math.min(block.start + MIN_DURATION_MINUTES, end), Math.max(hi, end));
  return { start: block.start, duration: nextEnd - block.start };
}

function resizeTop(block: Block, delta: number, lo: number): Block {
  const end = block.start + block.duration;
  const maxStart = Math.max(block.start, end - MIN_DURATION_MINUTES);
  const start = clamp(block.start + delta, Math.min(lo, block.start), maxStart);
  return { start, duration: end - start };
}

export function resizeBlock(
  args: Block &
    WindowBounds & { readonly deltaPx: number; readonly scale: number; readonly edge: "top" | "bottom" },
): Block {
  const { lo, hi } = bounds(args);
  const block = { start: args.start, duration: args.duration };
  // A block entirely outside the window has nothing to resize against.
  if (args.start >= hi || args.start + args.duration <= lo) return block;
  const delta = snapMinutes(pxToMinutes(args.deltaPx, args.scale));
  return args.edge === "bottom" ? resizeBottom(block, delta, hi) : resizeTop(block, delta, lo);
}

export function toTaskPatch(block: Block): { start: string; duration: number } {
  return { start: formatMinutes(block.start), duration: block.duration };
}

/**
 * Accessibility "move N minutes earlier/later": shifted and clamped, as HH:mm. Like a drag,
 * it never moves a block merely because it overhangs the window.
 */
export function shiftStart(
  startTime: string,
  duration: number,
  deltaMinutes: number,
  windowStart: number = DEFAULT_WINDOW_START,
  windowEnd: number = DEFAULT_WINDOW_END,
): string {
  const start = minutes(startTime);
  const upper = Math.min(Math.max(Math.min(windowEnd, DAY_MINUTES) - duration, start), DAY_MINUTES - 1);
  return formatMinutes(clamp(start + deltaMinutes, Math.min(windowStart, start), upper));
}

/**
 * Top of an edge handle's touch area: the block edge sits `outsidePx` from the area's top
 * (top handle) or `hitPx - outsidePx` (bottom handle), and the area never leaves the
 * container, since Android does not deliver touches outside a parent's bounds.
 */
export function handleHitTop(
  edge: "top" | "bottom",
  edgeY: number,
  hitPx: number,
  outsidePx: number,
  containerHeight: number,
): number {
  const edgeInHit = edge === "top" ? outsidePx : hitPx - outsidePx;
  return clamp(edgeY - edgeInHit, 0, Math.max(0, containerHeight - hitPx));
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
