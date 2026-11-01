import { describe, expect, test } from "bun:test";
import { AI_TOOL_NAMES, checkSettingsChanges, describeAction, openSettings, parseToolCall, taskUpdate, TOOL_DEFINITIONS, type Action, type ToolContext } from "./ai-tools";
import type { ToolCall } from "./ai-stream";
import type { Task } from "./planner";
import { DEFAULT_SETTINGS } from "./settings";

const task = (over: Partial<Task>): Task => ({
  id: "t1", title: "Họp nhóm", date: "2026-11-01", start: "09:00", duration: 60, status: "todo",
  category: "Work", notes: "", createdAt: "2026-10-01T00:00:00.000Z", ...over,
});
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  tasks: [task({}), task({ id: "t2", title: "Chạy bộ", start: "18:00", category: "Wellness" }), task({ id: "b1", title: "Đọc sách", date: null, start: null })],
  settings: DEFAULT_SETTINGS,
  categories: [{ id: "Focus", name: "Focus" }, { id: "Work", name: "Công việc" }, { id: "Wellness", name: "Sức khỏe" }],
  shareTitles: true,
  now: new Date(2026, 10, 1, 8, 0),
  newId: () => "new-1",
  ...over,
});
const call = (name: string, args: unknown): ToolCall => ({ id: "c", type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
const action = (parsed: ReturnType<typeof parseToolCall>): Action => {
  if (parsed.kind !== "action") throw new Error(`expected an action, got ${JSON.stringify(parsed)}`);
  return parsed.action;
};

describe("tool definitions", () => {
  test("every defined tool has a schema and the other way round", () => {
    expect(TOOL_DEFINITIONS.map(tool => tool.function.name).sort()).toEqual([...AI_TOOL_NAMES].sort());
  });
});

describe("reading", () => {
  test("list_tasks returns the tasks of the range, by date and time, and the backlog on request", () => {
    const read = parseToolCall(call("list_tasks", { from: "2026-11-01", to: "2026-11-01", include_backlog: true }), ctx());
    expect(read.kind).toBe("read");
    const tasks = (read as { result: { tasks: { id: string; category: string }[] } }).result.tasks;
    expect(tasks.map(t => t.id)).toEqual(["t1", "t2", "b1"]);
    expect(tasks[0].category).toBe("Công việc");
  });

  test("titles stay on the phone when sharing is off", () => {
    const read = parseToolCall(call("list_tasks", { from: "2026-11-01", to: "2026-11-01" }), ctx({ shareTitles: false }));
    expect(JSON.stringify(read)).not.toContain("Họp nhóm");
  });

  test("too long a range or a fake date is refused", () => {
    expect(parseToolCall(call("list_tasks", { from: "2026-01-01", to: "2026-12-31" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("list_tasks", { from: "2026-02-30", to: "2026-03-01" }), ctx()).kind).toBe("error");
  });

  test("get_settings shows only the open groups, never the AI settings", () => {
    const shown = openSettings(DEFAULT_SETTINGS);
    expect(Object.keys(shown)).not.toContain("ai");
    expect(shown.assistant).toEqual({ name: DEFAULT_SETTINGS.assistant.name, voice: DEFAULT_SETTINGS.assistant.voice });
  });
});

describe("changes are checked before they are offered", () => {
  test("create_task fills defaults and resolves a category by its shown name", () => {
    const created = action(parseToolCall(call("create_task", { title: " Gọi mẹ ", date: "2026-11-02", start: "20:00", category: "sức khỏe" }), ctx()));
    expect(created).toMatchObject({ kind: "create", task: { id: "new-1", title: "Gọi mẹ", duration: DEFAULT_SETTINGS.defaults.duration, category: "Wellness", status: "todo" } });
  });

  test("create_task without a time goes to the backlog; half a time, midnight crossing or an unknown category is refused", () => {
    expect(action(parseToolCall(call("create_task", { title: "Ý tưởng" }), ctx()))).toMatchObject({ task: { date: null, start: null, remind: null } });
    expect(parseToolCall(call("create_task", { title: "x", date: "2026-11-02" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("create_task", { title: "x", date: "2026-11-02", start: "23:30", duration: 60 }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("create_task", { title: "x", category: "Nope" }), ctx()).kind).toBe("error");
  });

  test("unknown ids, invalid JSON, extra fields and unknown tools are errors for the model", () => {
    expect(parseToolCall(call("complete_task", { id: "zzz" }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("complete_task", "{oops"), ctx()).kind).toBe("error");
    expect(parseToolCall(call("complete_task", { id: "t1", hack: true }), ctx()).kind).toBe("error");
    expect(parseToolCall(call("format_disk", {}), ctx()).kind).toBe("error");
  });

  test("completing a done task or reopening an open one is refused", () => {
    expect(parseToolCall(call("complete_task", { id: "t1" }), ctx({ tasks: [task({ status: "done" })] })).kind).toBe("error");
    expect(parseToolCall(call("reopen_task", { id: "t1" }), ctx()).kind).toBe("error");
  });

  test("move_task keeps a repeating task inside its end date", () => {
    const series = ctx({ tasks: [task({ seriesId: "s", repeat: "daily", repeatUntil: "2026-11-05" })] });
    expect(parseToolCall(call("move_task", { id: "t1", date: "2026-11-09", start: "10:00" }), series).kind).toBe("error");
    expect(action(parseToolCall(call("move_task", { id: "t1", date: "2026-11-04", start: "10:00" }), series))).toMatchObject({ kind: "move", date: "2026-11-04" });
  });
});

describe("settings changes", () => {
  test("open fields with valid values pass", () => {
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { calendar: { weekStart: "sun" }, accent: "forest" })).toEqual({ ok: true, paths: ["calendar.weekStart", "accent"] });
  });

  test("closed groups or fields, and values the schema would replace, are refused", () => {
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { ai: { baseUrl: "https://evil.example" } }).ok).toBe(false);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { assistant: { enabled: false } }).ok).toBe(false);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { calendar: { weekStart: "fri" } }).ok).toBe(false);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, {}).ok).toBe(false);
  });
});

describe("applying agreed changes", () => {
  const tasks = ctx().tasks as Task[];

  test("create, complete, reopen, move and edit change only their task", () => {
    const created = action(parseToolCall(call("create_task", { title: "Mới" }), ctx()));
    expect(taskUpdate(created)!(tasks)).toHaveLength(4);
    const done = taskUpdate({ kind: "complete", id: "t1", title: "" })!(tasks);
    expect(done.find(t => t.id === "t1")!.status).toBe("done");
    expect(done.find(t => t.id === "t2")).toBe(tasks[1]);
    expect(taskUpdate({ kind: "move", id: "t2", title: "", date: "2026-11-03", start: "07:00" })!(tasks)[1]).toMatchObject({ date: "2026-11-03", start: "07:00" });
    expect(taskUpdate({ kind: "edit", id: "t1", title: "", changes: { duration: 30 } })!(tasks)[0].duration).toBe(30);
  });

  test("delete removes a plain task and only this occurrence of a series", () => {
    expect(taskUpdate({ kind: "delete", id: "t1", title: "" })!(tasks).map(t => t.id)).toEqual(["t2", "b1"]);
    const series = [task({ id: "s:2026-11-01", seriesId: "s", repeat: "daily" }), task({ id: "s:2026-11-02", seriesId: "s", repeat: "daily", date: "2026-11-02" })];
    expect(taskUpdate({ kind: "delete", id: "s:2026-11-01", title: "" })!(series).map(t => t.id)).toEqual(["s:2026-11-02"]);
  });

  test("settings and language are not task updates", () => {
    expect(taskUpdate({ kind: "language", language: "en" })).toBeNull();
  });
});

describe("confirmation card", () => {
  const view = { categories: ctx().categories, time: (value: string) => value };

  test("says what will happen, with the user's own title as a value", () => {
    const created = action(parseToolCall(call("create_task", { title: "Gọi mẹ", date: "2026-11-02", start: "20:00" }), ctx()));
    expect(describeAction(created, view)[0]).toEqual({ text: "Create task: {title}", vars: { title: "Gọi mẹ" } });
    const settings = action(parseToolCall(call("update_settings", { changes: { calendar: { weekStart: "sun" } } }), ctx()));
    expect(describeAction(settings, view)[1]).toEqual({ text: "{path} → {value}", vars: { path: "calendar.weekStart", value: '"sun"' } });
  });
});
