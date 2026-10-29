import { describe, expect, test } from "bun:test";
import { MAX_STALE_IDS, stalePastTasks } from "./habits-nudge";
import { addDays, dateKey, type Task } from "./planner";

const NOW = new Date(2026, 9, 29, 10, 0);
const TODAY = dateKey(NOW);

let counter = 0;
const open = (daysAgo: number | null, extra: Partial<Task> = {}): Task => {
  counter += 1;
  return {
    id: `t${counter}`, title: "Call", date: daysAgo === null ? null : addDays(TODAY, -daysAgo), start: daysAgo === null ? null : "09:00",
    duration: 30, status: "todo", category: "Work", notes: "", createdAt: "2026-09-01T00:00:00.000Z", ...extra,
  };
};

describe("stalePastTasks", () => {
  test("collects unfinished tasks dated at least 14 days ago", () => {
    const old = open(14);
    const older = open(40, { status: "in_progress" });
    const result = stalePastTasks([open(13), old, open(0), older], NOW);
    expect(result.count).toBe(2);
    expect(result.ids).toEqual([older.id, old.id]);
  });

  test("ignores done tasks, backlog tasks and series occurrences", () => {
    const history = [
      open(20, { status: "done" }), open(null), open(20, { seriesId: "s1" }), open(20, { seriesId: "s1", repeat: "weekly" }),
    ];
    expect(stalePastTasks(history, NOW)).toEqual({ count: 0, ids: [] });
  });

  test("honours a custom threshold", () => {
    const a = open(3);
    expect(stalePastTasks([a, open(2)], NOW, 3)).toEqual({ count: 1, ids: [a.id] });
  });

  test("clamps nonsense thresholds to one day", () => {
    const yesterday = open(1);
    expect(stalePastTasks([yesterday, open(0)], NOW, 0)).toEqual({ count: 1, ids: [yesterday.id] });
    expect(stalePastTasks([yesterday], NOW, Number.NaN).count).toBe(1);
    expect(stalePastTasks([yesterday], NOW, -5).count).toBe(1);
    expect(stalePastTasks([yesterday], NOW, 2.9).count).toBe(0);
  });

  test("orders ids oldest first, then by id, and caps them while counting everything", () => {
    const history = Array.from({ length: 60 }, (_, i) => open(14 + i));
    const result = stalePastTasks(history, NOW);
    expect(result.count).toBe(60);
    expect(result.ids).toHaveLength(MAX_STALE_IDS);
    expect(MAX_STALE_IDS).toBe(50);
    expect(result.ids[0]).toBe(history[59]!.id);
    expect(result.ids[49]).toBe(history[10]!.id);
  });

  test("breaks date ties by id", () => {
    const b = open(20, { id: "b" });
    const a = open(20, { id: "a" });
    expect(stalePastTasks([b, a], NOW).ids).toEqual(["a", "b"]);
  });

  test("works across month and year boundaries", () => {
    const now = new Date(2027, 0, 5, 9, 0);
    const exactly = open(0, { date: "2026-12-22" });
    const almost = open(0, { date: "2026-12-23" });
    expect(stalePastTasks([exactly, almost], now)).toEqual({ count: 1, ids: [exactly.id] });
  });

  test("returns an empty result for an empty history", () => {
    expect(stalePastTasks([], NOW)).toEqual({ count: 0, ids: [] });
  });
});
