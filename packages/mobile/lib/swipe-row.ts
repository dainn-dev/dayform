/**
 * Pure decisions behind a swipe-to-reveal row (see components/personal/SwipeActionRow.tsx): a row slides to the left
 * to uncover an action of `width` px. Offsets are <= 0: 0 is closed, `-width` is fully open.
 */

/** Past this fraction of the action width a released row stays open. */
export const OPEN_RATIO = 0.4;
/** A fling faster than this (px per ms) decides the outcome on its own. */
export const FLING_VELOCITY = 0.5;
/** Horizontal travel (px) before a touch counts as a swipe rather than a tap or a scroll. */
export const CAPTURE_DISTANCE = 8;
/** The gesture must be this much more horizontal than vertical, so scrolling the page never opens a row. */
export const HORIZONTAL_BIAS = 1.5;

/** Where the row is while a finger has moved `dx` px from where the gesture started (`startOffset`: 0 or -width). */
export function swipeOffset(startOffset: number, dx: number, width: number): number {
  return Math.min(0, Math.max(-width, startOffset + dx));
}

/** Whether a released row ends up open or closed, from its offset and horizontal velocity (px/ms, negative = left). */
export function settleSwipe(offset: number, velocityX: number, width: number): "open" | "closed" {
  if (velocityX <= -FLING_VELOCITY) return "open";
  if (velocityX >= FLING_VELOCITY) return "closed";
  return offset <= -width * OPEN_RATIO ? "open" : "closed";
}

/** Whether a moving touch should be taken over as a swipe: clearly horizontal, and leftwards unless already open. */
export function shouldCaptureSwipe(dx: number, dy: number, open: boolean): boolean {
  const horizontal = Math.abs(dx) > CAPTURE_DISTANCE && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS;
  return horizontal && (dx < 0 || open);
}
