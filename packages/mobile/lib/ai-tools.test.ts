import { describe, expect, test } from "bun:test";
import { AI_TOOL_NAMES, CARD_TEXTS, checkSettingsChanges, describeAction, openSettings, parseToolCall, SSH_TOOL_DEFINITIONS, taskUpdate, TOOL_DEFINITIONS, type Action, type ToolContext } from "./ai-tools";
import type { ToolCall } from "./ai-stream";
import type { Task } from "./planner";
import { DEFAULT_SETTINGS } from "./settings";
import { vi } from "./i18n/assistant";
import { extraTranslations } from "./i18n";

const task = (over: Partial<Task>): Task => ({
  id: "t1", title: "Họp nhóm", date: "2026-11-01", start: "09:00", duration: 60, status: "todo",
  category: "Work", notes: "", createdAt: "2026-10-01T00:00:00.000Z", ...over,
});
let ids = 0;
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  tasks: [task({}), task({ id: "t2", title: "Chạy bộ", start: "18:00", category: "Wellness" }), task({ id: "b1", title: "Đọc sách", date: null, start: null })],
  settings: DEFAULT_SETTINGS,
  categories: [{ id: "Focus", name: "Focus" }, { id: "Work", name: "Công việc" }, { id: "Wellness", name: "Sức khỏe" }],
  specialDays: [{ id: "s_abcdefgh", title: "Sinh nhật mẹ", kind: "birthday", calendar: "solar", month: 3, day: 8, startYear: null, remind: "none" }],
  shareTitles: true,
  now: new Date(2026, 10, 1, 8, 0),
  newId: () => `new-${++ids}`,
  newSeriesId: () => "series-x",
  ...over,
});
const call = (name: string, args: unknown): ToolCall => ({ id: "c", type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
const action = (parsed: ReturnType<typeof parseToolCall>): Action => {
  if (parsed.kind !== "action") throw new Error(`expected an action, got ${JSON.stringify(parsed)}`);
  return parsed.action;
};
const apply = (a: Action, tasks: Task[]) => taskUpdate(a)!(tasks);
const base = () => ctx().tasks as Task[];

describe("tool definitions", () => {
  test("every defined tool has a schema and the other way round", () => {
    expect([...TOOL_DEFINITIONS, ...SSH_TOOL_DEFINITIONS].map(tool => tool.function.name).sort()).toEqual([...AI_TOOL_NAMES].sort());
  });

  test("every line a confirmation card can show is translated", () => {
    const all = { ...extraTranslations, ...vi };
    for (const text of CARD_TEXTS) expect({ text, vi: all[text] !== undefined }).toEqual({ text, vi: true });
  });
});

describe("reading", () => {
  test("list_tasks returns the range, by date and time, with reminder and repeat, and the backlog on request", () => {
    const read = parseToolCall(call("list_tasks", { from: "2026-11-01", to: "2026-11-01", include_backlog: true }), ctx({ tasks: [task({ remind: 30 }), task({ id: "b1", date: null, start: null })] }));
    const tasks = (read as { result: { tasks: { id: string; remind: number | null }[] } }).result.tasks;
    expect(tasks.map(t => t.id)).toEqual(["t1", "b1"]);
    expect(tasks[0].remind).toBe(30);
  });

  test("titles stay on the phone when sharing is off", () => {
    expect(JSON.stringify(parseToolCall(call("list_tasks", { from: "2026-11-01", to: "2026-11-01" }), ctx({ shareTitles: false })))).not.toContain("Họp nhóm");
    expect(JSON.stringify(parseToolCall(call("list_special_days", {}), ctx({ shareTitles: false })))).not.toContain("Sinh nhật mẹ");
  });

  test("get_settings never shows the AI settings", () => {
    expect(Object.keys(openSettings(DEFAULT_SETTINGS))).not.toContain("ai");
  });
});

describe("creating tasks", () => {
  test("a reminder 30 minutes before is set (the owner's case)", () => {
    const created = action(parseToolCall(call("create_task", { title: "Gọi mẹ", date: "2026-11-02", start: "20:00", remind: 30 }), ctx()));
    const after = apply(created, base());
    expect(after.find(t => t.title === "Gọi mẹ")).toMatchObject({ date: "2026-11-02", start: "20:00", remind: 30 });
    expect(describeAction(created)).toContainEqual({ text: "Reminder {minutes} min before", vars: { minutes: 30 } });
  });

  test("a repeating task becomes a series, with its end date", () => {
    const created = action(parseToolCall(call("create_task", { title: "Uống nước", date: "2026-11-02", start: "09:00", repeat: "daily", repeat_until: "2026-11-05" }), ctx()));
    const series = apply(created, base()).filter(t => t.title === "Uống nước");
    expect(series.map(t => t.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(new Set(series.map(t => t.seriesId)).size).toBe(1);
  });

  test("an invalid reminder, half a time, a backlog task that repeats or an unknown category is refused", () => {
    expect(parseToolCall(call("create_task", { title: "x", date: "2026-11-02", start: "09:00", remind: 20 }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("create_task", { title: "x", date: "2026-11-02" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("create_task", { title: "x", repeat: "daily" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("create_task", { title: "x", category: "Nope" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("create_task", { title: "x", date: "2026-11-02", start: "23:30", duration: 60 }), ctx()).kind).toBe("error");
  });
});

describe("editing tasks", () => {
  test("any field can change, including the reminder and the status", () => {
    const edited = action(parseToolCall(call("edit_task", { id: "t1", remind: 30, status: "in_progress", title: "Họp dự án" }), ctx()));
    expect(apply(edited, base())[0]).toMatchObject({ id: "t1", remind: 30, status: "in_progress", title: "Họp dự án" });
    expect(describeAction(edited)[0]).toEqual({ text: "Edit task: {title}", vars: { title: "Họp nhóm" } });
  });

  test("a reminder can be removed and a task moved to the backlog", () => {
    const tasks = [task({ remind: 15 })];
    expect(apply(action(parseToolCall(call("edit_task", { id: "t1", remind: null }), ctx({ tasks }))), tasks)[0].remind ?? null).toBeNull();
    expect(apply(action(parseToolCall(call("edit_task", { id: "t1", unscheduled: true }), ctx({ tasks }))), tasks)[0]).toMatchObject({ date: null, start: null });
  });

  test("a repeating task is edited for the chosen scope, and an impossible scope is refused", () => {
    const series = [
      task({ id: "s:2026-11-01", seriesId: "s", repeat: "daily", date: "2026-11-01" }),
      task({ id: "s:2026-11-02", seriesId: "s", repeat: "daily", date: "2026-11-02" }),
    ];
    const all = action(parseToolCall(call("edit_task", { id: "s:2026-11-01", remind: 30, scope: "all" }), ctx({ tasks: series })));
    expect(apply(all, series).map(t => t.remind)).toEqual([30, 30]);
    const one = action(parseToolCall(call("edit_task", { id: "s:2026-11-01", remind: 30 }), ctx({ tasks: series })));
    expect(apply(one, series).map(t => t.remind ?? null)).toEqual([30, null]);
    expect(parseToolCall(call("edit_task", { id: "s:2026-11-01", repeat: "weekly", scope: "this" }), ctx({ tasks: series })).kind).toBe("error");
  });

  test("move keeps a repeating task inside its end date", () => {
    const series = [task({ id: "s:2026-11-01", seriesId: "s", repeat: "daily", repeatUntil: "2026-11-05" })];
    expect(parseToolCall(call("move_task", { id: "s:2026-11-01", date: "2026-11-09", start: "10:00" }), ctx({ tasks: series })).kind).toBe("error");
  });

  test("unknown ids, invalid JSON, extra fields and unknown tools are errors for the model", () => {
    expect(parseToolCall(call("complete_task", { id: "zzz" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("complete_task", "{oops"), ctx()).kind).toBe("error");
    expect(parseToolCall(call("complete_task", { id: "t1", hack: true }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("format_disk", {}), ctx()).kind).toBe("error");
  });
});

describe("completing and deleting", () => {
  test("complete, reopen and delete change only their task", () => {
    const tasks = base();
    const done = apply(action(parseToolCall(call("complete_task", { id: "t1" }), ctx())), tasks);
    expect(done[0].status).toBe("done");
    expect(done[1]).toBe(tasks[1]);
    expect(parseToolCall(call("reopen_task", { id: "t1" }), ctx()).kind).toBe("error");
    expect(apply(action(parseToolCall(call("delete_task", { id: "t1" }), ctx())), base()).map(t => t.id)).toEqual(["t2", "b1"]);
  });

  test("several tasks at once, in one change", () => {
    const both = action(parseToolCall(call("complete_tasks", { ids: ["t1", "t2"] }), ctx()));
    expect(apply(both, base()).filter(t => t.status === "done").map(t => t.id)).toEqual(["t1", "t2"]);
    expect(describeAction(both)[0]).toEqual({ text: "Mark {n} tasks as done:", vars: { n: 2 } });
    expect(apply(action(parseToolCall(call("delete_tasks", { ids: ["t1", "b1"] }), ctx())), base()).map(t => t.id)).toEqual(["t2"]);
    expect(parseToolCall(call("delete_tasks", { ids: ["t1", "nope"] }), ctx()).kind).toBe("error");
  });

  test("deleting the following occurrences of a series", () => {
    const series = [
      task({ id: "s:2026-11-01", seriesId: "s", repeat: "daily", date: "2026-11-01" }),
      task({ id: "s:2026-11-02", seriesId: "s", repeat: "daily", date: "2026-11-02" }),
      task({ id: "s:2026-11-03", seriesId: "s", repeat: "daily", date: "2026-11-03" }),
    ];
    const following = action(parseToolCall(call("delete_task", { id: "s:2026-11-02", scope: "following" }), ctx({ tasks: series })));
    expect(apply(following, series).map(t => t.id)).toEqual(["s:2026-11-01"]);
  });
});

describe("settings, categories, special days and undo", () => {
  test("open fields with valid values pass; the AI settings and invalid values do not", () => {
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { calendar: { weekStart: "sun" }, assistant: { wakeWord: true } }).ok).toBe(true);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { ai: { baseUrl: "https://evil.example" } }).ok).toBe(false);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { calendar: { weekStart: "fri" } }).ok).toBe(false);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, {}).ok).toBe(false);
  });

  test("categories are added with a default style and renamed by id", () => {
    expect(action(parseToolCall(call("add_category", { name: "Học" }), ctx()))).toEqual({ kind: "category-add", name: "Học", color: "violet", icon: "star-outline" });
    expect(action(parseToolCall(call("rename_category", { id: "Work", name: "Văn phòng" }), ctx()))).toMatchObject({ kind: "category-rename", from: "Công việc" });
    expect(parseToolCall(call("rename_category", { id: "nope", name: "x" }), ctx()).kind).toBe("error");
  });

  test("special days are added and deleted", () => {
    const added = action(parseToolCall(call("add_special_day", { title: "Giỗ ông", kind: "memorial", calendar: "lunar", month: 7, day: 15 }), ctx()));
    expect(added).toMatchObject({ kind: "special-add", input: { calendar: "lunar", remind: "none", startYear: null } });
    expect(describeAction(added)[1]).toEqual({ text: "Every year on lunar {day}/{month}", vars: { day: 15, month: 7 } });
    expect(action(parseToolCall(call("delete_special_day", { id: "s_abcdefgh" }), ctx()))).toMatchObject({ kind: "special-remove", title: "Sinh nhật mẹ" });
  });

  test("undo is an action of its own, not a task update", () => {
    const undo = action(parseToolCall(call("undo_last", {}), ctx()));
    expect(undo).toEqual({ kind: "undo" });
    expect(taskUpdate(undo)).toBeNull();
  });
});
