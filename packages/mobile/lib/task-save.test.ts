import { describe, test, expect } from "bun:test";
import { allowedScopes, hasConflict, needsScopeChoice, planDelete, planSave, validateForm, type SaveContext, type SaveForm } from "./task-save";
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
const valid = (tasks: Task[]) => tasks.length > 0 && tasks.every(t => taskSchema.safeParse(t).success);

/** Plans a save that must be accepted. */
function plan(f: SaveForm, c: SaveContext) {
  const result = planSave(f, c);
  if (!result.ok) throw new Error(`save refused: ${result.reason}`);
  return result;
}

describe("planSave: new tasks", () => {
  test("appends a trimmed plain task without touching the others", () => {
    const others = [plain()];
    const { candidate, update } = plan(form(), ctx());
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
    const { update } = plan(form({ remind: 15 }), ctx());
    expect(update([])[0].remind).toBe(15);
  });

  test("a backlog task has no date, start, reminder or repeat", () => {
    const { candidate, update } = plan(form({ scheduled: false, remind: 5, repeat: "daily" }), ctx());
    expect(candidate).toMatchObject({ date: null, start: null, remind: null, seriesId: null, repeat: null });
    expect(update([])).toEqual([candidate]);
  });

  test("a repeating task creates a whole series", () => {
    const { update } = plan(form({ repeat: "daily", remind: 5 }), ctx());
    const result = update([plain()]);
    const created = result.slice(1);
    expect(created.length).toBeGreaterThan(30);
    expect(created.filter(t => t.seriesId === "S1" && t.repeat === "daily" && t.remind === 5)).toHaveLength(created.length);
    expect(created[0].date).toBe(TODAY);
    expect(created[0].title).toBe("Stretch");
    expect(valid(result)).toBe(true);
  });

  test("weekly repeat fires on the same weekday", () => {
    const created = plan(form({ repeat: "weekly" }), ctx()).update([]);
    expect(created.slice(0, 3).map(t => t.date)).toEqual([TODAY, "2026-03-09", "2026-03-16"]);
  });
});

describe("planSave: editing a plain task", () => {
  test("replaces it in place", () => {
    const existing = plain();
    const tasks = [plain({ id: "a" }), existing, plain({ id: "b" })];
    const { update } = plan(form({ title: "Renamed", time: "11:00" }), ctx({ existing }));
    const result = update(tasks);
    expect(result.map(t => t.id)).toEqual(["a", "p1", "b"]);
    expect(result[1]).toMatchObject({ title: "Renamed", start: "11:00", createdAt: existing.createdAt });
    expect(tasks[1]).toBe(existing);
    expect(result[0]).toBe(tasks[0]);
  });

  test("turning scheduling off clears date, start, reminder and repeat", () => {
    const existing = plain({ remind: 10 });
    const result = plan(form({ scheduled: false, remind: 10 }), ctx({ existing })).update([existing]);
    expect(result[0]).toMatchObject({ date: null, start: null, remind: null, seriesId: null, repeat: null });
    expect(valid(result)).toBe(true);
  });

  test("adding a repeat turns it into a series that keeps the task id", () => {
    const existing = plain();
    const result = plan(form({ title: "Plain", time: "10:00", repeat: "daily" }), ctx({ existing })).update([existing]);
    const head = result.find(t => t.id === "p1") as Task;
    expect(head).toMatchObject({ seriesId: "S1", repeat: "daily", date: TODAY });
    expect(result.length).toBeGreaterThan(30);
    const members = result.filter(t => t.seriesId === "S1");
    expect(members.length).toBeGreaterThan(30);
    expect(members.filter(t => t.repeat === "daily")).toHaveLength(members.length);
    expect(valid(result)).toBe(true);
  });
});

describe("planSave: editing a series occurrence", () => {
  const tasks = makeSeries();
  const target = byDate(tasks, "2026-03-04");
  const edit = (f: Partial<SaveForm>, scope: SaveContext["scope"]) =>
    plan(form({ title: "New title", date: "2026-03-04", time: "09:30", repeat: "daily", ...f }), ctx({ existing: target, scope })).update(tasks);

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
    const expectedDates = tasks.filter(t => (t.date as string) >= "2026-03-04").map(t => t.date);
    expect(expectedDates.length).toBeGreaterThan(30);
    expect(changed.map(t => t.date)).toEqual(expectedDates);
    expect(result.filter(t => (t.date as string) < "2026-03-04").map(t => t.title)).toEqual(["Stretch", "Stretch"]);
    expect(byDate(result, "2026-03-03").title).toBe("Stretch");
  });

  test("all: changes the whole series", () => {
    const result = edit({}, "all");
    expect(result).toHaveLength(tasks.length);
    expect(result.filter(t => t.title === "New title")).toHaveLength(tasks.length);
  });

  test("following and all keep other occurrences' status but apply this one's", () => {
    for (const scope of ["following", "all"] as const) {
      const result = edit({ status: "done" }, scope);
      expect(byDate(result, "2026-03-04").status).toBe("done");
      expect(result.filter(t => t.status === "done")).toHaveLength(1);
    }
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
    plan(form({ title: "Stretch", date: "2026-03-04", repeat, ...f }), ctx({ existing: target, scope })).update(tasks);

  test("daily -> weekly from this occurrence on", () => {
    const result = run("weekly", "following");
    const later = result.filter(t => t.seriesId === "S" && (t.date as string) > "2026-03-04");
    expect(later.length).toBeGreaterThan(5);
    expect(later.filter(t => t.repeat === "weekly")).toHaveLength(later.length);
    expect(later.slice(0, 2).map(t => t.date)).toEqual(["2026-03-11", "2026-03-18"]);
    expect(byDate(result, "2026-03-03").repeat).toBe("daily");
    expect(valid(result)).toBe(true);
  });

  test("scope this + new rule is refused (it would start a parallel series)", () => {
    const refused = planSave(form({ title: "Stretch", date: "2026-03-04", repeat: "weekly" }), ctx({ existing: target, scope: "this" }));
    expect(refused).toEqual({ ok: false, reason: "rule-change-needs-scope" });
  });

  test("moving the occurrence to another date while changing the rule is refused too", () => {
    const refused = planSave(form({ title: "Stretch", date: "2026-03-10", repeat: "weekly" }), ctx({ existing: target, scope: "all" }));
    expect(refused.ok).toBe(false);
  });

  test("all + new rule regenerates from this occurrence on, in the same series", () => {
    const result = run("weekly", "all", { time: "12:00" });
    expect(result.filter(t => t.seriesId === "S1")).toHaveLength(0);
    expect(byDate(result, "2026-03-04")).toMatchObject({ seriesId: "S", repeat: "weekly", start: "12:00" });
    expect(valid(result)).toBe(true);
  });

  test("scope this + no repeat is refused too (ending a series needs 'following' or 'all')", () => {
    expect(planSave(form({ title: "Stretch", date: "2026-03-04", repeat: null }), ctx({ existing: target, scope: "this" })).ok).toBe(false);
  });

  test("recurring -> none ends the series: later occurrences go, the rest become plain", () => {
    const result = run(null, "following");
    expect(result.map(t => t.date)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
    expect(result.filter(t => t.seriesId == null && t.repeat == null)).toHaveLength(result.length);
    expect(extendSeries(result, TODAY)).toHaveLength(result.length);
  });
});

describe("allowedScopes", () => {
  const series = byDate(makeSeries("daily"), "2026-03-04");
  test("a non-series task only has 'this'", () => {
    expect(allowedScopes(plain(), { repeat: null })).toEqual(["this"]);
    expect(allowedScopes(plain(), { repeat: "daily" })).toEqual(["this"]);
  });
  test("an unchanged rule allows every scope", () => {
    expect(allowedScopes(series, { repeat: "daily" })).toEqual(["this", "following", "all"]);
  });
  test("a changed rule (including none) drops 'this'", () => {
    expect(allowedScopes(series, { repeat: "weekly" })).toEqual(["following", "all"]);
    expect(allowedScopes(series, { repeat: null })).toEqual(["following", "all"]);
  });
});

describe("planDelete", () => {
  test("a plain task is removed through store.remove", () => {
    expect(planDelete(plain(), "this")).toEqual({ kind: "remove", id: "p1" });
  });

  const tasks = makeSeries("daily");
  const mid = byDate(tasks, "2026-03-04");
  const run = (target: Task, scope: SaveContext["scope"]) => {
    const plan = planDelete(target, scope);
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
    expect(result.filter(t => t.seriesId == null && t.repeat == null)).toHaveLength(2);
  });

  test("all: removes the whole series", () => {
    expect(run(mid, "all")).toEqual([]);
  });

  test("this on the last occurrence only removes it; the rest of the series stays intact", () => {
    const last = tasks[tasks.length - 1];
    const result = run(last, "this");
    expect(result).toHaveLength(tasks.length - 1);
    expect(result.some(t => t.id === last.id)).toBe(false);
    expect(result.filter(t => t.seriesId === "S" && t.repeat === "daily")).toHaveLength(tasks.length - 1);
    expect(valid(result)).toBe(true);
  });

  test("deleting an occurrence from a stale list that lacks it is harmless", () => {
    const plan = planDelete(mid, "this");
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

describe("planSave: monthly repeat and end date", () => {
  test("a new monthly task with an end date creates a series that stops on it (inclusive)", () => {
    const { candidate, update } = plan(form({ date: "2026-01-31", repeat: "monthly", repeatUntil: "2026-02-28" }), ctx({ today: "2026-01-31" }));
    expect(candidate.repeatUntil).toBe("2026-02-28");
    const result = update([]);
    expect(result.map(t => t.date)).toEqual(["2026-01-31", "2026-02-28"]);
    expect(result.every(t => t.repeat === "monthly" && t.repeatUntil === "2026-02-28")).toBe(true);
    expect(valid(result)).toBe(true);
  });

  test("the end date is dropped without a repeat, and for a backlog task", () => {
    const noRepeat = plan(form({ repeat: null, repeatUntil: "2026-04-01" }), ctx());
    expect(noRepeat.candidate.repeatUntil).toBeUndefined();
    expect(valid(noRepeat.update([]))).toBe(true);
    const backlog = plan(form({ scheduled: false, repeat: "daily", repeatUntil: "2026-04-01" }), ctx());
    expect(backlog.candidate).toMatchObject({ date: null, repeat: null });
    expect(backlog.candidate.repeatUntil).toBeUndefined();
    expect(valid(backlog.update([]))).toBe(true);
  });

  test("a plain task gains a repeating series with an end date", () => {
    const existing = plain();
    const result = plan(form({ title: "Plain", time: "10:00", repeat: "weekly", repeatUntil: "2026-03-16" }), ctx({ existing })).update([existing]);
    expect(result.map(t => t.date)).toEqual([TODAY, "2026-03-09", "2026-03-16"]);
    expect(result.every(t => t.repeatUntil === "2026-03-16")).toBe(true);
    expect(valid(result)).toBe(true);
  });

  describe("on a series occurrence", () => {
    const tasks = makeSeries("daily");
    const target = byDate(tasks, "2026-03-04");
    const run = (scope: SaveContext["scope"], f: Partial<SaveForm>) =>
      planSave(form({ title: "Stretch", date: "2026-03-04", repeat: "daily", ...f }), ctx({ existing: target, scope }));

    test("changing only the end date is a rule change: scope this is refused", () => {
      expect(run("this", { repeatUntil: "2026-03-10" })).toEqual({ ok: false, reason: "rule-change-needs-scope" });
    });

    test("scope following trims the later occurrences after the new end date", () => {
      const result = plan(form({ title: "Stretch", date: "2026-03-04", repeat: "daily", repeatUntil: "2026-03-10" }), ctx({ existing: target, scope: "following" })).update(tasks);
      expect(result.at(-1)?.date).toBe("2026-03-10");
      expect(result).toHaveLength(9);
      expect(byDate(result, "2026-03-03").repeatUntil).toBeUndefined();
      expect(result.filter(t => (t.date as string) >= "2026-03-04").every(t => t.repeatUntil === "2026-03-10")).toBe(true);
      expect(valid(result)).toBe(true);
    });

    test("scope all behaves like following for the end date (applies from the edited occurrence on)", () => {
      const result = plan(form({ title: "Stretch", date: "2026-03-04", repeat: "daily", repeatUntil: "2026-03-10" }), ctx({ existing: target, scope: "all" })).update(tasks);
      expect(result.at(-1)?.date).toBe("2026-03-10");
    });

    test("clearing the end date resumes the series", () => {
      const limited = createSeries(plain({ id: "tpl", repeatUntil: "2026-03-10" }), "daily", TODAY, () => "L");
      const at = byDate(limited, "2026-03-04");
      const cleared = plan(form({ title: "Plain", time: "10:00", date: "2026-03-04", repeat: "daily", repeatUntil: null }), ctx({ existing: at, scope: "following" })).update(limited);
      expect(cleared.at(-1)?.date).toBe("2026-04-27");
      expect(extendSeries(cleared, "2026-04-20").length).toBeGreaterThan(cleared.length);
    });

    test("an unchanged end date and rule keep scope this allowed and the series untouched", () => {
      const limited = createSeries(plain({ id: "tpl", repeatUntil: "2026-03-10" }), "daily", TODAY, () => "L");
      const at = byDate(limited, "2026-03-04");
      const result = plan(form({ title: "Renamed", time: "10:00", date: "2026-03-04", repeat: "daily", repeatUntil: "2026-03-10" }), ctx({ existing: at, scope: "this" })).update(limited);
      expect(result).toHaveLength(limited.length);
      expect(byDate(result, "2026-03-04").title).toBe("Renamed");
      expect(byDate(result, "2026-03-05").title).toBe("Plain");
    });

    test("a stale occurrence (already gone) is re-added as a plain task without a series or end date", () => {
      const gone = plan(form({ title: "Stretch", date: "2026-03-04", repeat: "daily", repeatUntil: "2026-03-10" }), ctx({ existing: target, scope: "following" })).update([]);
      expect(gone).toHaveLength(1);
      expect(gone[0]).toMatchObject({ seriesId: null, repeat: null, repeatUntil: null });
      expect(valid(gone)).toBe(true);
    });
  });
});

describe("allowedScopes: end date", () => {
  const limited = byDate(createSeries(plain({ id: "tpl", repeatUntil: "2026-03-10" }), "daily", TODAY, () => "L"), "2026-03-04");
  const open = byDate(makeSeries("daily"), "2026-03-04");

  test("a changed end date (set, moved or cleared) drops 'this'", () => {
    expect(allowedScopes(open, { repeat: "daily", repeatUntil: "2026-03-20" })).toEqual(["following", "all"]);
    expect(allowedScopes(limited, { repeat: "daily", repeatUntil: "2026-03-12" })).toEqual(["following", "all"]);
    expect(allowedScopes(limited, { repeat: "daily", repeatUntil: null })).toEqual(["following", "all"]);
  });

  test("an unchanged end date, or none given, keeps every scope", () => {
    expect(allowedScopes(limited, { repeat: "daily", repeatUntil: "2026-03-10" })).toEqual(["this", "following", "all"]);
    expect(allowedScopes(limited, { repeat: "daily" })).toEqual(["this", "following", "all"]);
    expect(allowedScopes(open, { repeat: "daily", repeatUntil: null })).toEqual(["this", "following", "all"]);
  });

  test("a stale end date is ignored when the rule is removed", () => {
    expect(allowedScopes(open, { repeat: null, repeatUntil: "2026-03-20" })).toEqual(["following", "all"]);
  });
});

describe("validateForm: end date", () => {
  const ok = { title: "T", duration: "30", scheduled: true, date: "2026-03-10", time: "09:30", repeat: "weekly" as const };

  test("accepts an end date on or after the task date", () => {
    expect(validateForm({ ...ok, repeatUntil: "2026-03-10" })).toBeNull();
    expect(validateForm({ ...ok, repeatUntil: "2027-01-01" })).toBeNull();
    expect(validateForm({ ...ok, repeatUntil: null })).toBeNull();
  });

  test("rejects an end date before the task date", () => {
    expect(validateForm({ ...ok, repeatUntil: "2026-03-09" })).toBe("The end date must be on or after the task date.");
  });

  test("rejects a malformed end date", () => {
    expect(validateForm({ ...ok, repeatUntil: "2026-3-9" })).toBe("Use a valid date: YYYY-MM-DD.");
    expect(validateForm({ ...ok, repeatUntil: "2026-02-30" })).toBe("Use a valid date: YYYY-MM-DD.");
  });

  test("ignores the end date without a repeat or for a backlog task", () => {
    expect(validateForm({ ...ok, repeat: null, repeatUntil: "2020-01-01" })).toBeNull();
    expect(validateForm({ ...ok, scheduled: false, repeatUntil: "2020-01-01" })).toBeNull();
  });
});
