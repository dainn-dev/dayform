import { describe, expect, test } from "bun:test";
import { ANGRY_SHAKE_MS, MAX_DRAG_TILT, poseAt } from "./assistant-pose";
import { ASSISTANT_STATES } from "./assistant-state";

const sample = (fn: (ms: number) => number, until: number, step = 16) => {
  const values: number[] = [];
  for (let ms = 0; ms <= until; ms += step) values.push(fn(ms));
  return values;
};

describe("assistant pose", () => {
  test("every state gives finite numbers at any time", () => {
    for (const state of ASSISTANT_STATES) {
      for (const t of [0, 123, 999, 5000, 60_000]) {
        const pose = poseAt({ state, t, now: t * 3, dragVx: 500, sinceDrop: 100 });
        for (const value of [pose.dx, pose.dy, pose.rotate, pose.scaleX, pose.scaleY]) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  test("idle floats up and down a few dp and tilts gently", () => {
    const dys = sample(now => poseAt({ state: "idle", t: now, now }).dy, 2400);
    expect(Math.max(...dys)).toBeGreaterThan(3);
    expect(Math.min(...dys)).toBeLessThan(-3);
    expect(Math.max(...dys.map(Math.abs))).toBeLessThanOrEqual(4.01);
    const tilts = sample(now => poseAt({ state: "idle", t: now, now }).rotate, 5200);
    expect(Math.max(...tilts.map(Math.abs))).toBeLessThanOrEqual(3.01);
  });

  test("sleepy floats slower than idle", () => {
    const at = (state: "idle" | "sleepy") => poseAt({ state, t: 600, now: 600 }).dy;
    expect(Math.abs(at("sleepy"))).toBeLessThan(Math.abs(at("idle")));
  });

  test("angry shakes first, then turns away", () => {
    expect(poseAt({ state: "angry", t: 100, now: 100 }).flip).toBe(false);
    expect(poseAt({ state: "angry", t: 20, now: 20 }).dx).not.toBe(0);
    expect(poseAt({ state: "angry", t: ANGRY_SHAKE_MS + 50, now: 0 }).flip).toBe(true);
  });

  test("happy bounces twice and settles", () => {
    const hops = sample(t => poseAt({ state: "happy", t, now: 0 }).dy, 1200);
    expect(Math.min(...hops)).toBeLessThan(-8);
    expect(poseAt({ state: "happy", t: 1700, now: 0 }).dy).toBe(-0);
  });

  test("a drag tilts against its direction, never past the limit", () => {
    expect(poseAt({ state: "dragged", t: 0, now: 0, dragVx: 300 }).rotate).toBeLessThan(0);
    expect(poseAt({ state: "dragged", t: 0, now: 0, dragVx: -300 }).rotate).toBeGreaterThan(0);
    expect(poseAt({ state: "dragged", t: 0, now: 0, dragVx: 99_999 }).rotate).toBe(-MAX_DRAG_TILT);
  });

  test("being let go bounces, and the bounce fades out", () => {
    const early = poseAt({ state: "idle", t: 0, now: 0, sinceDrop: 150 }).dy;
    expect(early).toBeLessThan(-3);
    expect(poseAt({ state: "idle", t: 0, now: 0, sinceDrop: 700 }).dy).toBe(-0);
  });

  test("talking lifts on each syllable and rests between them", () => {
    expect(poseAt({ state: "talking", t: 0, now: 0, talk: 1 }).dy).toBeLessThan(poseAt({ state: "talking", t: 0, now: 0, talk: 0 }).dy);
    expect(poseAt({ state: "talking", t: 0, now: 0, talk: 1 }).scaleY).toBeGreaterThan(1);
  });

  test("reduced motion keeps the poses but makes them much smaller", () => {
    const full = poseAt({ state: "happy", t: 300, now: 0 });
    const calm = poseAt({ state: "happy", t: 300, now: 0, motion: 0.3 });
    expect(Math.abs(calm.dy)).toBeCloseTo(Math.abs(full.dy) * 0.3, 5);
  });
});
