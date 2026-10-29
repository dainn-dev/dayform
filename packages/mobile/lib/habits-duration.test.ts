import { describe, expect, test } from "bun:test";
import { suggestDuration } from "./habits-duration";
import type { Task } from "./planner";

let counter = 0;
const task = (title: string, duration: number, extra: Partial<Task> = {}): Task => {
  counter += 1;
  return {
    id: `t${counter}`, title, date: `2026-09-${String(counter % 28 + 1).padStart(2, "0")}`, start: "09:00", duration,
    status: "done", category: "Work", notes: "", createdAt: "2026-09-01T00:00:00.000Z", ...extra,
  };
};
const many = (title: string, durations: number[], extra: Partial<Task> = {}) => durations.map(d => task(title, d, extra));

describe("suggestDuration", () => {
  test("returns the median of the matches rounded to 5 minutes", () => {
    const result = suggestDuration("Gym session", many("Gym session", [40, 45, 50, 45]));
    expect(result).toEqual({ minutes: 45, basedOn: 4, category: "Work" });
  });

  test("rounds to the nearest 5", () => {
    expect(suggestDuration("Gym session", many("Gym session", [31, 33, 32]))?.minutes).toBe(30);
    expect(suggestDuration("Gym session", many("Gym session", [34, 36, 36]))?.minutes).toBe(35);
    expect(suggestDuration("Gym session", many("Gym session", [30, 45]))?.minutes).toBe(40);
  });

  test("needs at least two matches", () => {
    expect(suggestDuration("Gym session", many("Gym session", [30]))).toBeNull();
    expect(suggestDuration("Gym session", [])).toBeNull();
  });

  test("ignores titles that are too short or do not match", () => {
    const history = many("Gym session", [30, 30, 30]);
    expect(suggestDuration("gy", history)).toBeNull();
    expect(suggestDuration("Swimming", history)).toBeNull();
  });

  test("uses only done tasks with a usable duration", () => {
    const history = [
      ...many("Gym session", [30, 30], { status: "todo" }),
      ...many("Gym session", [30], { status: "in_progress" }),
      task("Gym session", 0),
      task("Gym session", Number.NaN),
      task("Gym session", 60),
    ];
    expect(suggestDuration("Gym session", history)).toBeNull();
    expect(suggestDuration("Gym session", [...history, task("Gym session", 60)])).toEqual({ minutes: 60, basedOn: 2, category: "Work" });
  });

  test("includes backlog tasks (no date) that were completed", () => {
    const history = many("Gym session", [20, 20], { date: null, start: null });
    expect(suggestDuration("Gym session", history)?.minutes).toBe(20);
  });

  test("uses only the 10 most recent matches", () => {
    const old = many("Gym session", [120, 120, 120, 120, 120], { date: "2026-01-01" });
    const recent = many("Gym session", [30, 30, 30, 30, 30, 30, 30, 30, 30, 30], { date: "2026-10-01" });
    expect(suggestDuration("Gym session", [...old, ...recent])).toEqual({ minutes: 30, basedOn: 10, category: "Work" });
  });

  test("returns null when the matches disagree wildly", () => {
    expect(suggestDuration("Gym session", many("Gym session", [15, 60]))).toBeNull();
    expect(suggestDuration("Gym session", many("Gym session", [10, 20, 60, 100, 200]))).toBeNull();
  });

  test("accepts a single outlier when most matches agree", () => {
    expect(suggestDuration("Gym session", many("Gym session", [30, 30, 30, 240]))?.minutes).toBe(30);
  });

  test("returns null when the suggestion is under 5 or over 720 minutes", () => {
    expect(suggestDuration("Gym session", many("Gym session", [1, 2, 2]))).toBeNull();
    expect(suggestDuration("Gym session", many("Gym session", [800, 800]))).toBeNull();
    expect(suggestDuration("Gym session", many("Gym session", [720, 720]))?.minutes).toBe(720);
    expect(suggestDuration("Gym session", many("Gym session", [5, 5]))?.minutes).toBe(5);
  });

  test("suggests the most common category, null on a tie", () => {
    const mixed = [
      task("Gym session", 30, { category: "Wellness" }), task("Gym session", 30, { category: "Wellness" }),
      task("Gym session", 30, { category: "Work" }),
    ];
    expect(suggestDuration("Gym session", mixed)?.category).toBe("Wellness");
    const tie = [task("Gym session", 30, { category: "Wellness" }), task("Gym session", 30, { category: "Work" })];
    expect(suggestDuration("Gym session", tie)?.category).toBeNull();
  });

  test("treats categories as opaque strings", () => {
    const history = many("Gym session", [30, 30], { category: "Côn trùng" as Task["category"] });
    expect(suggestDuration("Gym session", history)?.category).toBe("Côn trùng");
  });

  test("counts duplicate tasks on the same day as separate completions", () => {
    const history = many("Gym session", [30, 30], { date: "2026-10-01" });
    expect(suggestDuration("Gym session", history)?.basedOn).toBe(2);
  });

  test("matches accent-insensitively", () => {
    expect(suggestDuration("di cho", many("Đi chợ", [45, 45]))?.minutes).toBe(45);
  });
});
