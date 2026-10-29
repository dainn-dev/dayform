import { describe, test, expect } from "bun:test";
import {
  addDays,
  dateKey,
  durationLabel,
  fromKey,
  minutes,
  mondayOf,
  overlaps,
  seedTasks,
  timeLabel,
  type Task,
} from "./planner";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    date: "2026-10-26",
    start: "09:00",
    duration: 60,
    status: "todo",
    category: "Work",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("dateKey / fromKey", () => {
  test("round-trips a normal date", () => {
    expect(dateKey(fromKey("2026-10-29"))).toBe("2026-10-29");
  });

  test("zero-pads single-digit month and day", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKey(fromKey("2026-03-07"))).toBe("2026-03-07");
  });

  test("fromKey builds a local date at noon", () => {
    const d = fromKey("2026-10-29");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(29);
    expect(d.getHours()).toBe(12);
  });

  test("round-trips the leap day 2028-02-29", () => {
    expect(dateKey(fromKey("2028-02-29"))).toBe("2028-02-29");
  });

  test("Dec 31 plus one day rolls to Jan 1 of the next year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("addDays", () => {
  test("adding zero days returns the same key", () => {
    expect(addDays("2026-10-29", 0)).toBe("2026-10-29");
  });

  test("crosses a month boundary forward", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  test("crosses a month boundary backward", () => {
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  test("crosses a year boundary backward", () => {
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  test("handles leap day forward and non-leap February", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  test("supports large negative offsets", () => {
    expect(addDays("2026-03-01", -365)).toBe("2025-03-01");
  });

  test("adding 7 days moves exactly one week", () => {
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02");
  });
});

describe("mondayOf", () => {
  test("a Monday returns itself", () => {
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
  });

  test("a Sunday returns the previous Monday (weeks start Monday)", () => {
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  test("a mid-week Thursday returns that week's Monday", () => {
    expect(mondayOf("2026-10-29")).toBe("2026-10-26");
  });

  test("a Saturday returns that week's Monday", () => {
    expect(mondayOf("2026-10-31")).toBe("2026-10-26");
  });

  test("crosses a month boundary backward", () => {
    // Wed 2026-04-01 -> Mon 2026-03-30
    expect(mondayOf("2026-04-01")).toBe("2026-03-30");
  });

  test("crosses a year boundary backward", () => {
    // Wed 2025-01-01 -> Mon 2024-12-30
    expect(mondayOf("2025-01-01")).toBe("2024-12-30");
  });

  test("leap day Tuesday returns Monday 2028-02-28", () => {
    expect(mondayOf("2028-02-29")).toBe("2028-02-28");
  });
});

describe("minutes", () => {
  test("converts 09:30 to 570", () => {
    expect(minutes("09:30")).toBe(570);
  });

  test("converts midnight to 0", () => {
    expect(minutes("00:00")).toBe(0);
  });

  test("converts 23:59 to 1439", () => {
    expect(minutes("23:59")).toBe(1439);
  });
});

describe("overlaps", () => {
  test("is true for partial overlap", () => {
    const a = makeTask({ id: "a", start: "09:00", duration: 60 });
    const b = makeTask({ id: "b", start: "09:30", duration: 60 });
    expect(overlaps(a, b)).toBe(true);
  });

  test("is true when one task contains the other", () => {
    const outer = makeTask({ id: "a", start: "09:00", duration: 120 });
    const inner = makeTask({ id: "b", start: "09:30", duration: 30 });
    expect(overlaps(outer, inner)).toBe(true);
  });

  test("is symmetric for overlapping tasks", () => {
    const a = makeTask({ id: "a", start: "09:00", duration: 60 });
    const b = makeTask({ id: "b", start: "09:30", duration: 60 });
    const outer = makeTask({ id: "c", start: "09:00", duration: 120 });
    const inner = makeTask({ id: "d", start: "09:30", duration: 30 });
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
    expect(overlaps(outer, inner)).toBe(true);
    expect(overlaps(inner, outer)).toBe(true);
  });

  test("is true for identical time slots with different ids", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    expect(overlaps(a, b)).toBe(true);
  });

  test("is false for back-to-back tasks (a ends exactly when b starts)", () => {
    const a = makeTask({ id: "a", start: "09:00", duration: 60 });
    const b = makeTask({ id: "b", start: "10:00", duration: 30 });
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  test("is false for clearly separated tasks", () => {
    const a = makeTask({ id: "a", start: "09:00", duration: 30 });
    const b = makeTask({ id: "b", start: "14:00", duration: 30 });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false for different dates at the same time", () => {
    const a = makeTask({ id: "a", date: "2026-10-26" });
    const b = makeTask({ id: "b", date: "2026-10-27" });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false when a has no start", () => {
    const a = makeTask({ id: "a", start: null });
    const b = makeTask({ id: "b" });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false when b has no start", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b", start: null });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false when a has no date", () => {
    const a = makeTask({ id: "a", date: null });
    const b = makeTask({ id: "b" });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false when b has no date", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b", date: null });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false when both are unscheduled backlog tasks", () => {
    const a = makeTask({ id: "a", date: null, start: null });
    const b = makeTask({ id: "b", date: null, start: null });
    expect(overlaps(a, b)).toBe(false);
  });

  test("is false when comparing a task with itself (same id)", () => {
    const a = makeTask({ id: "same" });
    const b = makeTask({ id: "same", start: "09:15" });
    expect(overlaps(a, b)).toBe(false);
  });
});

describe("timeLabel", () => {
  test("formats midnight hour as 12:xx AM", () => {
    expect(timeLabel("00:00")).toBe("12:00 AM");
    expect(timeLabel("00:05")).toBe("12:05 AM");
  });

  test("formats morning times without a leading zero", () => {
    expect(timeLabel("09:30")).toBe("9:30 AM");
    expect(timeLabel("11:59")).toBe("11:59 AM");
  });

  test("formats noon hour as 12:xx PM", () => {
    expect(timeLabel("12:00")).toBe("12:00 PM");
    expect(timeLabel("12:45")).toBe("12:45 PM");
  });

  test("formats afternoon and evening times in 12-hour PM", () => {
    expect(timeLabel("13:15")).toBe("1:15 PM");
    expect(timeLabel("23:59")).toBe("11:59 PM");
  });
});

describe("durationLabel", () => {
  test("formats sub-hour durations in minutes", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(5)).toBe("5 min");
  });

  test("formats whole hours without minutes", () => {
    expect(durationLabel(60)).toBe("1 hr");
    expect(durationLabel(120)).toBe("2 hr");
  });

  test("formats hours plus minutes", () => {
    expect(durationLabel(90)).toBe("1 hr 30 min");
    expect(durationLabel(135)).toBe("2 hr 15 min");
  });

  test("formats zero as 0 min", () => {
    expect(durationLabel(0)).toBe("0 min");
  });
});

describe("seedTasks", () => {
  test("returns 7 tasks", () => {
    expect(seedTasks()).toHaveLength(7);
  });

  test("assigns unique ids", () => {
    const ids = seedTasks().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("scheduled tasks have today's date and a non-null start", () => {
    const today = dateKey(new Date());
    const scheduled = seedTasks().filter((t) => t.start !== null);
    expect(scheduled).toHaveLength(5);
    for (const t of scheduled) {
      expect(t.date).toBe(today);
      expect(t.start).not.toBeNull();
    }
  });

  test("backlog tasks have null date and null start", () => {
    const backlog = seedTasks().filter((t) => t.date === null);
    expect(backlog).toHaveLength(2);
    for (const t of backlog) {
      expect(t.date).toBeNull();
      expect(t.start).toBeNull();
    }
  });

  test("scheduled seed tasks do not overlap each other", () => {
    const tasks = seedTasks();
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        expect(overlaps(tasks[i], tasks[j])).toBe(false);
      }
    }
  });

  test("every task has a valid ISO createdAt and empty notes", () => {
    for (const t of seedTasks()) {
      expect(new Date(t.createdAt).toISOString()).toBe(t.createdAt);
      expect(t.notes).toBe("");
    }
  });
});
