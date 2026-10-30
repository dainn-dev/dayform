/** Pure arithmetic behind the keyboard handling of the Modal forms (see hooks/use-keyboard-inset.ts). */

export type KeyboardMetrics = { screenY: number; height: number };
/** `top` is the keyboard's top edge in screen coordinates, or null while it is hidden. */
export type KeyboardState = { height: number; top: number | null };

export const HIDDEN_KEYBOARD: KeyboardState = { height: 0, top: null };

/**
 * Turns a keyboard event frame into a state. iOS reports a hide as a frame that starts at or below the window
 * edge; Android sends a separate hide event, but an empty frame also counts as hidden.
 */
export function keyboardFromMetrics(metrics: KeyboardMetrics, windowHeight: number): KeyboardState {
  if (metrics.height <= 0) return HIDDEN_KEYBOARD;
  if (metrics.screenY > 0 && metrics.screenY >= windowHeight) return HIDDEN_KEYBOARD;
  return { height: metrics.height, top: metrics.screenY > 0 ? metrics.screenY : windowHeight - metrics.height };
}

/**
 * The lift a bar pinned to the bottom needs so its bottom edge sits at the keyboard's top edge, from where it was
 * MEASURED (window coordinates, with `currentLift` already applied). Measuring beats computing from the keyboard
 * height: whether that height includes the navigation bar differs between devices and Android versions, while the
 * window position of the bar and of the keyboard are always in the same coordinate system.
 */
export function liftCorrection(currentLift: number, barBottom: number, keyboardTop: number): number {
  return Math.max(0, Math.round(currentLift + barBottom - keyboardTop));
}

/** Bottom padding of the scrolled content: the normal padding plus the room the keyboard takes. */
export function contentBottomPadding(basePadding: number, keyboardHeight: number): number {
  return basePadding + Math.max(0, keyboardHeight);
}

type RevealInput = {
  /** Top and bottom edge of the focused field, in window coordinates. */
  fieldTop: number;
  fieldBottom: number;
  /** Top of the scroll viewport and the lowest visible y (the keyboard's top, or the viewport bottom). */
  viewportTop: number;
  visibleBottom: number;
  margin: number;
};

/**
 * How far the scroll view must scroll (positive = down) so the field and a margin are visible.
 * A field taller than the visible area keeps its bottom visible, because that is where the user types.
 */
export function revealDelta({ fieldTop, fieldBottom, viewportTop, visibleBottom, margin }: RevealInput): number {
  const covered = fieldBottom + margin - visibleBottom;
  if (covered > 0) return covered;
  const above = fieldTop - margin - viewportTop;
  return above < 0 ? above : 0;
}

export function nextScrollY(current: number, delta: number): number {
  return Math.max(0, current + delta);
}
