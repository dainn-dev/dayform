import { describe, expect, test } from "bun:test";
import { computeStats, followToday, monthRange, shiftRange, weekRange } from "./stats";
import type { Task } from "./planner";

let counter = 0;
function task(patch: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `t${counter}`, title: `Task ${counter}`, date: null, start: null, duration: 30,
    status: "todo", category: "Focus", notes: "", createdAt: "2026-01-01T00:00:00.000Z", ...patch,
  };
}
const at = (date: string, duration: number, patch: Partial<Task> = {}) =>
  task({ date, start: "09:00", duration, ...patch });

describe("weekRange", () => {
  test("runs Monday to Sunday for a mid-week anchor", () => {
    expect(weekRange("2026-05-06")).toEqual({ from: "2026-05-04", to: "2026-05-10" });
  });
  test("a Monday anchors its own week and a Sunday belongs to the week before", () => {
    expect(weekRange("2026-05-04")).toEqual({ from: "2026-05-04", to: "2026-05-10" });
    expect(weekRange("2026-05-10")).toEqual({ from: "2026-05-04", to: "2026-05-10" });
  });
  test("crosses month and year boundaries", () => {
    expect(weekRange("2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });
});

describe("monthRange", () => {
  test("covers the 1st to the last day", () => {
    expect(monthRange("2026-05-17")).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(monthRange("2026-04-30")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });
  test("handles leap and non-leap February", () => {
    expect(monthRange("2028-02-10").to).toBe("2028-02-29");
    expect(monthRange("2026-02-10").to).toBe("2026-02-28");
    expect(monthRange("2100-02-10").to).toBe("2100-02-28");
    expect(monthRange("2000-02-10").to).toBe("2000-02-29");
  });
  test("handles December", () => {
    expect(monthRange("2026-12-05")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("shiftRange", () => {
  test("moves weeks by seven days per step", () => {
    expect(shiftRange("week", "2026-05-06", 1)).toEqual({ from: "2026-05-11", to: "2026-05-17" });
    expect(shiftRange("week", "2026-05-06", -1)).toEqual({ from: "2026-04-27", to: "2026-05-03" });
    expect(shiftRange("week", "2026-05-06", 0)).toEqual(weekRange("2026-05-06"));
  });
  test("moves months across year boundaries", () => {
    expect(shiftRange("month", "2026-12-15", 1)).toEqual({ from: "2027-01-01", to: "2027-01-31" });
    expect(shiftRange("month", "2026-01-31", -1)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(shiftRange("month", "2026-01-31", 1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftRange("month", "2026-03-31", 14)).toEqual({ from: "2027-05-01", to: "2027-05-31" });
  });
});

describe("computeStats totals", () => {
  const range = { from: "2026-05-04", to: "2026-05-10" };

  test("zero tasks yields zero-filled stats and a null rate", () => {
    const stats = computeStats([], range, "2026-05-06");
    expect(stats.scheduledCount).toBe(0);
    expect(stats.doneCount).toBe(0);
    expect(stats.completionRate).toBeNull();
    expect(stats.plannedMinutes).toBe(0);
    expect(stats.doneMinutes).toBe(0);
    expect(stats.busiestDay).toBeNull();
    expect(stats.streak).toBe(0);
    expect(stats.perDay).toHaveLength(7);
    expect(stats.perDay[0]).toEqual({ date: "2026-05-04", plannedMinutes: 0, doneMinutes: 0, scheduledCount: 0, doneCount: 0 });
    expect(stats.perCategory.Work).toEqual({ plannedMinutes: 0, doneMinutes: 0, count: 0 });
  });

  test("counts scheduled and done tasks, minutes and rate", () => {
    const stats = computeStats([
      at("2026-05-04", 60, { status: "done" }),
      at("2026-05-04", 30),
      at("2026-05-06", 45, { status: "in_progress" }),
      at("2026-05-10", 15, { status: "done" }),
    ], range, "2026-05-06");
    expect(stats.scheduledCount).toBe(4);
    expect(stats.doneCount).toBe(2);
    expect(stats.completionRate).toBe(0.5);
    expect(stats.plannedMinutes).toBe(150);
    expect(stats.doneMinutes).toBe(75);
  });

  test("ignores backlog tasks, tasks without a start and tasks outside the range", () => {
    const stats = computeStats([
      task({ status: "done" }),
      task({ date: "2026-05-05", start: null, status: "done" }),
      at("2026-05-03", 30, { status: "done" }),
      at("2026-05-11", 30),
      at("2026-05-05", 20),
    ], range, "2026-05-06");
    expect(stats.scheduledCount).toBe(1);
    expect(stats.doneCount).toBe(0);
    expect(stats.completionRate).toBe(0);
  });

  test("includes both range endpoints and treats series occurrences as normal tasks", () => {
    const stats = computeStats([
      at("2026-05-04", 30, { seriesId: "s1", id: "s1:2026-05-04", repeat: "daily" }),
      at("2026-05-10", 30, { seriesId: "s1", id: "s1:2026-05-10", repeat: "daily", status: "done" }),
    ], range, "2026-05-06");
    expect(stats.scheduledCount).toBe(2);
    expect(stats.doneCount).toBe(1);
  });

  test("spans a month boundary inside a week range", () => {
    const stats = computeStats([at("2026-12-31", 30), at("2027-01-01", 30, { status: "done" })],
      weekRange("2026-12-30"), "2027-01-01");
    expect(stats.perDay.map(d => d.date)).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(stats.scheduledCount).toBe(2);
  });

  test("an inverted range is empty", () => {
    const stats = computeStats([at("2026-05-05", 30)], { from: "2026-05-10", to: "2026-05-04" }, "2026-05-06");
    expect(stats.perDay).toEqual([]);
    expect(stats.scheduledCount).toBe(0);
  });
});

describe("computeStats breakdowns", () => {
  test("splits minutes and counts per category", () => {
    const stats = computeStats([
      at("2026-05-04", 60, { category: "Work", status: "done" }),
      at("2026-05-05", 30, { category: "Work" }),
      at("2026-05-05", 20, { category: "Wellness" }),
    ], { from: "2026-05-04", to: "2026-05-10" }, "2026-05-05");
    expect(stats.perCategory.Work).toEqual({ plannedMinutes: 90, doneMinutes: 60, count: 2 });
    expect(stats.perCategory.Wellness).toEqual({ plannedMinutes: 20, doneMinutes: 0, count: 1 });
    expect(stats.perCategory.Focus.count).toBe(0);
  });

  test("fills perDay for every date of a leap-February month", () => {
    const stats = computeStats([at("2028-02-29", 30, { status: "done" })], monthRange("2028-02-10"), "2028-03-01");
    expect(stats.perDay).toHaveLength(29);
    expect(stats.perDay[28]).toEqual({ date: "2028-02-29", plannedMinutes: 30, doneMinutes: 30, scheduledCount: 1, doneCount: 1 });
  });

  test("busiest day is the one with most planned minutes, earliest on a tie", () => {
    const range = { from: "2026-05-04", to: "2026-05-10" };
    const stats = computeStats([
      at("2026-05-05", 60), at("2026-05-07", 40), at("2026-05-07", 20), at("2026-05-08", 10),
    ], range, "2026-05-08");
    expect(stats.busiestDay).toBe("2026-05-05");
    const later = computeStats([at("2026-05-05", 30), at("2026-05-07", 90)], range, "2026-05-08");
    expect(later.busiestDay).toBe("2026-05-07");
  });

  test("zero-minute tasks still make a day busiest by task count", () => {
    const range = { from: "2026-05-04", to: "2026-05-10" };
    const stats = computeStats([at("2026-05-06", 0)], range, "2026-05-08");
    expect(stats.busiestDay).toBe("2026-05-06");
  });
});

describe("computeStats streak", () => {
  const range = { from: "2026-05-04", to: "2026-05-10" };
  const done = (date: string) => at(date, 30, { status: "done" });

  test("is 0 with nothing done", () => {
    expect(computeStats([at("2026-05-06", 30)], range, "2026-05-06").streak).toBe(0);
  });
  test("counts consecutive days ending today", () => {
    const tasks = [done("2026-05-04"), done("2026-05-05"), done("2026-05-06")];
    expect(computeStats(tasks, range, "2026-05-06").streak).toBe(3);
  });
  test("still counts when today has nothing done yet but yesterday does", () => {
    const tasks = [done("2026-05-04"), done("2026-05-05")];
    expect(computeStats(tasks, range, "2026-05-06").streak).toBe(2);
  });
  test("is 0 when neither today nor yesterday has a done task", () => {
    expect(computeStats([done("2026-05-04")], range, "2026-05-06").streak).toBe(0);
  });
  test("a gap ends the streak", () => {
    const tasks = [done("2026-05-02"), done("2026-05-05"), done("2026-05-06")];
    expect(computeStats(tasks, range, "2026-05-06").streak).toBe(2);
  });
  test("looks past the range and across month boundaries", () => {
    const tasks = [done("2026-04-29"), done("2026-04-30"), done("2026-05-01")];
    expect(computeStats(tasks, range, "2026-05-02").streak).toBe(3);
  });
  test("ignores backlog done tasks, undone tasks and several done tasks on one day", () => {
    const tasks = [
      task({ status: "done" }), done("2026-05-06"), done("2026-05-06"), at("2026-05-05", 30),
    ];
    expect(computeStats(tasks, range, "2026-05-06").streak).toBe(1);
  });
  test("future done tasks do not extend the streak", () => {
    const tasks = [done("2026-05-06"), done("2026-05-07")];
    expect(computeStats(tasks, range, "2026-05-06").streak).toBe(1);
  });
});

describe("followToday", () => {
  test("moves a week that contained the old today to the new today", () => {
    // 2026-03-08 is a Sunday; midnight moves "today" to Monday 2026-03-09 (the next week).
    expect(followToday("week", "2026-03-04", "2026-03-08", "2026-03-09")).toBe("2026-03-09");
  });
  test("moves a month that contained the old today across a month end", () => {
    expect(followToday("month", "2026-03-20", "2026-03-31", "2026-04-01")).toBe("2026-04-01");
  });
  test("keeps a range the user navigated away from", () => {
    expect(followToday("week", "2026-02-10", "2026-03-08", "2026-03-09")).toBe("2026-02-10");
    expect(followToday("month", "2026-01-15", "2026-03-31", "2026-04-01")).toBe("2026-01-15");
  });
  test("stays on the same week when midnight stays inside it", () => {
    expect(followToday("week", "2026-03-04", "2026-03-04", "2026-03-05")).toBe("2026-03-05");
  });
});

describe("week start setting", () => {
  test("weekRange defaults to Monday and honours sun and sat", () => {
    expect(weekRange("2026-05-06")).toEqual({ from: "2026-05-04", to: "2026-05-10" });
    expect(weekRange("2026-05-06", "mon")).toEqual({ from: "2026-05-04", to: "2026-05-10" });
    expect(weekRange("2026-05-06", "sun")).toEqual({ from: "2026-05-03", to: "2026-05-09" });
    expect(weekRange("2026-05-06", "sat")).toEqual({ from: "2026-05-02", to: "2026-05-08" });
  });
  test("a Sunday belongs to its own week when weeks start on Sunday", () => {
    expect(weekRange("2026-05-10", "sun")).toEqual({ from: "2026-05-10", to: "2026-05-16" });
  });
  test("crosses year boundaries and the leap day", () => {
    expect(weekRange("2026-01-01", "sun")).toEqual({ from: "2025-12-28", to: "2026-01-03" });
    expect(weekRange("2026-01-01", "sat")).toEqual({ from: "2025-12-27", to: "2026-01-02" });
    expect(weekRange("2028-02-29", "sun")).toEqual({ from: "2028-02-27", to: "2028-03-04" });
  });
  test("shiftRange moves whole weeks from the chosen start; months ignore it", () => {
    expect(shiftRange("week", "2026-05-06", 1, "sun")).toEqual({ from: "2026-05-10", to: "2026-05-16" });
    expect(shiftRange("week", "2026-05-06", -1, "sat")).toEqual({ from: "2026-04-25", to: "2026-05-01" });
    expect(shiftRange("month", "2026-05-06", 1, "sun")).toEqual(monthRange("2026-06-01"));
  });
  test("followToday uses the chosen week", () => {
    // Saturday 2026-05-09 -> Sunday 2026-05-10: with Sunday weeks it is a new week, with Monday weeks the same one.
    expect(followToday("week", "2026-05-09", "2026-05-09", "2026-05-10", "sun")).toBe("2026-05-10");
    expect(followToday("week", "2026-05-06", "2026-05-09", "2026-05-10", "sun")).toBe("2026-05-10");
    expect(followToday("week", "2026-05-02", "2026-05-09", "2026-05-10", "sun")).toBe("2026-05-02");
    expect(followToday("week", "2026-05-04", "2026-05-09", "2026-05-10", "mon")).toBe("2026-05-10");
  });
});
