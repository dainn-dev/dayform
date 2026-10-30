import type { AssistantState } from "./assistant-state";

/**
 * How the flat assistant picture moves (framework-free, tested). Until the Live2D model exists the assistant is one
 * cut-out picture, so every state is a combination of a few transforms: an offset (dp), a tilt (degrees), a stretch, and
 * a mirror for "turning away". The component asks for a pose every frame.
 */
export type Pose = { dx: number; dy: number; rotate: number; scaleX: number; scaleY: number; flip: boolean };

export type PoseInput = {
  state: AssistantState;
  /** Milliseconds since the current state began. */
  t: number;
  /** A clock that keeps running across states, so the hover never jumps when the state changes. */
  now: number;
  /** Drag speed in dp per second (only while dragged). */
  dragVx?: number;
  /** Milliseconds since the assistant was let go, or null when it was not dropped recently. */
  sinceDrop?: number | null;
  /** 1 = full motion; less when the system asks to reduce motion. */
  motion?: number;
};

export const REST_POSE: Pose = { dx: 0, dy: 0, rotate: 0, scaleX: 1, scaleY: 1, flip: false };

const TAU = Math.PI * 2;
const HOVER_MS = 2400;
const HOVER_DP = 4;
const DROP_MS = 600;
export const MAX_DRAG_TILT = 25;
/** How long the angry shake lasts before the assistant turns away. */
export const ANGRY_SHAKE_MS = 700;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** 0 → 1 over `ms`, eased out. */
const easeIn = (t: number, ms: number) => {
  const x = clamp(t / ms, 0, 1);
  return 1 - (1 - x) * (1 - x);
};

export function poseAt(input: PoseInput): Pose {
  const { state, t, now } = input;
  const k = clamp(input.motion ?? 1, 0, 1);
  const pose: Pose = { ...REST_POSE };

  // Always floating: one hover cycle, slower and lower when sleepy.
  const hoverMs = state === "sleepy" ? HOVER_MS * 2 : HOVER_MS;
  pose.dy = -Math.sin((TAU * now) / hoverMs) * (state === "sleepy" ? HOVER_DP * 0.7 : HOVER_DP);

  switch (state) {
    case "idle":
      pose.rotate = Math.sin((TAU * now) / 5200) * 3;
      break;
    case "greeting": {
      // A little hop and a head tilt, then back.
      if (t < 900) pose.dy -= Math.abs(Math.sin((Math.PI * t) / 450)) * 7;
      pose.rotate = 8 * easeIn(t, 300) * (1 - easeIn(Math.max(0, t - 1800), 600));
      const pop = 1 + 0.05 * Math.sin(Math.PI * clamp(t / 500, 0, 1));
      pose.scaleX = pop;
      pose.scaleY = pop;
      break;
    }
    case "listening":
      // Leaning in, nodding now and then.
      pose.rotate = -3 + Math.sin((TAU * t) / 1600) * 1.5;
      pose.scaleX = 1.04;
      pose.scaleY = 1.04;
      break;
    case "thinking":
      // Head to one side, leaning back a little.
      pose.rotate = 8 * easeIn(t, 300) + Math.sin((TAU * t) / 3000) * 1;
      pose.dy -= 2;
      pose.scaleX = 0.98;
      break;
    case "talking":
      pose.rotate = Math.sin((TAU * t) / 700) * 2.5;
      pose.dy -= Math.abs(Math.sin((TAU * t) / 700)) * 1.5;
      break;
    case "angry":
      if (t < ANGRY_SHAKE_MS) {
        pose.dx = Math.sin((TAU * t) / 80) * 3;
      } else {
        pose.flip = true;
        pose.rotate = -4;
      }
      break;
    case "happy": {
      // Two bounces with a small squash on each landing.
      if (t < 1200) {
        const hop = Math.abs(Math.sin((Math.PI * t) / 600));
        pose.dy -= hop * 10;
        pose.scaleY = 0.95 + 0.05 * hop;
        pose.scaleX = 1.05 - 0.05 * hop;
      }
      break;
    }
    case "sleepy": {
      // A slow nod down, then a jerk back up.
      const cycle = t % 3000;
      pose.rotate = cycle < 2200 ? 10 * easeIn(cycle, 2200) : 10 * (1 - easeIn(cycle - 2200, 250));
      break;
    }
    case "dragged": {
      // Hanging from the finger: tilts against the drag and stretches a little.
      pose.rotate = clamp(-(input.dragVx ?? 0) * 0.04, -MAX_DRAG_TILT, MAX_DRAG_TILT);
      pose.scaleX = 0.95;
      pose.scaleY = 1.06;
      pose.dy = Math.sin((TAU * now) / 500) * 1.5;
      break;
    }
  }

  // Let go: a small bounce that dies out.
  const since = input.sinceDrop;
  if (state !== "dragged" && since !== null && since !== undefined && since >= 0 && since < DROP_MS) {
    const fade = 1 - since / DROP_MS;
    pose.dy -= Math.abs(Math.sin((Math.PI * since) / 300)) * 6 * fade;
    pose.scaleY *= 1 - 0.06 * fade * Math.cos((Math.PI * since) / 300);
  }

  return {
    dx: pose.dx * k,
    dy: pose.dy * k,
    rotate: pose.rotate * k,
    scaleX: 1 + (pose.scaleX - 1) * k,
    scaleY: 1 + (pose.scaleY - 1) * k,
    flip: pose.flip,
  };
}
