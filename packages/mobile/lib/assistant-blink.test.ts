import { describe, expect, test } from "bun:test";
import { ANGRY_SHAKE_MS } from "./assistant-pose";
import { BLINK_MS, BLINK_SLOT_MS, eyeLidsAt, eyesClosedAt, SLEEPY_PEEK } from "./assistant-blink";

/** How many separate closings happen in [from, to) for a state, sampled every 10 ms. */
function closings(state: Parameters<typeof eyesClosedAt>[0]["state"], from: number, to: number) {
  let count = 0;
  let closedMs = 0;
  let was = false;
  for (let now = from; now < to; now += 10) {
    const shut = eyesClosedAt({ state, t: now - from, now });
    if (shut && !was) count++;
    if (shut) closedMs += 10;
    was = shut;
  }
  return { count, closedMs };
}

describe("eyesClosedAt", () => {
  test("idle blinks now and then: about one blink per slot, each one short", () => {
    const minute = closings("idle", 1_000_000, 1_060_000);
    const slots = 60_000 / BLINK_SLOT_MS;
    expect(minute.count).toBeGreaterThanOrEqual(slots);
    expect(minute.count).toBeLessThanOrEqual(slots * 2);
    // The eyes are open almost all the time.
    expect(minute.closedMs).toBeLessThan(60_000 * 0.1);
  });

  test("a blink lasts BLINK_MS and the eyes are open between blinks", () => {
    let run = 0;
    let longest = 0;
    for (let now = 5_000_000; now < 5_120_000; now++) {
      if (eyesClosedAt({ state: "idle", t: 0, now })) longest = Math.max(longest, ++run);
      else run = 0;
    }
    expect(longest).toBe(BLINK_MS);
  });

  test("the same moment always gives the same answer, so the blink never flickers between frames", () => {
    for (let now = 0; now < 50_000; now += 37) {
      const input = { state: "talking" as const, t: 123, now };
      expect(eyesClosedAt(input)).toBe(eyesClosedAt(input));
    }
  });

  test("blinks while listening, thinking, talking and greeting too", () => {
    for (const state of ["listening", "thinking", "talking", "greeting"] as const) {
      expect(closings(state, 2_000_000, 2_060_000).count).toBeGreaterThan(5);
    }
  });

  test("dragged keeps the eyes wide open", () => {
    expect(closings("dragged", 3_000_000, 3_060_000).closedMs).toBe(0);
  });

  test("sleepy dozes with the eyes shut and only peeks after the nod jerks back up", () => {
    const [peekFrom, peekTo] = SLEEPY_PEEK;
    expect(eyesClosedAt({ state: "sleepy", t: 1000, now: 0 })).toBe(true);
    expect(eyesClosedAt({ state: "sleepy", t: peekFrom + 10, now: 0 })).toBe(false);
    expect(eyesClosedAt({ state: "sleepy", t: peekTo + 10, now: 0 })).toBe(true);
    // The same peek in every nod.
    expect(eyesClosedAt({ state: "sleepy", t: 3000 + peekFrom + 10, now: 0 })).toBe(false);
    expect(closings("sleepy", 0, 30_000).closedMs).toBeGreaterThan(30_000 * 0.7);
  });

  test("angry glares during the shake, then shuts the eyes when it turns away", () => {
    expect(eyesClosedAt({ state: "angry", t: ANGRY_SHAKE_MS - 10, now: 7_777_777 })).toBe(false);
    expect(eyesClosedAt({ state: "angry", t: ANGRY_SHAKE_MS + 10, now: 0 })).toBe(true);
  });

  test("a blink goes half shut, shut, half shut, and eyesClosedAt counts all of it as shut", () => {
    let start = 6_000_000;
    while (eyeLidsAt({ state: "idle", t: 0, now: start }) === "open") start++;
    const at = (ms: number) => eyeLidsAt({ state: "idle", t: 0, now: start + ms });
    expect(at(0)).toBe("half");
    expect(at(Math.floor(BLINK_MS / 2))).toBe("closed");
    expect(at(BLINK_MS - 1)).toBe("half");
    for (let ms = 0; ms < BLINK_MS; ms++) expect(eyesClosedAt({ state: "idle", t: 0, now: start + ms })).toBe(true);
    // Held shut (dozing, "hmph") is fully closed, never half.
    expect(eyeLidsAt({ state: "sleepy", t: 1000, now: 0 })).toBe("closed");
    expect(eyeLidsAt({ state: "angry", t: ANGRY_SHAKE_MS + 10, now: 0 })).toBe("closed");
  });

  test("happy smiles with the eyes shut through the bounces, then opens them", () => {
    expect(eyesClosedAt({ state: "happy", t: 300, now: 0 })).toBe(true);
    expect(closings("happy", 4_000_000 + 1500, 4_000_000 + 1500 + 60_000).count).toBeGreaterThan(5);
  });
});
