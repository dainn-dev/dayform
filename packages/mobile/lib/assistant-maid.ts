import { eyeLidsAt, type BlinkInput } from "./assistant-blink";

/**
 * The maid, the third look of the assistant (framework-free, tested). Unlike Leo and Ice Bear, who are one picture moved
 * by transforms, she is a set of drawn frames: a breathing idle, a blink, three mouth shapes and four-frame loops for
 * happy, sleepy, angry and dragged (the owner's asset set; duplicate frames were dropped, so the idle breath is three
 * pictures played as idle, in, in, idle, out, out). The component asks for one frame name every animation frame and
 * still applies the shared transforms (hover, tilt, bounce) on top.
 */
export const MAID_FRAMES = [
  "idle", "idle-in", "idle-out", "blink-half", "blink-closed", "talk-small", "talk-open",
  "happy-0", "happy-1", "happy-2", "happy-3",
  "sleepy-0", "sleepy-1", "sleepy-2", "sleepy-3",
  "angry-0", "angry-1", "angry-2", "angry-3",
  "dragged-0", "dragged-1", "dragged-2", "dragged-3",
] as const;
export type MaidFrame = (typeof MAID_FRAMES)[number];

export type MaidInput = BlinkInput & {
  /** While talking: how open the mouth is now (0..1, from the speech timeline). */
  talk?: number;
};

const IDLE_BREATH: readonly MaidFrame[] = ["idle", "idle-in", "idle-in", "idle", "idle-out", "idle-out"];
/** Without a speech timeline the mouth keeps this beat. */
const TALK_BEAT: readonly MaidFrame[] = ["idle", "talk-small", "talk-open", "talk-small"];
const LOOPS = {
  happy: ["happy-0", "happy-1", "happy-2", "happy-3"],
  sleepy: ["sleepy-0", "sleepy-1", "sleepy-2", "sleepy-3"],
  angry: ["angry-0", "angry-1", "angry-2", "angry-3"],
  dragged: ["dragged-0", "dragged-1", "dragged-2", "dragged-3"],
} as const satisfies Record<string, readonly MaidFrame[]>;

/** Frames per second of each loop (from the asset set's manifest). */
const FPS = { idle: 4, talk: 10, happy: 8, sleepy: 3, angry: 10, dragged: 10 } as const;
/** Mouth openness from which the small and the open mouth show. */
const MOUTH_SMALL = 0.2;
const MOUTH_OPEN = 0.6;

const step = <T>(frames: readonly T[], ms: number, fps: number): T => frames[Math.floor((Math.max(0, ms) * fps) / 1000) % frames.length];

export function maidFrameAt(input: MaidInput): MaidFrame {
  const { state, t, now } = input;
  switch (state) {
    case "dragged": return step(LOOPS.dragged, now, FPS.dragged);
    case "sleepy": return step(LOOPS.sleepy, t, FPS.sleepy);
    case "angry": return step(LOOPS.angry, t, FPS.angry);
    // Her happy pose (eyes ^^, hands together) is also how she says hello.
    case "happy":
    case "greeting": return step(LOOPS.happy, now, FPS.happy);
    case "talking": {
      const talk = input.talk;
      if (talk === undefined) return step(TALK_BEAT, t, FPS.talk);
      return talk >= MOUTH_OPEN ? "talk-open" : talk >= MOUTH_SMALL ? "talk-small" : "idle";
    }
    default: {
      // Idle, listening and thinking breathe, and blink on the same clock as the other looks.
      const lids = eyeLidsAt(input);
      if (lids === "half") return "blink-half";
      if (lids === "closed") return "blink-closed";
      return step(IDLE_BREATH, now, FPS.idle);
    }
  }
}

/**
 * Where the frames sit (pixels of the shipped 448 px box, cut from the 512 px originals at 64,62): the standing body of
 * the idle frame spans `body`. Other poses (the dragged one with its speed lines) reach outside it, which is why the
 * picture is drawn larger than the assistant's box and may overflow it.
 */
export const MAID_ART = { box: 448, body: { left: 37, right: 340, top: 10, bottom: 442 } } as const;

export type MaidLayout = { left: number; top: number; size: number };

/** The square picture's size and offset (dp) so the standing body fills a `width` x `height` box, feet on its bottom. */
export function maidLayout(width: number, height: number): MaidLayout {
  const { box, body } = MAID_ART;
  const k = height / (body.bottom - body.top);
  return { left: width / 2 - ((body.left + body.right) / 2) * k, top: -body.top * k, size: box * k };
}
