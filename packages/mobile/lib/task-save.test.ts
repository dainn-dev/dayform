import { describe, test, expect } from "bun:test";
import { hasConflict, needsScopeChoice, planDelete, planSave, validateForm, type SaveContext, type SaveForm } from "./task-save";
import { createSeries, extendSeries } from "./recurrence";
import type { Task } from "./planner";
import { taskSchema } from "./task-storage";

// 2026-03-02 is a Monday.
const TODAY = "2026-03-02";

const idGen = (...ids: string[]) => { let i = 0; return () => ids[i++] ?? `gen-${i++}`; };

function form(overrides: Partial<SaveForm> = {}): SaveForm {
  return {
    title: "  Stretch  ", duration: 30, scheduled: true, date: TODAY, time: "09:30", category: "Wellness",
    status: "todo", notes: " n ", remind: null, repeat: null, ...overrides,
  };
}

function ctx(overrides: Partial<SaveContext> = {}): SaveContext {
  return {
    existing: null, scope: "this", today: TODAY, newId: idGen("new-1"), newSeriesId: idGen("S1"),
    nowIso: "2026-03-01T00:00:00.000Z", ...overrides,
  };
}

function plain(overrides: Partial<Task> = {}): Task {
  return {
    id: "p1", title: "Plain", date: TODAY, start: "10:00", duration: 20, status: "todo",
    category: "Work", notes: "", createdAt: "2026-02-01T00:00:00.000Z", ...overrides,
  };
}

const makeSeries = (rule: "daily" | "weekdays" | "weekly" = "daily", id = "S") =>
  createSeries(plain({ id: "tpl", title: "Stretch", start: "09:30", duration: 30 }), rule, TODAY, () => id);
const byDate = (tasks: Task[], date: string) => tasks.find(t => t.date === date) as Task;
const valid = (tasks: Task[]) => tasks.every(t => taskSchema.safeParse(t).success);

describe("planSave: new tasks", () => {
  test("appends a trimmed plain task without touching the others", () => {
    const others = [plain()];
    const { candidate, update } = planSave(form(), ctx());
    const result = update(others);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(others[0]);
    expect(result[1]).toEqual(candidate);
    expect(candidate).toMatchObject({
      id: "new-1", title: "Stretch", notes: "n", date: TODAY, start: "09:30", duration: 30,
      createdAt: "2026-03-01T00:00:00.000Z", remind: null, seriesId: null, repeat: null,
    });
    expect(valid(result)).toBe(true);
  });

  test("keeps the reminder on a scheduled task", () => {
    const { update } = planSave(form({ remind: 15 }), ctx());
    expect(update([])[0].remind).toBe(15);
  });

  test("a backlog task has no date, start, reminder or repeat", () => {
    const { candidate, update } = planSave(form({ scheduled: false, remind: 5, repeat: "daily" }), ctx());
    expect(candidate).toMatchObject({ date: null, start: null, remind: null, seriesId: null, repeat: null });
    expect(update([])).toEqual([candidate]);
  });

  test("a repeating task creates a whole series", () => {
    const { update } = planSave(form({ repeat: "daily", remind: 5 }), ctx());
    const result = update([plain()]);
    const created = result.slice(1);
    expect(created.length).toBeGreaterThan(30);
    expect(created.every(t => t.seriesId === "S1" && t.repeat === "daily" && t.remind === 5)).toBe(true);
    expect(created[0].date).toBe(TODAY);
    expect(created[0].title).toBe("Stretch");
    expect(valid(result)).toBe(true);
  });

  test("weekly repeat fires on the same weekday", () => {
    const created = planSave(form({ repeat: "weekly" }), ctx()).update([]);
    expect(created.slice(0, 3).map(t => t.date)).toEqual([TODAY, "2026-03-09", "2026-03-16"]);
  });
});

describe("planSave: editing a plain task", () => {
  test("replaces it in place", () => {
    const existing = plain();
    const tasks = [plain({ id: "a" }), existing, plain({ id: "b" })];
    const { update } = planSave(form({ title: "Renamed", time: "11:00" }), ctx({ existing }));
    const result = update(tasks);
    expect(result.map(t => t.id)).toEqual(["a", "p1", "b"]);
    expect(result[1]).toMatchObject({ title: "Renamed", start: "11:00", createdAt: existing.createdAt });
    expect(tasks[1]).toBe(existing);
    expect(result[0]).toBe(tasks[0]);
  });

  test("turning scheduling off clears date, start, reminder and repeat", () => {
    const existing = plain({ remind: 10 });
    const result = planSave(form({ scheduled: false, remind: 10 }), ctx({ existing })).update([existing]);
    expect(result[0]).toMatchObject({ date: null, start: null, remind: null, seriesId: null, repeat: null });
    expect(valid(result)).toBe(true);
  });

  test("adding a repeat turns it into a series that keeps the task id", () => {
    const existing = plain();
    const result = planSave(form({ title: "Plain", time: "10:00", repeat: "daily" }), ctx({ existing })).update([existing]);
    const head = result.find(t => t.id === "p1") as Task;
    expect(head).toMatchObject({ seriesId: "S1", repeat: "daily", date: TODAY });
    expect(result.length).toBeGreaterThan(30);
    expect(result.filter(t => t.seriesId === "S1").every(t => t.repeat === "daily")).toBe(true);
    expect(valid(result)).toBe(true);
  });
});

describe("planSave: editing a series occurrence", () => {
  const tasks = makeSeries();
  const target = byDate(tasks, "2026-03-04");
  const edit = (f: Partial<SaveForm>, scope: SaveContext["scope"]) =>
    planSave(form({ title: "New title", date: "2026-03-04", time: "09:30", repeat: "daily", ...f }), ctx({ existing: target, scope })).update(tasks);

  test("this: changes only that occurrence", () => {
    const result = edit({ time: "13:00" }, "this");
    expect(result).toHaveLength(tasks.length);
    expect(result.filter(t => t.title === "New title").map(t => t.date)).toEqual(["2026-03-04"]);
    expect(byDate(result, "2026-03-04").start).toBe("13:00");
    expect(byDate(result, "2026-03-04").seriesId).toBe("S");
  });

  test("following: changes this and later, not earlier", () => {
    const result = edit({}, "following");
    const changed = result.filter(t => t.title === "New title");
    expect(changed.every(t => (t.date as string) >= "2026-03-04")).toBe(true);
    expect(changed).toHaveLength(tasks.filter(t => (t.date as string) >= "2026-03-04").length);
    expect(byDate(result, "2026-03-03").title).toBe("Stretch");
  });

  test("all: changes the whole series", () => {
    const result = edit({}, "all");
    expect(result.every(t => t.title === "New title")).toBe(true);
  });

  test("following keeps other occurrences' status but applies this one's", () => {
    const result = edit({ status: "done" }, "following");
    expect(byDate(result, "2026-03-04").status).toBe("done");
    expect(byDate(result, "2026-03-05").status).toBe("todo");
  });

  test("changing the date always edits just that occurrence", () => {
    const f = form({ date: "2026-03-04", repeat: "daily" });
    expect(needsScopeChoice(target, f)).toBe(true);
    expect(needsScopeChoice(target, { ...f, date: "2026-03-10" })).toBe(false);
    const result = edit({ date: "2026-03-10", title: "Moved" }, "all");
    expect(result.filter(t => t.title === "Moved")).toHaveLength(1);
    expect(byDate(result, "2026-03-05").title).toBe("Stretch");
  });

  test("no scope choice for new or plain tasks, or when scheduling is turned off", () => {
    expect(needsScopeChoice(null, form())).toBe(false);
    expect(needsScopeChoice(plain(), form())).toBe(false);
    expect(needsScopeChoice(target, form({ date: "2026-03-04", scheduled: false }))).toBe(false);
  });

  test("turning scheduling off detaches only that occurrence", () => {
    const result = edit({ scheduled: false, remind: 5 }, "all");
    expect(result).toHaveLength(tasks.length);
    expect(result.find(t => t.id === target.id)).toMatchObject({ date: null, start: null, remind: null, seriesId: null, repeat: null });
    expect(result.filter(t => t.seriesId === "S")).toHaveLength(tasks.length - 1);
    expect(valid(result)).toBe(true);
  });
});

describe("planSave: changing the repeat rule", () => {
  const tasks = makeSeries("daily");
  const target = byDate(tasks, "2026-03-04");
  const run = (repeat: SaveForm["repeat"], scope: SaveContext["scope"], f: Partial<SaveForm> = {}) =>
    planSave(form({ title: "Stretch", date: "2026-03-04", repeat, ...f }), ctx({ existing: target, scope })).update(tasks);

  test("daily -> weekly from this occurrence on", () => {
    const result = run("weekly", "following");
    const series = result.filter(t => t.seriesId === "S");
    expect(series.filter(t => (t.date as string) > "2026-03-04").every(t => t.repeat === "weekly")).toBe(true);
    expect(series.filter(t => (t.date as string) > "2026-03-04").slice(0, 2).map(t => t.date)).toEqual(["2026-03-11", "2026-03-18"]);
    expect(byDate(result, "2026-03-03").repeat).toBe("daily");
    expect(valid(result)).toBe(true);
  });

  test("scope this + new rule splits the occurrence off into its own series", () => {
    const result = run("weekly", "this", { time: "12:00" });
    const head = result.find(t => t.id === target.id) as Task;
    expect(head.seriesId).toBe("S1");
    expect(head.start).toBe("12:00");
    expect(result.filter(t => t.seriesId === "S").length).toBe(tasks.length - 1);
    expect(byDate(result, "2026-03-05")).toMatchObject({ seriesId: "S", repeat: "daily" });
    expect(valid(result)).toBe(true);
  });

  test("scope this + no repeat makes it a plain task and leaves the series", () => {
    const result = run(null, "this");
    expect(result.find(t => t.id === target.id)).toMatchObject({ seriesId: null, repeat: null });
    expect(result).toHaveLength(tasks.length);
  });

  test("recurring -> none ends the series: later occurrences go, the rest become plain", () => {
    const result = run(null, "following");
    expect(result.some(t => (t.date as string) > "2026-03-04")).toBe(false);
    expect(result.every(t => t.seriesId == null && t.repeat == null)).toBe(true);
    expect(extendSeries(result, TODAY)).toHaveLength(result.length);
  });
});

describe("planDelete", () => {
  test("a plain task is removed through store.remove", () => {
    expect(planDelete(plain(), "this", TODAY, idGen())).toEqual({ kind: "remove", id: "p1" });
  });

  const tasks = makeSeries("daily");
  const mid = byDate(tasks, "2026-03-04");
  const run = (target: Task, scope: SaveContext["scope"]) => {
    const plan = planDelete(target, scope, TODAY, idGen());
    if (plan.kind !== "mutate") throw new Error("expected mutate");
    return plan.update(tasks);
  };

  test("this: removes one occurrence of a series", () => {
    const result = run(mid, "this");
    expect(result).toHaveLength(tasks.length - 1);
    expect(result.some(t => t.id === mid.id)).toBe(false);
    expect(result.filter(t => t.seriesId === "S")).toHaveLength(tasks.length - 1);
  });

  test("following: removes this and later, detaches the earlier ones", () => {
    const result = run(mid, "following");
    expect(result.map(t => t.date)).toEqual(["2026-03-02", "2026-03-03"]);
    expect(result.every(t => t.seriesId == null && t.repeat == null)).toBe(true);
  });

  test("all: removes the whole series", () => {
    expect(run(mid, "all")).toEqual([]);
  });

  test("deleting the last occurrence ends the series so extendSeries cannot bring it back", () => {
    const last = tasks[tasks.length - 1];
    const result = run(last, "this");
    expect(result.some(t => t.id === last.id)).toBe(false);
    expect(result.every(t => t.seriesId == null && t.repeat == null)).toBe(true);
    expect(extendSeries(result, TODAY)).toEqual(result);
    expect(valid(result)).toBe(true);
  });

  test("deleting an occurrence from a stale list that lacks it is harmless", () => {
    const plan = planDelete(mid, "this", TODAY, idGen());
    if (plan.kind !== "mutate") throw new Error("expected mutate");
    const without = tasks.filter(t => t.id !== mid.id);
    expect(plan.update(without)).toHaveLength(without.length);
  });
});

describe("hasConflict", () => {
  test("detects an overlap on the same date, ignoring the task itself", () => {
    const a = plain({ id: "a", start: "09:00", duration: 60 });
    const b = plain({ id: "b", start: "09:30", duration: 30 });
    expect(hasConflict(b, [a])).toBe(true);
    expect(hasConflict(a, [a])).toBe(false);
    expect(hasConflict(plain({ id: "c", date: null, start: null }), [a])).toBe(false);
    expect(hasConflict(plain({ id: "d", start: "10:00" }), [a])).toBe(false);
  });
});

describe("validateForm", () => {
  const ok = { title: "T", duration: "30", scheduled: true, date: TODAY, time: "09:30" };
  test("accepts a valid form", () => {
    expect(validateForm(ok)).toBeNull();
  });
  test("rejects an empty title, bad duration, bad date, bad time and crossing midnight", () => {
    expect(validateForm({ ...ok, title: "  " })).toBe("Give this task a title.");
    expect(validateForm({ ...ok, duration: "0" })).toBe("Duration must be 1–1440 minutes.");
    expect(validateForm({ ...ok, duration: "1.5" })).toBe("Duration must be 1–1440 minutes.");
    expect(validateForm({ ...ok, date: "2026-02-30" })).toBe("Use a valid date: YYYY-MM-DD.");
    expect(validateForm({ ...ok, time: "24:00" })).toBe("Use a 24-hour time: HH:mm.");
    expect(validateForm({ ...ok, time: "23:45" })).toBe("Scheduled tasks must end before midnight.");
  });
  test("ignores date and time for a backlog task", () => {
    expect(validateForm({ ...ok, scheduled: false, date: "nope", time: "nope" })).toBeNull();
  });
});
