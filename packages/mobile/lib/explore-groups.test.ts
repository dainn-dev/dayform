import { describe, expect, test } from "bun:test";
import { buildExploreSections, conflictIds, taskStats, type ExploreFilter } from "./explore-groups";
import { overlaps, type Task } from "./planner";

let counter = 0;
function task(patch: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `t${counter}`, title: `Task ${counter}`, date: null, start: null, duration: 30,
    status: "todo", category: "Focus", notes: "", createdAt: "2026-01-01T00:00:00.000Z", ...patch,
  };
}
const at = (date: string, start: string, duration: number, patch: Partial<Task> = {}) =>
  task({ date, start, duration, ...patch });

describe("conflictIds", () => {
  test("returns an empty set when nothing is scheduled", () => {
    expect(conflictIds([task(), task()]).size).toBe(0);
  });

  test("flags both tasks of an overlapping pair", () => {
    const a = at("2026-05-04", "09:00", 60);
    const b = at("2026-05-04", "09:30", 30);
    expect([...conflictIds([b, a])].sort()).toEqual([a.id, b.id].sort());
  });

  test("does not flag tasks that merely touch", () => {
    const a = at("2026-05-04", "09:00", 30);
    const b = at("2026-05-04", "09:30", 30);
    expect(conflictIds([a, b]).size).toBe(0);
  });

  test("does not flag the same time on different days", () => {
    const a = at("2026-05-04", "09:00", 60);
    const b = at("2026-05-05", "09:00", 60);
    expect(conflictIds([a, b]).size).toBe(0);
  });

  test("a long task conflicts with every short task it covers, but those do not conflict with each other", () => {
    const long = at("2026-05-04", "09:00", 240);
    const a = at("2026-05-04", "09:30", 15);
    const b = at("2026-05-04", "10:30", 15);
    const lone = at("2026-05-04", "14:00", 15);
    const ids = conflictIds([lone, b, long, a]);
    expect(ids.has(long.id) && ids.has(a.id) && ids.has(b.id)).toBe(true);
    expect(ids.has(lone.id)).toBe(false);
  });

  test("ignores backlog tasks", () => {
    expect(conflictIds([task(), at("2026-05-04", "09:00", 60)]).size).toBe(0);
  });

  test("matches the brute-force overlaps() definition on a pseudo-random set", () => {
    let seed = 7;
    const rand = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
    const tasks = Array.from({ length: 200 }, () => {
      const startMin = 6 * 60 + rand(16 * 60 - 60);
      const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const mm = String(startMin % 60).padStart(2, "0");
      return at(`2026-05-0${1 + rand(3)}`, `${hh}:${mm}`, 5 + rand(90));
    });
    const expected = new Set(tasks.filter(x => tasks.some(y => overlaps(x, y))).map(x => x.id));
    expect(conflictIds(tasks)).toEqual(expected);
  });

  test("does not mutate its input", () => {
    const list = [at("2026-05-04", "10:00", 60), at("2026-05-04", "09:00", 60)];
    const before = list.map(x => x.id);
    conflictIds(list);
    expect(list.map(x => x.id)).toEqual(before);
  });
});

describe("taskStats", () => {
  test("counts every task regardless of any filter", () => {
    const tasks = [
      task(), task({ status: "in_progress" }), task({ status: "done" }),
      at("2026-05-04", "09:00", 30), at("2026-05-04", "10:00", 30, { status: "done" }),
    ];
    expect(taskStats(tasks)).toEqual({ todo: 3, scheduled: 2, done: 2 });
  });
});

describe("buildExploreSections", () => {
  const backlogTodo = task({ title: "b-todo" });
  const backlogDone = task({ title: "b-done", status: "done" });
  const late = at("2026-05-05", "08:00", 30, { title: "late" });
  const early = at("2026-05-04", "11:00", 30, { title: "early-b" });
  const earlier = at("2026-05-04", "09:00", 30, { title: "early-a", status: "done" });
  const all = [late, backlogTodo, early, backlogDone, earlier];
  const titles = (filter: ExploreFilter) => {
    const { backlog, scheduled } = buildExploreSections(all, filter);
    return { backlog: backlog.map(x => x.title), scheduled: scheduled.map(x => x.title) };
  };

  test("all keeps everything and sorts scheduled by date then start", () => {
    expect(titles("all")).toEqual({ backlog: ["b-todo", "b-done"], scheduled: ["early-a", "early-b", "late"] });
  });

  test("active hides done tasks", () => {
    expect(titles("active")).toEqual({ backlog: ["b-todo"], scheduled: ["early-b", "late"] });
  });

  test("done keeps only done tasks", () => {
    expect(titles("done")).toEqual({ backlog: ["b-done"], scheduled: ["early-a"] });
  });

  test("does not reorder the input array", () => {
    const snapshot = all.map(x => x.title);
    buildExploreSections(all, "all");
    expect(all.map(x => x.title)).toEqual(snapshot);
  });
});
