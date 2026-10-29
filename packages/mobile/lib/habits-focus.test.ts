import { describe, expect, test } from "bun:test";
import { describeWindow, focusHours } from "./habits-focus";
import { addDays, dateKey, type Task } from "./planner";

const NOW = new Date(2026, 9, 29, 18, 0);
const TODAY = dateKey(NOW);

let counter = 0;
const done = (daysAgo: number, start: string | null, duration: number, extra: Partial<Task> = {}): Task => {
  counter += 1;
  return {
    id: `t${counter}`, title: `Task ${counter}`, date: start === null ? null : addDays(TODAY, -daysAgo), start, duration,
    status: "done", category: "Work", notes: "", createdAt: "2026-09-01T00:00:00.000Z", ...extra,
  };
};
const repeated = (count: number, start: string, duration: number, daysAgoFrom = 0) =>
  Array.from({ length: count }, (_, i) => done(daysAgoFrom + i, start, duration));

describe("focusHours", () => {
  test("finds the two-hour window with the largest share of completed minutes", () => {
    const history = [...repeated(18, "09:00", 60), ...repeated(6, "14:00", 30, 20)];
    const result = focusHours(history, NOW);
    expect(result?.startHour).toBe(9);
    expect(result?.endHour).toBe(11);
    expect(result?.sample).toBe(24);
    expect(result?.share).toBeCloseTo(1080 / (1080 + 180), 5);
  });

  test("splits a task across the hours it spans", () => {
    const history = repeated(20, "09:30", 60);
    const result = focusHours(history, NOW);
    expect(result).toEqual({ startHour: 9, endHour: 11, share: 1, sample: 20 });
  });

  test("a task that spans three hours is counted in the best window only for the overlap", () => {
    const history = [...repeated(20, "08:00", 150), ...repeated(5, "20:00", 60, 20)];
    const result = focusHours(history, NOW);
    expect(result?.startHour).toBe(8);
    expect(result?.endHour).toBe(10);
    expect(result?.share).toBeCloseTo(2400 / (3000 + 300), 5);
  });

  test("ties pick the earliest window", () => {
    const history = [...repeated(10, "08:00", 60), ...repeated(10, "16:00", 60, 10)];
    const result = focusHours(history, NOW);
    expect(result?.startHour).toBe(8);
    expect(result?.share).toBeCloseTo(0.5, 5);
  });

  test("handles the last hours of the day without running past midnight", () => {
    const history = repeated(20, "23:30", 120);
    const result = focusHours(history, NOW);
    expect(result).toEqual({ startHour: 22, endHour: 24, share: 1, sample: 20 });
  });

  test("requires at least 20 done tasks", () => {
    expect(focusHours(repeated(19, "09:00", 60), NOW)).toBeNull();
    expect(focusHours(repeated(20, "09:00", 60), NOW)).not.toBeNull();
  });

  test("requires the best window to hold at least 35 percent of the minutes", () => {
    const spread = Array.from({ length: 24 }, (_, i) => done(i, `${String(6 + (i % 12) * 1).padStart(2, "0")}:00`, 60));
    expect(focusHours(spread, NOW)).toBeNull();
  });

  test("only counts the last 56 days, never the future", () => {
    const old = repeated(25, "09:00", 60, 56);
    const future = Array.from({ length: 25 }, (_, i) => done(-(i + 1), "09:00", 60));
    expect(focusHours([...old, ...future], NOW)).toBeNull();
    const edge = [...repeated(10, "09:00", 60, 46), ...repeated(10, "09:00", 60, 46)];
    expect(focusHours(edge, NOW)?.sample).toBe(20);
  });

  test("ignores tasks that are not done, unscheduled, or have unusable data", () => {
    const history = [
      ...repeated(20, "09:00", 60),
      done(1, "13:00", 60, { status: "todo" }), done(1, "13:00", 60, { status: "in_progress" }),
      done(1, null, 600), done(2, "xx:yy", 600), done(2, "25:00", 60),done(2, "13:00", 0), done(2, "13:00", Number.NaN),
      done(3, "13:00", 60, { date: null }),
    ];
    expect(focusHours(history, NOW)).toEqual({ startHour: 9, endHour: 11, share: 1, sample: 20 });
  });

  test("returns null for an empty history", () => {
    expect(focusHours([], NOW)).toBeNull();
  });

  test("honours custom options", () => {
    const history = repeated(5, "09:00", 60);
    expect(focusHours(history, NOW)).toBeNull();
    expect(focusHours(history, NOW, { minSample: 5 })?.startHour).toBe(9);
    expect(focusHours(repeated(20, "09:00", 60, 10), NOW, { days: 7 })).toBeNull();
    const half = [...repeated(10, "09:00", 60), ...repeated(10, "15:00", 60, 10)];
    expect(focusHours(half, NOW, { minShare: 0.6 })).toBeNull();
  });

  test("works across month and year boundaries", () => {
    const now = new Date(2027, 0, 5, 12, 0);
    const history = Array.from({ length: 20 }, (_, i) => ({
      ...done(0, "10:00", 60), date: addDays("2027-01-05", -i),
    }));
    expect(focusHours(history, now)).toEqual({ startHour: 10, endHour: 12, share: 1, sample: 20 });
  });
});

describe("describeWindow", () => {
  test("returns numeric hours, HH:mm strings and a rounded percentage", () => {
    expect(describeWindow({ startHour: 9, endHour: 11, share: 0.4286, sample: 24 })).toEqual({
      startHour: 9, endHour: 11, from: "09:00", to: "11:00", sharePercent: 43, sample: 24,
    });
  });

  test("writes the end of the last window as midnight", () => {
    expect(describeWindow({ startHour: 22, endHour: 24, share: 1, sample: 30 })).toEqual({
      startHour: 22, endHour: 24, from: "22:00", to: "00:00", sharePercent: 100, sample: 30,
    });
  });
});
