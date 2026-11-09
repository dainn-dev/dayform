import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eyeLidsAt } from "./assistant-blink";
import type { AssistantState } from "./assistant-state";
import { ASSISTANT_LOOKS } from "./settings";
import { FRAME_LOOKS, LOOK_ART, LOOK_FRAMES, frameAt, frameLayout, type Frame, type FrameLook } from "./assistant-frames";

/** Every frame a state shows over `ms`, sampled every 10 ms. */
function framesOf(look: FrameLook, state: AssistantState, ms: number, from = 9_000_000, talk?: number): Set<Frame> {
  const seen = new Set<Frame>();
  for (let x = 0; x < ms; x += 10) seen.add(frameAt(look, { state, t: x, now: from + x, talk }));
  return seen;
}
const ALL_STATES: AssistantState[] = ["idle", "greeting", "listening", "thinking", "talking", "angry", "happy", "sleepy", "dragged"];

describe("frameAt (maid)", () => {
  test("idle breathes through its three frames and blinks with the half and closed frames", () => {
    const seen = framesOf("maid", "idle", 60_000);
    expect([...seen].sort() as string[]).toEqual(["blink-closed", "blink-half", "idle", "idle-in", "idle-out"]);
  });

  test("the blink frames follow the shared blink clock exactly", () => {
    for (let now = 1_000_000; now < 1_040_000; now += 7) {
      const lids = eyeLidsAt({ state: "listening", t: 0, now });
      const frame = frameAt("maid", { state: "listening", t: 0, now });
      if (lids === "half") expect(frame).toBe("blink-half");
      else if (lids === "closed") expect(frame).toBe("blink-closed");
      else expect(frame.startsWith("blink")).toBe(false);
    }
  });

  test("talking opens the mouth by the speech timeline", () => {
    expect(frameAt("maid", { state: "talking", t: 0, now: 0, talk: 0 })).toBe("idle");
    expect(frameAt("maid", { state: "talking", t: 0, now: 0, talk: 0.4 })).toBe("talk-small");
    expect(frameAt("maid", { state: "talking", t: 0, now: 0, talk: 1 })).toBe("talk-open");
  });

  test("talking without a timeline keeps a steady closed, small, open, small beat", () => {
    expect([...framesOf("maid", "talking", 2000)].sort() as string[]).toEqual(["idle", "talk-open", "talk-small"]);
  });
});

describe("frameAt (every look)", () => {
  test("every look the settings offer is drawn as frames", () => {
    expect([...FRAME_LOOKS].sort()).toEqual([...ASSISTANT_LOOKS].sort());
  });

  test("Leo has the full set, like the maid: a half-shut blink and mouth shapes", () => {
    expect(frameAt("leo", { state: "talking", t: 0, now: 0, talk: 1 })).toBe("talk-open");
    expect([...framesOf("leo", "idle", 60_000)].sort() as string[]).toEqual(["blink-closed", "blink-half", "idle", "idle-in", "idle-out"]);
  });

  test("each reaction plays all four of its own frames", () => {
    const cases: [AssistantState, string][] = [["happy", "happy"], ["greeting", "happy"], ["sleepy", "sleepy"], ["angry", "angry"], ["dragged", "dragged"]];
    for (const look of FRAME_LOOKS) for (const [state, set] of cases) {
      expect([...framesOf(look, state, 5000)].sort() as string[]).toEqual([0, 1, 2, 3].map(i => `${set}-${i}`));
    }
  });

  test("a look only ever shows frames it has", () => {
    for (const look of FRAME_LOOKS) for (const state of ALL_STATES) {
      for (const f of framesOf(look, state, 8000)) expect(LOOK_FRAMES[look]).toContain(f);
    }
  });

  test("Ice Bear, without a half-shut or a talking frame, blinks shut and keeps breathing while she talks", () => {
    expect(LOOK_FRAMES["ice-bear"]).not.toContain("blink-half");
    for (let now = 2_000_000; now < 2_040_000; now += 7) {
      const lids = eyeLidsAt({ state: "idle", t: 0, now });
      const frame = frameAt("ice-bear", { state: "idle", t: 0, now });
      if (lids !== "open") expect(frame).toBe("blink-closed");
    }
    expect([...framesOf("ice-bear", "talking", 3000, 0, 1)].sort() as string[]).toEqual(["idle", "idle-in", "idle-out"]);
  });
});

describe("frameLayout", () => {
  test("fits the standing body in the assistant's box: feet on the bottom, centred, as large as fits", () => {
    for (const look of FRAME_LOOKS) {
      const { body } = LOOK_ART[look];
      const box = { width: 80, height: 112 };
      const { left, top, width, height } = frameLayout(look, box.width, box.height);
      const k = width / LOOK_ART[look].width;
      expect(height / LOOK_ART[look].height).toBeCloseTo(k, 6);
      expect(top + body.bottom * k).toBeCloseTo(box.height, 6);
      expect(left + ((body.left + body.right) / 2) * k).toBeCloseTo(box.width / 2, 6);
      const bodyW = (body.right - body.left) * k;
      const bodyH = (body.bottom - body.top) * k;
      expect(bodyW).toBeLessThanOrEqual(box.width + 1e-6);
      expect(bodyH).toBeLessThanOrEqual(box.height + 1e-6);
      expect(Math.max(bodyW / box.width, bodyH / box.height)).toBeCloseTo(1, 6);
    }
  });
});

describe("frame files", () => {
  test("constants/assistant-frames.ts requires one existing picture per frame of each look", () => {
    const root = join(import.meta.dir, "..");
    const table = readFileSync(join(root, "constants", "assistant-frames.ts"), "utf8");
    for (const look of FRAME_LOOKS) for (const frame of LOOK_FRAMES[look]) {
      const path = `assets/assistant/${look}/${frame}.webp`;
      expect(table).toContain(`"${frame}": require("../${path}")`);
      expect(existsSync(join(root, path))).toBe(true);
    }
  });
});
