import { describe, expect, test } from "bun:test";
import { MIN_EVENT_PX, makeTimelineConfig, eventGeometry } from "./timeline-config";
import {
  COMPACT_MAX_HEIGHT, CONFLICT_MARK_PX, FULL_MIN_HEIGHT, MIN_ICON_BLOCK_WIDTH, MIN_TITLE_PX, compactMeta, eventDensity, showCompactIcon,
} from "./event-density";
import type { Task } from "./planner";

describe("eventDensity", () => {
  test("a single row below 46 px, two lines up to 63 px, the full layout from 64 px", () => {
    expect(eventDensity(MIN_EVENT_PX)).toBe("compact");
    expect(eventDensity(COMPACT_MAX_HEIGHT - 0.1)).toBe("compact");
    expect(eventDensity(COMPACT_MAX_HEIGHT)).toBe("medium");
    expect(eventDensity(FULL_MIN_HEIGHT - 0.1)).toBe("medium");
    expect(eventDensity(FULL_MIN_HEIGHT)).toBe("full");
    expect(eventDensity(300)).toBe("full");
  });

  test("every task of 30 minutes or less is a compact block at every timeline density", () => {
    for (const hourHeight of ["compact", "normal", "roomy"] as const) {
      const config = makeTimelineConfig({ dayStart: 6 * 60, dayEnd: 22 * 60, hourHeight });
      for (const duration of [5, 10, 15, 20, 25, 30]) {
        const task = { start: "09:00", duration } as Task;
        const { height } = eventGeometry(config, task);
        expect(eventDensity(height)).toBe("compact");
      }
    }
  });

  test("a task of an hour or more is never compact at the normal and roomy densities", () => {
    for (const hourHeight of ["normal", "roomy"] as const) {
      const config = makeTimelineConfig({ dayStart: 6 * 60, dayEnd: 22 * 60, hourHeight });
      const { height } = eventGeometry(config, { start: "09:00", duration: 60 } as Task);
      expect(eventDensity(height)).not.toBe("compact");
    }
  });
});

describe("compactMeta", () => {
  const variants = ["09:00 · 30 min", "09:00"];

  test("the richest variant that leaves the title its minimum width", () => {
    expect(compactMeta(300, variants)).toBe("09:00 · 30 min");
  });

  test("falls back to the shorter variant when the block is narrower", () => {
    expect(compactMeta(150, variants)).toBe("09:00");
  });

  test("shows nothing when even the shortest variant would squeeze the title", () => {
    expect(compactMeta(100, variants)).toBeNull();
    expect(compactMeta(0, variants)).toBeNull();
  });

  test("a block of about 113 dp (two lanes) still shows the start time, unless the overlap mark takes the room", () => {
    expect(compactMeta(113, variants)).toBe("09:00");
    expect(compactMeta(113, variants, CONFLICT_MARK_PX)).toBeNull();
    expect(compactMeta(135, variants, CONFLICT_MARK_PX)).toBe("09:00");
  });

  test("the title width is protected: a variant is used only while at least MIN_TITLE_PX is left", () => {
    const width = 16 + MIN_TITLE_PX + 8 + "09:00".length * 5.8;
    expect(compactMeta(width, ["09:00"])).toBe("09:00");
    expect(compactMeta(width - 1, ["09:00"])).toBeNull();
  });

  test("ignores empty variants and an empty list", () => {
    expect(compactMeta(300, ["", "09:00"])).toBe("09:00");
    expect(compactMeta(300, [])).toBeNull();
  });
});

describe("showCompactIcon", () => {
  test("the category icon needs a block of at least 120 px", () => {
    expect(showCompactIcon(MIN_ICON_BLOCK_WIDTH)).toBe(true);
    expect(showCompactIcon(MIN_ICON_BLOCK_WIDTH - 1)).toBe(false);
  });
});
