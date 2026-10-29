import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "./settings";
import type { Task } from "./planner";
import {
  eventGeometry,
  hourLabel,
  makeTimelineConfig,
  nowOffset,
  partitionVisible,
  slotTime,
  windowLabel,
  MIN_EVENT_PX,
} from "./timeline-config";

const calendar = (patch: Partial<typeof DEFAULT_SETTINGS.calendar> = {}) => ({ ...DEFAULT_SETTINGS.calendar, ...patch });
const normal = makeTimelineConfig(calendar());

function task(start: string, duration = 60): Task {
  return { id: `t-${start}`, title: "x", date: "2026-05-04", start, duration, status: "todo", category: "Focus", notes: "", createdAt: "" };
}

describe("makeTimelineConfig", () => {
  test("normal 06:00-22:00 reproduces the original hard-coded numbers", () => {
    expect(normal.startMin).toBe(360);
    expect(normal.endMin).toBe(1320);
    expect(normal.scale).toBe(1.07);
    expect(normal.firstHour).toBe(6);
    expect(normal.hours).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(normal.slotHours).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(normal.height).toBe((1320 - 360) * 1.07 + 16);
    expect(normal.minVisualMinutes).toBe(36);
    expect(normal.slotHeight).toBe(59 * 1.07);
  });

  test("hour height maps to px per minute", () => {
    expect(makeTimelineConfig(calendar({ hourHeight: "compact" })).scale).toBe(0.8);
    expect(makeTimelineConfig(calendar({ hourHeight: "normal" })).scale).toBe(1.07);
    expect(makeTimelineConfig(calendar({ hourHeight: "roomy" })).scale).toBe(1.4);
  });

  test("the minimum visual duration follows the scale so blocks keep their 38px minimum", () => {
    expect(makeTimelineConfig(calendar({ hourHeight: "compact" })).minVisualMinutes).toBe(48);
    expect(makeTimelineConfig(calendar({ hourHeight: "roomy" })).minVisualMinutes).toBe(28);
  });

  test("a custom window changes hours, height and first hour", () => {
    const c = makeTimelineConfig(calendar({ dayStart: 480, dayEnd: 1200, hourHeight: "roomy" }));
    expect(c.firstHour).toBe(8);
    expect(c.hours[0]).toBe(8);
    expect(c.hours[c.hours.length - 1]).toBe(20);
    expect(c.slotHours[c.slotHours.length - 1]).toBe(19);
    expect(c.height).toBeCloseTo(720 * 1.4 + 16);
  });

  test("a window ending at midnight has a 24 o'clock label hour", () => {
    const c = makeTimelineConfig(calendar({ dayStart: 0, dayEnd: 1440 }));
    expect(c.hours).toHaveLength(25);
    expect(c.hours[24]).toBe(24);
  });

  test("an invalid span falls back to the default window", () => {
    const c = makeTimelineConfig(calendar({ dayStart: 600, dayEnd: 700 }));
    expect(c.startMin).toBe(360);
    expect(c.endMin).toBe(1320);
  });

  test("an off-hour window falls back to the default window", () => {
    expect(makeTimelineConfig(calendar({ dayStart: 375, dayEnd: 1320 })).startMin).toBe(360);
  });

  test("the empty-state box stays inside short timelines and keeps its offset on tall ones", () => {
    expect(normal.emptyTop).toBe(65);
    const short = makeTimelineConfig(calendar({ dayStart: 600, dayEnd: 840, hourHeight: "compact" }));
    expect(short.emptyTop).toBeLessThan(65);
    expect(short.emptyTop).toBeGreaterThanOrEqual(8);
  });

  test("is pure: the same input gives equal output", () => {
    expect(makeTimelineConfig(calendar())).toEqual(normal);
  });
});

describe("partitionVisible", () => {
  test("splits by the configured window, end exclusive", () => {
    const tasks = [task("05:59"), task("06:00"), task("21:59"), task("22:00")];
    const { visible, outside } = partitionVisible(normal, tasks);
    expect(visible.map(t => t.start)).toEqual(["06:00", "21:59"]);
    expect(outside.map(t => t.start)).toEqual(["05:59", "22:00"]);
  });

  test("a task visible in one window is outside another", () => {
    const narrow = makeTimelineConfig(calendar({ dayStart: 480, dayEnd: 1020 }));
    const { visible, outside } = partitionVisible(narrow, [task("07:00"), task("09:00"), task("17:00")]);
    expect(visible.map(t => t.start)).toEqual(["09:00"]);
    expect(outside.map(t => t.start)).toEqual(["07:00", "17:00"]);
  });

  test("empty input and a window ending at midnight", () => {
    expect(partitionVisible(normal, [])).toEqual({ visible: [], outside: [] });
    const late = makeTimelineConfig(calendar({ dayStart: 0, dayEnd: 1440 }));
    expect(partitionVisible(late, [task("23:59")]).visible).toHaveLength(1);
  });
});

describe("eventGeometry", () => {
  test("matches the original formulas at normal scale", () => {
    expect(eventGeometry(normal, task("09:00", 60))).toEqual({ top: 180 * 1.07, height: 60 * 1.07 - 3 });
  });

  test("applies the minimum height", () => {
    expect(eventGeometry(normal, task("09:00", 15)).height).toBe(MIN_EVENT_PX);
  });

  test("the bottom is clamped to the window end", () => {
    const g = eventGeometry(normal, task("21:30", 120));
    expect(g.height).toBe(Math.max(MIN_EVENT_PX, 30 * 1.07 - 3));
  });

  test("scales with a different hour height and window", () => {
    const c = makeTimelineConfig(calendar({ dayStart: 480, dayEnd: 1080, hourHeight: "roomy" }));
    expect(eventGeometry(c, task("09:00", 60))).toEqual({ top: 60 * 1.4, height: 60 * 1.4 - 3 });
  });
});

describe("nowOffset", () => {
  const at = (h: number, m: number) => new Date(2026, 4, 4, h, m);
  test("is the offset inside the window, inclusive of both edges", () => {
    expect(nowOffset(normal, at(6, 0))).toBe(0);
    expect(nowOffset(normal, at(12, 30))).toBe(390 * 1.07);
    expect(nowOffset(normal, at(22, 0))).toBe(960 * 1.07);
  });
  test("is null outside the window", () => {
    expect(nowOffset(normal, at(5, 59))).toBeNull();
    expect(nowOffset(normal, at(22, 1))).toBeNull();
  });
  test("follows a custom window", () => {
    const c = makeTimelineConfig(calendar({ dayStart: 480, dayEnd: 1080 }));
    expect(nowOffset(c, at(7, 0))).toBeNull();
    expect(nowOffset(c, at(9, 0))).toBe(60 * 1.07);
  });
});

describe("hour labels", () => {
  test("24-hour labels are zero-padded HH:00", () => {
    expect(hourLabel(6, "24h")).toBe("06:00");
    expect(hourLabel(22, "24h")).toBe("22:00");
    expect(hourLabel(24, "24h")).toBe("24:00");
  });
  test("12-hour labels use AM/PM without minutes", () => {
    expect(hourLabel(0, "12h")).toBe("12 AM");
    expect(hourLabel(6, "12h")).toBe("6 AM");
    expect(hourLabel(12, "12h")).toBe("12 PM");
    expect(hourLabel(13, "12h")).toBe("1 PM");
    expect(hourLabel(22, "12h")).toBe("10 PM");
    expect(hourLabel(24, "12h")).toBe("12 AM");
  });
  test("slot times are always stored HH:mm", () => {
    expect(slotTime(6)).toBe("06:00");
    expect(slotTime(21)).toBe("21:00");
  });
  test("window label shows both ends in the chosen format", () => {
    expect(windowLabel(normal, "12h")).toBe("6 AM – 10 PM");
    expect(windowLabel(normal, "24h")).toBe("06:00 – 22:00");
  });
});
