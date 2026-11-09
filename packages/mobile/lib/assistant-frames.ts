import { eyeLidsAt, type BlinkInput } from "./assistant-blink";
import type { AssistantLook } from "./settings";

/**
 * Every look of the assistant is drawn as frames (framework-free, tested): Leo, Ice Bear and the maid. A look has a
 * breathing idle, a blink, maybe mouth shapes, and four-frame loops for happy, sleepy, angry and dragged, all cut from the
 * owner's art. The component asks for one frame name every animation frame and still applies the shared transforms
 * (hover, tilt, bounce) on top.
 */
export const FRAME_LOOKS = ["leo", "ice-bear", "maid", "silver"] as const satisfies readonly AssistantLook[];
export type FrameLook = (typeof FRAME_LOOKS)[number];

export const ALL_FRAMES = [
  "idle", "idle-in", "idle-out", "blink-half", "blink-closed", "talk-small", "talk-open",
  "happy-0", "happy-1", "happy-2", "happy-3",
  "sleepy-0", "sleepy-1", "sleepy-2", "sleepy-3",
  "angry-0", "angry-1", "angry-2", "angry-3",
  "dragged-0", "dragged-1", "dragged-2", "dragged-3",
] as const;
export type Frame = (typeof ALL_FRAMES)[number];

/** The frames each look ships (`assets/assistant/<look>/<frame>.webp`). */
export const LOOK_FRAMES: Record<FrameLook, readonly Frame[]> = {
  // The owner's asset set, like the maid's: duplicate frames dropped.
  leo: ALL_FRAMES,
  maid: ALL_FRAMES,
  silver: ALL_FRAMES,
  // From the owner's pose sheet; the idle and its blink are the sharp ice-bear.png with its eyelid layer.
  "ice-bear": ALL_FRAMES.filter(f => f !== "blink-half" && f !== "talk-small" && f !== "talk-open"),
};

export const isFrameLook = (look: AssistantLook): look is FrameLook => (FRAME_LOOKS as readonly string[]).includes(look);

export type FrameInput = BlinkInput & {
  /** While talking: how open the mouth is now (0..1, from the speech timeline). */
  talk?: number;
};

const IDLE_BREATH: readonly Frame[] = ["idle", "idle-in", "idle-in", "idle", "idle-out", "idle-out"];
/** Without a speech timeline the mouth keeps this beat. */
const TALK_BEAT: readonly Frame[] = ["idle", "talk-small", "talk-open", "talk-small"];
const LOOPS = {
  happy: ["happy-0", "happy-1", "happy-2", "happy-3"],
  sleepy: ["sleepy-0", "sleepy-1", "sleepy-2", "sleepy-3"],
  angry: ["angry-0", "angry-1", "angry-2", "angry-3"],
  dragged: ["dragged-0", "dragged-1", "dragged-2", "dragged-3"],
} as const satisfies Record<string, readonly Frame[]>;

/** Frames per second of each loop (from the maid's manifest; Ice Bear uses the same pace). */
const FPS = { idle: 4, talk: 10, happy: 8, sleepy: 3, angry: 10, dragged: 10 } as const;
/** Mouth openness from which the small and the open mouth show. */
const MOUTH_SMALL = 0.2;
const MOUTH_OPEN = 0.6;

const step = <T>(frames: readonly T[], ms: number, fps: number): T => frames[Math.floor((Math.max(0, ms) * fps) / 1000) % frames.length];

export function frameAt(look: FrameLook, input: FrameInput): Frame {
  const { state, t, now } = input;
  const has = (frame: Frame) => LOOK_FRAMES[look].includes(frame);
  switch (state) {
    case "dragged": return step(LOOPS.dragged, now, FPS.dragged);
    case "sleepy": return step(LOOPS.sleepy, t, FPS.sleepy);
    case "angry": return step(LOOPS.angry, t, FPS.angry);
    // The happy pose is also how they say hello.
    case "happy":
    case "greeting": return step(LOOPS.happy, now, FPS.happy);
    case "talking": {
      // A look without mouth shapes keeps breathing while it talks.
      if (!has("talk-open")) return step(IDLE_BREATH, now, FPS.idle);
      const talk = input.talk;
      if (talk === undefined) return step(TALK_BEAT, t, FPS.talk);
      return talk >= MOUTH_OPEN ? "talk-open" : talk >= MOUTH_SMALL ? "talk-small" : "idle";
    }
    default: {
      // Idle, listening and thinking breathe, and blink on the same clock as the other looks.
      const lids = eyeLidsAt(input);
      if (lids === "half") return has("blink-half") ? "blink-half" : "blink-closed";
      if (lids === "closed") return "blink-closed";
      return step(IDLE_BREATH, now, FPS.idle);
    }
  }
}

/**
 * Each look's frame size (px) and where the standing body of its idle frame lies in it. Other poses (dragged with its
 * hair and speed lines, happy jumping) reach outside the body, which is why the picture is drawn larger than the
 * assistant's box and may overflow it.
 */
export type FrameArt = { width: number; height: number; body: { left: number; right: number; top: number; bottom: number } };
export const LOOK_ART: Record<FrameLook, FrameArt> = {
  // Cut from the 512 px originals at 110,70 (322x438) and shrunk so the body is 340 px tall.
  leo: { width: 269, height: 366, body: { left: 3.3, right: 236.4, top: 22.6, bottom: 362.6 } },
  // Cut from the 512 px originals at 60,38 (402x474) and shrunk so the body is 340 px tall.
  silver: { width: 305, height: 360, body: { left: 49.3, right: 255, top: 12.9, bottom: 352.9 } },
  // Cut from the 512 px originals at 64,62 into a 448 px box (shipped at 352 px, same proportions).
  maid: { width: 448, height: 448, body: { left: 37, right: 340, top: 10, bottom: 442 } },
  // Built in the space of ice-bear.png and shrunk so its body is 392 px tall.
  "ice-bear": { width: 599, height: 569, body: { left: 219.3, right: 597.4, top: 90, bottom: 482 } },
};

export type FrameLayout = { left: number; top: number; width: number; height: number };

/** The picture's size and offset (dp) so the look's standing body fits a `width` x `height` box, centred, feet on its bottom. */
export function frameLayout(look: FrameLook, width: number, height: number): FrameLayout {
  const art = LOOK_ART[look];
  const { body } = art;
  const k = Math.min(width / (body.right - body.left), height / (body.bottom - body.top));
  return {
    left: width / 2 - ((body.left + body.right) / 2) * k,
    top: height - body.bottom * k,
    width: art.width * k,
    height: art.height * k,
  };
}
