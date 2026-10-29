import { describe, test, expect } from "bun:test";
import {
  LONG_PRESS_MS,
  MIN_DURATION_MINUTES,
  SNAP_MINUTES,
  dragReducer,
  formatMinutes,
  handleHitTop,
  moveBlock,
  previewBlock,
  pxToMinutes,
  resizeBlock,
  shiftStart,
  snapMinutes,
  toTaskPatch,
  type DragState,
} from "./timeline-gestures";

const SCALE = 1.07;
const STEP_PX = 15 * SCALE; // 16.05px == 15 minutes
const WIN_START = 360;
const WIN_END = 1320;

describe("constants", () => {
  test("expose the agreed values", () => {
    expect(SNAP_MINUTES).toBe(15);
    expect(MIN_DURATION_MINUTES).toBe(15);
    expect(LONG_PRESS_MS).toBe(350);
  });
});

describe("pxToMinutes", () => {
  test("divides pixels by scale", () => {
    expect(pxToMinutes(107, 1.07)).toBeCloseTo(100, 10);
    expect(pxToMinutes(0, 1.07)).toBe(0);
    expect(pxToMinutes(-10.7, 1.07)).toBeCloseTo(-10, 10);
  });
});

describe("snapMinutes", () => {
  test("rounds to nearest step", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
  });
  test("rounds negatives symmetrically", () => {
    expect(snapMinutes(-7)).toBe(0);
    expect(snapMinutes(-8)).toBe(-15);
    expect(snapMinutes(-22)).toBe(-15);
    expect(snapMinutes(-23)).toBe(-30);
    expect(snapMinutes(-7.5)).toBe(-15);
    expect(snapMinutes(7.5)).toBe(15);
  });
  test("never returns negative zero", () => {
    expect(Object.is(snapMinutes(-3), 0)).toBe(true);
  });
  test("supports custom step", () => {
    expect(snapMinutes(47, 30)).toBe(60);
    expect(snapMinutes(44, 30)).toBe(30);
  });
});

describe("formatMinutes", () => {
  test("zero-pads", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(65)).toBe("01:05");
    expect(formatMinutes(540)).toBe("09:00");
    expect(formatMinutes(1439)).toBe("23:59");
  });
  test("rejects out-of-range or non-integer values", () => {
    expect(() => formatMinutes(-1)).toThrow(RangeError);
    expect(() => formatMinutes(1440)).toThrow(RangeError);
    expect(() => formatMinutes(Number.NaN)).toThrow(RangeError);
    expect(() => formatMinutes(10.5)).toThrow(RangeError);
  });
});

describe("moveBlock", () => {
  const base = { start: 540, duration: 60, scale: SCALE };

  test("moves by snapped delta", () => {
    expect(moveBlock({ ...base, deltaPx: STEP_PX * 2 })).toEqual({ start: 570, duration: 60 });
    expect(moveBlock({ ...base, deltaPx: -STEP_PX })).toEqual({ start: 525, duration: 60 });
  });
  test("snaps to the nearest 15 minutes", () => {
    // 6 min -> 540+6 = 546 -> 540 ; 9 min -> 549 -> 555
    expect(moveBlock({ ...base, deltaPx: 6 * SCALE }).start).toBe(540);
    expect(moveBlock({ ...base, deltaPx: 9 * SCALE }).start).toBe(555);
    expect(moveBlock({ ...base, deltaPx: -9 * SCALE }).start).toBe(525);
  });
  test("zero delta is a no-op", () => {
    expect(moveBlock({ ...base, deltaPx: 0 })).toEqual({ start: 540, duration: 60 });
  });
  test("clamps at window start", () => {
    expect(moveBlock({ ...base, deltaPx: -10_000 }).start).toBe(WIN_START);
  });
  test("clamps so the block ends at window end", () => {
    expect(moveBlock({ ...base, deltaPx: 10_000 })).toEqual({ start: WIN_END - 60, duration: 60 });
  });
  test("a task longer than the window cannot move later but can move earlier down to the window start", () => {
    expect(moveBlock({ start: 400, duration: 1200, deltaPx: 300, scale: SCALE })).toEqual({ start: 400, duration: 1200 });
    expect(moveBlock({ start: 400, duration: 1200, deltaPx: -300, scale: SCALE }).start).toBe(WIN_START);
  });
  describe("a block that overhangs the window end", () => {
    const overhang = { start: 1260, duration: 120, scale: SCALE }; // 21:00-23:00
    test("a zero-distance move changes nothing", () => {
      expect(moveBlock({ ...overhang, deltaPx: 0 })).toEqual({ start: 1260, duration: 120 });
    });
    test("cannot be pushed later, however far the drag", () => {
      expect(moveBlock({ ...overhang, deltaPx: STEP_PX * 4 })).toEqual({ start: 1260, duration: 120 });
      expect(moveBlock({ ...overhang, deltaPx: 10_000 }).start).toBe(1260);
    });
    test("can still move earlier", () => {
      expect(moveBlock({ ...overhang, deltaPx: -STEP_PX }).start).toBe(1245);
    });
  });
  test("a sub-step drag keeps an off-grid start untouched", () => {
    expect(moveBlock({ start: 547, duration: 60, deltaPx: 0, scale: SCALE }).start).toBe(547);
    expect(moveBlock({ start: 547, duration: 60, deltaPx: 6 * SCALE, scale: SCALE }).start).toBe(547);
  });
  test("an off-grid start moves by the snapped distance", () => {
    expect(moveBlock({ start: 547, duration: 60, deltaPx: STEP_PX, scale: SCALE }).start).toBe(562);
  });
  test("a block that starts before the window is not pulled into it by a zero move", () => {
    expect(moveBlock({ start: 300, duration: 60, deltaPx: 0, scale: SCALE }).start).toBe(300);
    expect(moveBlock({ start: 300, duration: 60, deltaPx: -STEP_PX, scale: SCALE }).start).toBe(300);
  });
  test("a task exactly as long as the window is pinned", () => {
    expect(moveBlock({ start: 360, duration: 960, deltaPx: 50, scale: SCALE }).start).toBe(360);
  });
  test("never crosses midnight even with a window beyond 24:00", () => {
    const r = moveBlock({ ...base, deltaPx: 100_000, windowStart: 0, windowEnd: 5000 });
    expect(r.start + r.duration).toBeLessThanOrEqual(1440);
    expect(r.start).toBe(1380);
  });
  test("honours custom window", () => {
    const r = moveBlock({ ...base, deltaPx: 10_000, windowStart: 0, windowEnd: 1440 });
    expect(r.start).toBe(1380);
  });
  test("does not mutate its input", () => {
    const input = Object.freeze({ ...base, deltaPx: 40 });
    const copy = { ...input };
    moveBlock(input);
    expect(input).toEqual(copy);
  });
});

describe("resizeBlock", () => {
  const base = { start: 540, duration: 60, scale: SCALE };

  test("bottom edge changes the end only", () => {
    expect(resizeBlock({ ...base, deltaPx: STEP_PX * 2, edge: "bottom" })).toEqual({ start: 540, duration: 90 });
    expect(resizeBlock({ ...base, deltaPx: -STEP_PX, edge: "bottom" })).toEqual({ start: 540, duration: 45 });
  });
  test("top edge changes the start and keeps the end fixed", () => {
    expect(resizeBlock({ ...base, deltaPx: -STEP_PX * 2, edge: "top" })).toEqual({ start: 510, duration: 90 });
    expect(resizeBlock({ ...base, deltaPx: STEP_PX, edge: "top" })).toEqual({ start: 555, duration: 45 });
  });
  test("bottom edge enforces the minimum duration", () => {
    const r = resizeBlock({ ...base, deltaPx: -10_000, edge: "bottom" });
    expect(r).toEqual({ start: 540, duration: MIN_DURATION_MINUTES });
  });
  test("top edge enforces the minimum duration and keeps the end", () => {
    const r = resizeBlock({ ...base, deltaPx: 10_000, edge: "top" });
    expect(r).toEqual({ start: 600 - MIN_DURATION_MINUTES, duration: MIN_DURATION_MINUTES });
  });
  test("bottom edge cannot pass the window end", () => {
    const r = resizeBlock({ ...base, deltaPx: 10_000, edge: "bottom" });
    expect(r.start + r.duration).toBe(WIN_END);
    expect(r.start).toBe(540);
  });
  test("top edge cannot pass the window start", () => {
    const r = resizeBlock({ ...base, deltaPx: -10_000, edge: "top" });
    expect(r.start).toBe(WIN_START);
    expect(r.start + r.duration).toBe(600);
  });
  test("bottom edge never crosses midnight with a window beyond 24:00", () => {
    const r = resizeBlock({ ...base, deltaPx: 100_000, edge: "bottom", windowStart: 0, windowEnd: 3000 });
    expect(r.start + r.duration).toBe(1440);
  });
  test("honours the custom window", () => {
    const r = resizeBlock({ ...base, deltaPx: 100_000, edge: "bottom", windowStart: 0, windowEnd: 700 });
    expect(r.start + r.duration).toBe(700);
  });
  test("the window end wins over the minimum duration for a block at the window end", () => {
    const r = resizeBlock({ start: 1310, duration: 10, deltaPx: 0, scale: SCALE, edge: "bottom" });
    expect(r).toEqual({ start: 1310, duration: 10 });
    const shrunk = resizeBlock({ start: 1300, duration: 20, deltaPx: -10_000, scale: SCALE, edge: "bottom" });
    expect(shrunk).toEqual({ start: 1300, duration: MIN_DURATION_MINUTES });
  });
  test("a block that starts before the window is left alone by a top-edge drag", () => {
    const r = resizeBlock({ start: 355, duration: 10, deltaPx: 10_000, scale: SCALE, edge: "top" });
    expect(r).toEqual({ start: 355, duration: 10 });
  });
  test("a block outside the window is returned unchanged", () => {
    expect(resizeBlock({ start: 1320, duration: 30, deltaPx: 50, scale: SCALE, edge: "bottom" })).toEqual({ start: 1320, duration: 30 });
    expect(resizeBlock({ start: 300, duration: 30, deltaPx: 50, scale: SCALE, edge: "top" })).toEqual({ start: 300, duration: 30 });
  });
  describe("a block shorter than the minimum duration", () => {
    const short = { start: 600, duration: 10, scale: SCALE };
    test("a zero-distance drag does not grow it", () => {
      expect(resizeBlock({ ...short, deltaPx: 0, edge: "top" })).toEqual({ start: 600, duration: 10 });
      expect(resizeBlock({ ...short, deltaPx: 0, edge: "bottom" })).toEqual({ start: 600, duration: 10 });
    });
    test("dragging an edge inwards does not grow it either", () => {
      expect(resizeBlock({ ...short, deltaPx: STEP_PX, edge: "top" })).toEqual({ start: 600, duration: 10 });
      expect(resizeBlock({ ...short, deltaPx: -STEP_PX, edge: "bottom" })).toEqual({ start: 600, duration: 10 });
    });
    test("dragging an edge outwards still grows it", () => {
      expect(resizeBlock({ ...short, deltaPx: -STEP_PX, edge: "top" })).toEqual({ start: 585, duration: 25 });
      expect(resizeBlock({ ...short, deltaPx: STEP_PX, edge: "bottom" })).toEqual({ start: 600, duration: 25 });
    });
  });
  describe("a block that overhangs the window end", () => {
    const overhang = { start: 1260, duration: 120, scale: SCALE, edge: "bottom" as const }; // 21:00-23:00
    test("a zero-distance bottom drag changes nothing", () => {
      expect(resizeBlock({ ...overhang, deltaPx: 0 })).toEqual({ start: 1260, duration: 120 });
    });
    test("the bottom edge cannot be pulled past where it already is", () => {
      expect(resizeBlock({ ...overhang, deltaPx: 10_000 })).toEqual({ start: 1260, duration: 120 });
    });
    test("the bottom edge can still be shortened", () => {
      expect(resizeBlock({ ...overhang, deltaPx: -STEP_PX * 4 })).toEqual({ start: 1260, duration: 60 });
    });
    test("the top edge works as for any other block", () => {
      expect(resizeBlock({ ...overhang, deltaPx: -STEP_PX, edge: "top" })).toEqual({ start: 1245, duration: 135 });
    });
  });
  test("an off-grid block resizes by the snapped distance", () => {
    expect(resizeBlock({ start: 547, duration: 63, deltaPx: STEP_PX, scale: SCALE, edge: "bottom" })).toEqual({ start: 547, duration: 78 });
    expect(resizeBlock({ start: 547, duration: 63, deltaPx: 3, scale: SCALE, edge: "bottom" })).toEqual({ start: 547, duration: 63 });
  });
  test("does not mutate its input", () => {
    const input = Object.freeze({ ...base, deltaPx: 40, edge: "top" as const });
    const copy = { ...input };
    resizeBlock(input);
    expect(input).toEqual(copy);
  });
});

describe("toTaskPatch", () => {
  test("converts minutes to HH:mm and keeps duration", () => {
    expect(toTaskPatch({ start: 545 + 10, duration: 45 })).toEqual({ start: "09:15", duration: 45 });
    expect(toTaskPatch({ start: 360, duration: 15 })).toEqual({ start: "06:00", duration: 15 });
  });
});

describe("shiftStart", () => {
  test("shifts by the delta", () => {
    expect(shiftStart("09:00", 60, -15, WIN_START, WIN_END)).toBe("08:45");
    expect(shiftStart("09:00", 60, 15, WIN_START, WIN_END)).toBe("09:15");
  });
  test("clamps at the window start", () => {
    expect(shiftStart("06:00", 60, -15, WIN_START, WIN_END)).toBe("06:00");
    expect(shiftStart("06:10", 60, -15, WIN_START, WIN_END)).toBe("06:00");
  });
  test("clamps so the task ends at the window end", () => {
    expect(shiftStart("21:00", 60, 15, WIN_START, WIN_END)).toBe("21:00");
    expect(shiftStart("20:50", 60, 30, WIN_START, WIN_END)).toBe("21:00");
  });
  test("a task longer than the window cannot move later but can move earlier", () => {
    expect(shiftStart("07:00", 1200, 15, WIN_START, WIN_END)).toBe("07:00");
    expect(shiftStart("07:00", 1200, -15, WIN_START, WIN_END)).toBe("06:45");
    expect(shiftStart("07:00", 1200, -100, WIN_START, WIN_END)).toBe("06:00");
  });
  test("a task that overhangs the window end is never moved earlier by 'later'", () => {
    expect(shiftStart("21:00", 120, 15, WIN_START, WIN_END)).toBe("21:00");
    expect(shiftStart("20:50", 120, 15, WIN_START, WIN_END)).toBe("20:50");
    expect(shiftStart("21:00", 120, -15, WIN_START, WIN_END)).toBe("20:45");
    expect(shiftStart("19:30", 120, 15, WIN_START, WIN_END)).toBe("19:45");
    expect(shiftStart("20:00", 120, 15, WIN_START, WIN_END)).toBe("20:00");
  });
  test("a task that starts before the window is not pulled into it by 'later'", () => {
    expect(shiftStart("05:00", 60, 15, WIN_START, WIN_END)).toBe("05:15");
    expect(shiftStart("05:00", 60, -15, WIN_START, WIN_END)).toBe("05:00");
  });
  test("never produces a time at or past midnight", () => {
    expect(shiftStart("23:00", 0, 120, 0, 1440)).toBe("23:59");
    expect(shiftStart("23:00", 30, 120, 0, 1440)).toBe("23:30");
  });
});

describe("previewBlock", () => {
  const block = { start: 540, duration: 60 };
  test("returns the block unchanged while idle or armed", () => {
    expect(previewBlock({ phase: "idle" }, block, SCALE)).toEqual(block);
    expect(previewBlock({ phase: "armed" }, block, SCALE)).toEqual(block);
  });
  test("applies move, resize-top and resize-bottom", () => {
    const d = STEP_PX * 2;
    expect(previewBlock({ phase: "dragging", mode: "move", deltaPx: d }, block, SCALE)).toEqual({ start: 570, duration: 60 });
    expect(previewBlock({ phase: "dragging", mode: "resize-top", deltaPx: -d }, block, SCALE)).toEqual({ start: 510, duration: 90 });
    expect(previewBlock({ phase: "dragging", mode: "resize-bottom", deltaPx: d }, block, SCALE)).toEqual({ start: 540, duration: 90 });
  });
  test("does not mutate the block or state", () => {
    const frozenBlock = Object.freeze({ ...block });
    const state: DragState = Object.freeze({ phase: "dragging", mode: "move", deltaPx: 30 });
    previewBlock(state, frozenBlock, SCALE);
    expect(frozenBlock).toEqual(block);
    expect(state).toEqual({ phase: "dragging", mode: "move", deltaPx: 30 });
  });
});

describe("dragReducer", () => {
  const block = { start: 540, duration: 60 };
  const idle: DragState = { phase: "idle" };
  const armed: DragState = { phase: "armed" };
  const dragging = (deltaPx: number, mode: "move" | "resize-top" | "resize-bottom" = "move"): DragState => ({
    phase: "dragging",
    mode,
    deltaPx,
  });

  test("LONG_PRESS arms from idle", () => {
    expect(dragReducer(idle, { type: "LONG_PRESS" }, block, SCALE)).toEqual({ state: armed, commit: null });
  });
  test("LONG_PRESS is ignored once armed or dragging", () => {
    expect(dragReducer(armed, { type: "LONG_PRESS" }, block, SCALE).state).toEqual(armed);
    const d = dragging(20);
    expect(dragReducer(d, { type: "LONG_PRESS" }, block, SCALE).state).toEqual(d);
  });
  test("MOVE while idle does nothing", () => {
    expect(dragReducer(idle, { type: "MOVE", dy: 50 }, block, SCALE)).toEqual({ state: idle, commit: null });
  });
  test("MOVE while armed starts a move drag by default", () => {
    const r = dragReducer(armed, { type: "MOVE", dy: 12 }, block, SCALE);
    expect(r).toEqual({ state: dragging(12, "move"), commit: null });
  });
  test("MOVE while armed can start a resize", () => {
    const r = dragReducer(armed, { type: "MOVE", dy: 12, mode: "resize-bottom" }, block, SCALE);
    expect(r.state).toEqual(dragging(12, "resize-bottom"));
  });
  test("MOVE while dragging updates delta and keeps the mode", () => {
    const r = dragReducer(dragging(10, "resize-top"), { type: "MOVE", dy: 33, mode: "move" }, block, SCALE);
    expect(r).toEqual({ state: dragging(33, "resize-top"), commit: null });
  });
  test("RELEASE while dragging commits the snapped result and goes idle", () => {
    const r = dragReducer(dragging(STEP_PX * 2), { type: "RELEASE" }, block, SCALE);
    expect(r).toEqual({ state: idle, commit: { start: 570, duration: 60 } });
  });
  test("RELEASE commits resize results", () => {
    const r = dragReducer(dragging(STEP_PX, "resize-bottom"), { type: "RELEASE" }, block, SCALE);
    expect(r.commit).toEqual({ start: 540, duration: 75 });
  });
  test("RELEASE with a sub-step drag is a no-change release (commit null)", () => {
    const r = dragReducer(dragging(3), { type: "RELEASE" }, block, SCALE);
    expect(r).toEqual({ state: idle, commit: null });
  });
  test("RELEASE that clamps back to the original is a no-change release", () => {
    const atStart = { start: WIN_START, duration: 60 };
    const r = dragReducer(dragging(-500), { type: "RELEASE" }, atStart, SCALE);
    expect(r).toEqual({ state: idle, commit: null });
  });
  test("RELEASE while armed or idle returns idle without a commit", () => {
    expect(dragReducer(armed, { type: "RELEASE" }, block, SCALE)).toEqual({ state: idle, commit: null });
    expect(dragReducer(idle, { type: "RELEASE" }, block, SCALE)).toEqual({ state: idle, commit: null });
  });
  test("CANCEL from any phase returns idle without a commit", () => {
    for (const s of [idle, armed, dragging(STEP_PX * 3)]) {
      expect(dragReducer(s, { type: "CANCEL" }, block, SCALE)).toEqual({ state: idle, commit: null });
    }
  });
  test("a full gesture sequence", () => {
    let s: DragState = idle;
    s = dragReducer(s, { type: "LONG_PRESS" }, block, SCALE).state;
    s = dragReducer(s, { type: "MOVE", dy: STEP_PX }, block, SCALE).state;
    s = dragReducer(s, { type: "MOVE", dy: -STEP_PX }, block, SCALE).state;
    expect(previewBlock(s, block, SCALE)).toEqual({ start: 525, duration: 60 });
    const end = dragReducer(s, { type: "RELEASE" }, block, SCALE);
    expect(end.commit).toEqual({ start: 525, duration: 60 });
    expect(end.state).toEqual(idle);
  });
  test("does not mutate state, event or block", () => {
    const state = Object.freeze(dragging(20));
    const event = Object.freeze({ type: "MOVE" as const, dy: 40 });
    const frozenBlock = Object.freeze({ ...block });
    dragReducer(state, event, frozenBlock, SCALE);
    expect(state).toEqual(dragging(20));
    expect(frozenBlock).toEqual(block);
  });
});

describe("handleHitTop", () => {
  const HIT = 28;
  const OUT = 10;
  const HEIGHT = 1043;
  test("puts the block edge 10px into the area of a top handle and 18px into a bottom one", () => {
    expect(handleHitTop("top", 200, HIT, OUT, HEIGHT)).toBe(190);
    expect(handleHitTop("bottom", 200, HIT, OUT, HEIGHT)).toBe(182);
  });
  test("a top handle on the first row stays inside the container", () => {
    expect(handleHitTop("top", 0, HIT, OUT, HEIGHT)).toBe(0);
  });
  test("a bottom handle at the end of the window stays inside the container", () => {
    expect(handleHitTop("bottom", 1040, HIT, OUT, HEIGHT)).toBe(HEIGHT - HIT);
    expect(handleHitTop("bottom", 1064, HIT, OUT, HEIGHT)).toBe(HEIGHT - HIT);
  });
  test("a container smaller than the area pins it to the top", () => {
    expect(handleHitTop("bottom", 10, HIT, OUT, 20)).toBe(0);
  });
});
