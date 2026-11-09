import type { AssistantState } from "./assistant-state";
import { ANGRY_SHAKE_MS, HAPPY_BOUNCE_MS, SLEEPY_JERK_MS, SLEEPY_NOD_MS, SLEEPY_SINK_MS } from "./assistant-pose";

/**
 * How shut the assistant's eyes are (framework-free, tested): open, half or closed. Every look picks its blink frames
 * from this (lib/assistant-frames.ts), so all looks blink, doze and squeeze their eyes on the same clock.
 *
 * The answer depends only on the moment, never on a random number drawn per frame, so the same frame always gives the
 * same answer and a blink never flickers. Time is cut into slots of BLINK_SLOT_MS; each slot has one blink at an offset
 * picked by a hash of the slot number (so the gaps vary between about 1 and 7 seconds), and one slot in five blinks twice.
 */
export type BlinkInput = {
  state: AssistantState;
  /** Milliseconds since the current state began. */
  t: number;
  /** A clock that keeps running across states (Date.now()). */
  now: number;
};

export const BLINK_SLOT_MS = 4000;
/** How long the eyes stay shut in one blink. */
export const BLINK_MS = 130;
/** The earliest and the span of offsets a blink can start at inside its slot. */
const BLINK_FIRST_MS = 400;
const BLINK_SPREAD_MS = 3000;
/** A double blink: the second one starts this long after the first. */
const DOUBLE_GAP_MS = 260;
/** Within each sleepy nod the eyes open only for this window (ms into the nod): right after the head jerks back up. */
export const SLEEPY_PEEK: readonly [number, number] = [SLEEPY_SINK_MS + SLEEPY_JERK_MS, SLEEPY_SINK_MS + SLEEPY_JERK_MS + 450];

/** A small integer hash (murmur3 finaliser), the same on every device. */
function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** How shut the eyelids are. A look with a half-shut picture (the maid) shows "half"; the others treat it as shut. */
export type EyeLids = "open" | "half" | "closed";
/** At the start and the end of a blink the lids are half shut for this long. */
const HALF_MS = 40;

/** The lids during one blink that began `at` ms ago. */
function lidsIn(at: number): EyeLids {
  if (at < 0 || at >= BLINK_MS) return "open";
  return at < HALF_MS || at >= BLINK_MS - HALF_MS ? "half" : "closed";
}

/** The lids of the ordinary blinks. */
function blinking(now: number): EyeLids {
  const slot = Math.floor(now / BLINK_SLOT_MS);
  const h = hash(slot);
  const at = now - slot * BLINK_SLOT_MS - (BLINK_FIRST_MS + (h % BLINK_SPREAD_MS));
  const first = lidsIn(at);
  if (first !== "open") return first;
  const twice = (h >>> 16) % 5 === 0;
  return twice ? lidsIn(at - DOUBLE_GAP_MS) : "open";
}

export function eyeLidsAt({ state, t, now }: BlinkInput): EyeLids {
  switch (state) {
    case "dragged":
      // Picked up: wide awake.
      return "open";
    case "sleepy": {
      // Dozing; the eyes open only for a moment after each nod jerks the head back up.
      const cycle = t % SLEEPY_NOD_MS;
      return cycle >= SLEEPY_PEEK[0] && cycle < SLEEPY_PEEK[1] ? "open" : "closed";
    }
    case "angry":
      // A glare while shaking, then "hmph": eyes shut, turned away.
      return t >= ANGRY_SHAKE_MS ? "closed" : "open";
    case "happy":
      // A contented smile with the eyes shut through the bounces.
      return t < HAPPY_BOUNCE_MS ? "closed" : blinking(now);
    default:
      return blinking(now);
  }
}
