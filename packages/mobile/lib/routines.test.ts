import { describe, expect, test } from "bun:test";
import type { Task } from "./planner";
import {
  MAX_ROUTINES, MAX_ROUTINE_ITEMS, addRoutineFromDay, parseRoutinesText, removeRoutine, renameRoutine, routineTasks, planRoutine, updateRoutine,
  type Routine, type RoutinesState,
} from "./routines";
import { taskSchema } from "./task-storage";

const DAY = "2026-03-02";
const task = (over: Partial<Task>): Task => ({
  id: "t", title: "T", date: DAY, start: "09:00", duration: 30, status: "done", category: "Work", notes: "keep out", createdAt: "x", remind: 15, ...over,
});
const EMPTY: RoutinesState = { items: [] };
const saved = (name: string, tasks: Task[]): Routine => {
  const result = addRoutineFromDay(EMPTY, name, tasks, DAY, "r_abcd1234");
  if (!result.ok) throw new Error(result.reason);
  return result.state.items[0];
};

describe("addRoutineFromDay", () => {
  test("keeps the scheduled tasks of the day in time order, without dates, ticks, notes or reminders", () => {
    const routine = saved("  Morning  ", [
      task({ id: "b", title: "Run", start: "07:00", duration: 20, category: "Wellness", checklist: [{ text: "Shoes", done: true }] }),
      task({ id: "a", title: "Read", start: "06:00" }),
      task({ id: "other-day", date: "2026-03-03" }),
      task({ id: "backlog", date: null, start: null }),
    ]);
    expect(routine).toEqual({
      id: "r_abcd1234", name: "Morning",
      items: [
        { title: "Read", start: "06:00", duration: 30, category: "Work", steps: [] },
        { title: "Run", start: "07:00", duration: 20, category: "Wellness", steps: ["Shoes"] },
      ],
    });
  });

  test("refuses a blank name, an empty day and a full list", () => {
    expect(addRoutineFromDay(EMPTY, "   ", [task({})], DAY)).toEqual({ ok: false, reason: "invalid-name" });
    expect(addRoutineFromDay(EMPTY, "A", [task({ date: null, start: null })], DAY)).toEqual({ ok: false, reason: "no-tasks" });
    const full: RoutinesState = { items: Array.from({ length: MAX_ROUTINES }, (_, i) => ({ ...saved("x", [task({})]), id: `r_${String(i).padStart(8, "0")}` })) };
    expect(addRoutineFromDay(full, "A", [task({})], DAY)).toEqual({ ok: false, reason: "limit" });
  });

  test("takes at most MAX_ROUTINE_ITEMS tasks", () => {
    const many = Array.from({ length: 30 }, (_, i) => task({ id: `t${i}`, start: `${String(Math.floor(i / 2) + 5).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, duration: 10 }));
    expect(saved("Many", many).items).toHaveLength(MAX_ROUTINE_ITEMS);
  });
});

describe("rename and remove", () => {
  const state: RoutinesState = { items: [saved("Morning", [task({})])] };

  test("rename trims and keeps the rest", () => {
    const result = renameRoutine(state, "r_abcd1234", "  Evening ");
    expect(result.ok && result.state.items[0].name).toBe("Evening");
    expect(renameRoutine(state, "r_abcd1234", " ")).toEqual({ ok: false, reason: "invalid-name" });
    expect(renameRoutine(state, "r_zzzzzzzz", "A")).toEqual({ ok: false, reason: "unknown" });
  });

  test("remove", () => {
    const result = removeRoutine(state, "r_abcd1234");
    expect(result.ok && result.state.items).toEqual([]);
    expect(removeRoutine(state, "r_zzzzzzzz")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("routineTasks", () => {
  const routine = saved("Morning", [
    task({ id: "a", title: "Read", start: "06:00", duration: 30, checklist: [{ text: "Book", done: true }] }),
    task({ id: "b", title: "Run", start: "07:00", duration: 60 }),
  ]);
  let n = 0;
  const options = { date: "2026-04-01", remind: 5, newId: () => `id${n++}`, nowIso: "2026-03-01T00:00:00.000Z" };

  test("gives fresh, valid tasks on the chosen date with unticked steps", () => {
    const tasks = routineTasks(routine, options);
    expect(tasks.map(t => [t.title, t.date, t.start, t.status, t.remind])).toEqual([
      ["Read", "2026-04-01", "06:00", "todo", 5],
      ["Run", "2026-04-01", "07:00", "todo", 5],
    ]);
    expect(new Set(tasks.map(t => t.id)).size).toBe(2);
    expect(tasks[0].checklist).toEqual([{ text: "Book", done: false }]);
    expect(tasks[1].checklist).toBeUndefined();
    expect(tasks.every(t => taskSchema.safeParse(t).success)).toBe(true);
  });

  test("firstStart moves the whole routine", () => {
    expect(routineTasks(routine, { ...options, firstStart: "08:30" }).map(t => t.start)).toEqual(["08:30", "09:30"]);
  });

  test("a task pushed past midnight is dropped, one that would run past it is shortened", () => {
    expect(routineTasks(routine, { ...options, firstStart: "23:00" }).map(t => [t.start, t.duration])).toEqual([["23:00", 30]]);
    expect(routineTasks(routine, { ...options, firstStart: "22:30" }).map(t => [t.start, t.duration])).toEqual([["22:30", 30], ["23:30", 30]]);
  });

  test("no reminder when null", () => {
    expect(routineTasks(routine, { ...options, remind: null })[0].remind).toBeNull();
  });
});

describe("parseRoutinesText", () => {
  const good = saved("Morning", [task({})]);

  test("reads what was written", () => {
    expect(parseRoutinesText(JSON.stringify({ items: [good] }))).toEqual({ state: { items: [good] }, valid: true, lossy: false });
  });

  test("drops a broken routine and says so", () => {
    const result = parseRoutinesText(JSON.stringify({ items: [good, { id: "bad" }, { ...good }] }));
    expect(result.state.items).toEqual([good]);
    expect(result.lossy).toBe(true);
  });

  test("an item that would pass midnight is rejected", () => {
    const bad = { ...good, items: [{ ...good.items[0], start: "23:30", duration: 60 }] };
    expect(parseRoutinesText(JSON.stringify({ items: [bad] })).state.items).toEqual([]);
  });

  test("not JSON or the wrong shape is invalid", () => {
    expect(parseRoutinesText("{").valid).toBe(false);
    expect(parseRoutinesText("[]").valid).toBe(false);
  });
});

describe("routines: picking tasks, editing and not doubling up", () => {
  const task = (id: string, title: string, start: string, date = "2026-03-02") => ({
    id, title, date, start, duration: 30, status: "todo" as const, category: "Focus", notes: "", createdAt: "2026-03-01T00:00:00.000Z",
    remind: null, seriesId: null, repeat: null,
  });
  const day = [task("a", "Run", "07:00"), task("b", "Read", "08:00"), task("c", "Plan", "09:00")];

  test("only the ticked tasks of the day go into the routine", () => {
    const result = addRoutineFromDay({ items: [] }, "Morning", day, "2026-03-02", "r_aaaaaaaa", ["a", "c"]);
    expect(result.ok && result.state.items[0].items.map(item => item.title)).toEqual(["Run", "Plan"]);
  });

  test("ticking nothing saves nothing", () => {
    expect(addRoutineFromDay({ items: [] }, "Morning", day, "2026-03-02", "r_aaaaaaaa", [])).toEqual({ ok: false, reason: "no-tasks" });
  });

  test("an edit renames, retimes and removes tasks, keeps time order and rejects bad values", () => {
    const made = addRoutineFromDay({ items: [] }, "Morning", day, "2026-03-02", "r_aaaaaaaa");
    if (!made.ok) throw new Error("setup");
    const [run, read] = made.state.items[0].items;
    const edited = updateRoutine(made.state, "r_aaaaaaaa", { name: "  Early  ", items: [{ ...read, start: "06:00" }, run] });
    expect(edited.ok && edited.state.items[0].name).toBe("Early");
    expect(edited.ok && edited.state.items[0].items.map(item => item.title)).toEqual(["Read", "Run"]);
    expect(updateRoutine(made.state, "r_aaaaaaaa", { name: "x", items: [{ ...run, start: "25:00" }] })).toEqual({ ok: false, reason: "invalid-item" });
    expect(updateRoutine(made.state, "r_aaaaaaaa", { name: "x", items: [{ ...run, start: "23:50", duration: 30 }] })).toEqual({ ok: false, reason: "invalid-item" });
    expect(updateRoutine(made.state, "r_aaaaaaaa", { name: "x", items: [] })).toEqual({ ok: false, reason: "no-tasks" });
    expect(updateRoutine(made.state, "r_aaaaaaaa", { name: " ", items: [run] })).toEqual({ ok: false, reason: "invalid-name" });
    expect(updateRoutine(made.state, "r_zzzzzzzz", { name: "x", items: [run] })).toEqual({ ok: false, reason: "unknown" });
  });

  test("applying a routine skips tasks the day already has (same title at the same time), so a second tap adds nothing", () => {
    const made = addRoutineFromDay({ items: [] }, "Morning", day, "2026-03-02", "r_aaaaaaaa");
    if (!made.ok) throw new Error("setup");
    let n = 0;
    const options = { date: "2026-03-09", remind: null, nowIso: "2026-03-08T00:00:00.000Z", newId: () => `n${n++}` };
    const first = planRoutine(made.state.items[0], options, []);
    expect(first.tasks).toHaveLength(3);
    const again = planRoutine(made.state.items[0], options, first.tasks);
    expect(again).toMatchObject({ tasks: [], duplicates: 3, outside: 0 });
    const some = planRoutine(made.state.items[0], options, [{ ...first.tasks[1], title: " read " }, { ...first.tasks[0], date: "2026-03-10" }]);
    expect(some.tasks.map(item => item.title)).toEqual(["Run", "Plan"]);
    expect(some.duplicates).toBe(1);
  });
});
