import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eyeLidsAt } from "./assistant-blink";
import type { AssistantState } from "./assistant-state";
import { MAID_ART, MAID_FRAMES, maidFrameAt, maidLayout, type MaidFrame } from "./assistant-maid";

/** Every frame a state shows over `ms`, sampled every 10 ms. */
function framesOf(state: AssistantState, ms: number, from = 9_000_000, talk?: number): Set<MaidFrame> {
  const seen = new Set<MaidFrame>();
  for (let x = 0; x < ms; x += 10) seen.add(maidFrameAt({ state, t: x, now: from + x, talk }));
  return seen;
}

describe("maidFrameAt", () => {
  test("idle breathes through its three frames and blinks with the half and closed frames", () => {
    const seen = framesOf("idle", 60_000);
    for (const f of ["idle", "idle-in", "idle-out", "blink-half", "blink-closed"] as const) expect(seen.has(f)).toBe(true);
    for (const f of seen) expect(["idle", "idle-in", "idle-out", "blink-half", "blink-closed"]).toContain(f);
  });

  test("the blink frames follow the shared blink clock exactly", () => {
    for (let now = 1_000_000; now < 1_040_000; now += 7) {
      const lids = eyeLidsAt({ state: "listening", t: 0, now });
      const frame = maidFrameAt({ state: "listening", t: 0, now });
      if (lids === "half") expect(frame).toBe("blink-half");
      else if (lids === "closed") expect(frame).toBe("blink-closed");
      else expect(frame.startsWith("blink")).toBe(false);
    }
  });

  test("talking opens the mouth by the speech timeline", () => {
    expect(maidFrameAt({ state: "talking", t: 0, now: 0, talk: 0 })).toBe("idle");
    expect(maidFrameAt({ state: "talking", t: 0, now: 0, talk: 0.4 })).toBe("talk-small");
    expect(maidFrameAt({ state: "talking", t: 0, now: 0, talk: 1 })).toBe("talk-open");
  });

  test("talking without a timeline keeps a steady closed, small, open, small beat", () => {
    const seen = framesOf("talking", 2000);
    expect([...seen].sort()).toEqual(["idle", "talk-open", "talk-small"]);
  });

  test("each reaction plays all four of its own frames", () => {
    const cases: [AssistantState, string][] = [["happy", "happy"], ["greeting", "happy"], ["sleepy", "sleepy"], ["angry", "angry"], ["dragged", "dragged"]];
    for (const [state, set] of cases) {
      const seen = framesOf(state, 5000);
      expect([...seen].sort() as string[]).toEqual([0, 1, 2, 3].map(i => `${set}-${i}`));
    }
  });

  test("every answer is a known frame", () => {
    const states: AssistantState[] = ["idle", "greeting", "listening", "thinking", "talking", "angry", "happy", "sleepy", "dragged"];
    for (const state of states) for (const f of framesOf(state, 8000)) expect(MAID_FRAMES).toContain(f);
  });
});

describe("maidLayout", () => {
  test("puts the standing body exactly in the assistant's box (feet on the bottom, head at the top, centred)", () => {
    const { left, top, size } = maidLayout(80, 112);
    const k = size / MAID_ART.box;
    expect(top + MAID_ART.body.top * k).toBeCloseTo(0, 6);
    expect(top + MAID_ART.body.bottom * k).toBeCloseTo(112, 6);
    expect(left + ((MAID_ART.body.left + MAID_ART.body.right) / 2) * k).toBeCloseTo(40, 6);
    // The body is no wider than the box, so a tap on her lands on the assistant.
    expect((MAID_ART.body.right - MAID_ART.body.left) * k).toBeLessThanOrEqual(80);
  });
});

describe("maid frame files", () => {
  test("constants/maid-frames.ts requires one existing picture per frame", () => {
    const root = join(import.meta.dir, "..");
    const table = readFileSync(join(root, "constants", "maid-frames.ts"), "utf8");
    for (const frame of MAID_FRAMES) {
      const path = `assets/assistant/maid/${frame}.webp`;
      expect(table).toContain(`"${frame}": require("../${path}")`);
      expect(existsSync(join(root, path))).toBe(true);
    }
  });
});
