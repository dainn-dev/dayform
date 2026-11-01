import { z } from "zod";
import { dateKey, minutes, reminderOptions, repeats, type Repeat, type Status, type Task } from "./planner";
import { resolveSettings, type DeepPartial, type Settings } from "./settings";
import { allowedScopes, planDelete, planSave, RULE_CHANGE_MESSAGE, validateForm, type SaveForm } from "./task-save";
import type { EditScope } from "./recurrence";
import { COLOR_SLOTS, ICON_KEYS, type ColorSlot, type IconKey } from "./categories";
import { SPECIAL_CALENDARS, SPECIAL_KINDS, SPECIAL_REMINDS, type SpecialDay, type SpecialDayInput } from "./special-days";
import type { ToolCall } from "./ai-stream";

/**
 * The tools the AI may call (framework-free, tested). Reading runs at once; **every change is shown to the user and
 * runs only after they agree** (the owner's choice). Task changes go through the task editor's own planning
 * (`planSave` / `planDelete`), so reminders, repeating series and their scopes behave exactly as when the user edits by
 * hand, and land in one undoable `mutate`. Arguments come from a model and are never trusted: each is checked here, and
 * a call that fails a check returns an error to the model instead of touching data. Off limits: the period tracker,
 * backups / imports / recovery, and the AI settings and keys (a hostile task title must not be able to send the user's
 * data elsewhere or wipe it).
 */

export type Line = { text: string; vars?: Record<string, string | number> };
export type CategoryRef = { id: string; name: string };

export type Action =
  | { kind: "tasks"; update: (tasks: Task[]) => Task[]; lines: Line[] }
  | { kind: "settings"; changes: DeepPartial<Settings>; paths: string[] }
  | { kind: "language"; language: "en" | "vi" }
  | { kind: "category-add"; name: string; color: ColorSlot; icon: IconKey }
  | { kind: "category-rename"; id: string; from: string; name: string }
  | { kind: "special-add"; input: SpecialDayInput }
  | { kind: "special-remove"; id: string; title: string }
  | { kind: "undo" };

const MAX_RANGE_DAYS = 31;
const MAX_LISTED = 80;
const MAX_TITLE = 120;
const MAX_NOTES = 1000;
const MAX_BULK = 30;
const STATUSES = ["todo", "in_progress", "done"] as const;
const SCOPES = ["this", "following", "all"] as const;

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}, "not a real date");
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const duration = z.number().int().min(1).max(1440);
const title = z.string().trim().min(1).max(MAX_TITLE);
const id = z.string().min(1).max(200);
const remind = z.number().int().refine(value => (reminderOptions as readonly number[]).includes(value), `one of ${reminderOptions.join(", ")}`).nullable();
const repeat = z.enum(repeats as unknown as [Repeat, ...Repeat[]]);

const SCHEMAS = {
  list_tasks: z.object({ from: dateText, to: dateText, include_backlog: z.boolean().optional() }).strict(),
  get_settings: z.object({}).strict(),
  list_special_days: z.object({}).strict(),
  create_task: z.object({
    title, date: dateText.optional(), start: timeText.optional(), duration: duration.optional(),
    category: z.string().max(60).optional(), notes: z.string().max(MAX_NOTES).optional(),
    remind: remind.optional(), repeat: repeat.optional(), repeat_until: dateText.optional(), status: z.enum(STATUSES).optional(),
  }).strict(),
  edit_task: z.object({
    id, title: title.optional(), duration: duration.optional(), notes: z.string().max(MAX_NOTES).optional(),
    category: z.string().max(60).optional(), date: dateText.optional(), start: timeText.optional(), unscheduled: z.boolean().optional(),
    status: z.enum(STATUSES).optional(), remind: remind.optional(), repeat: z.union([repeat, z.literal("none")]).optional(),
    repeat_until: dateText.nullable().optional(), scope: z.enum(SCOPES).optional(),
  }).strict(),
  complete_task: z.object({ id }).strict(),
  reopen_task: z.object({ id }).strict(),
  move_task: z.object({ id, date: dateText, start: timeText, scope: z.enum(SCOPES).optional() }).strict(),
  delete_task: z.object({ id, scope: z.enum(SCOPES).optional() }).strict(),
  complete_tasks: z.object({ ids: z.array(id).min(1).max(MAX_BULK) }).strict(),
  delete_tasks: z.object({ ids: z.array(id).min(1).max(MAX_BULK) }).strict(),
  update_settings: z.object({ changes: z.record(z.string(), z.unknown()) }).strict(),
  set_language: z.object({ language: z.enum(["en", "vi"]) }).strict(),
  add_category: z.object({ name: z.string().trim().min(1).max(40), color: z.enum(COLOR_SLOTS).optional(), icon: z.enum(ICON_KEYS).optional() }).strict(),
  rename_category: z.object({ id, name: z.string().trim().min(1).max(40) }).strict(),
  add_special_day: z.object({
    title: z.string().trim().min(1).max(60), kind: z.enum(SPECIAL_KINDS), calendar: z.enum(SPECIAL_CALENDARS),
    month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31),
    start_year: z.number().int().min(1900).max(2100).optional(), remind: z.enum(SPECIAL_REMINDS).optional(),
  }).strict(),
  delete_special_day: z.object({ id }).strict(),
  undo_last: z.object({}).strict(),
} as const;
export type ToolName = keyof typeof SCHEMAS;

/** Settings the AI may change, by top-level group (and, where only some fields are open, which ones). Never `ai`. */
const OPEN_SETTINGS: Record<string, readonly string[] | "all"> = {
  profile: ["name"],
  accent: "all",
  defaults: "all",
  notifications: "all",
  greeting: "all",
  calendar: "all",
  habits: "all",
  widget: "all",
  pet: "all",
  assistant: ["enabled", "name", "voice", "voiceId", "wakeWord"],
  updates: "all",
};

const param = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const DATE = { type: "string", description: "Local date YYYY-MM-DD" };
const TIME = { type: "string", description: "Local time HH:mm, 24-hour" };
const REMIND = { type: ["integer", "null"], enum: [...reminderOptions, null], description: "Minutes before the start to remind (0 = at the start); null = no reminder" };
const REPEAT = { type: "string", enum: [...repeats], description: "Repeat rule" };
const SCOPE = { type: "string", enum: [...SCOPES], description: "For a repeating task: this occurrence only, this and the following ones, or all (default this)" };
const STATUS = { type: "string", enum: [...STATUSES] };

/** The tool list sent with every request, in the OpenAI function format; its order never changes (provider caches). */
export const TOOL_DEFINITIONS = [
  { name: "list_tasks", description: "List the user's tasks between two dates (at most 31 days). Use before answering about tasks or changing one.", parameters: param({ from: DATE, to: DATE, include_backlog: { type: "boolean", description: "Also list unscheduled tasks" } }, ["from", "to"]) },
  { name: "get_settings", description: "Read the app settings the assistant may change, and the categories.", parameters: param({}) },
  { name: "list_special_days", description: "List the user's special days (birthdays, anniversaries, memorials).", parameters: param({}) },
  { name: "create_task", description: "Create a task. Without date and start it goes to the backlog. Can set a reminder, a repeat rule (with an end date) and a status.", parameters: param({ title: { type: "string" }, date: DATE, start: TIME, duration: { type: "integer", description: "Minutes, 1..1440" }, category: { type: "string", description: "Category name or id" }, notes: { type: "string" }, remind: REMIND, repeat: REPEAT, repeat_until: DATE, status: STATUS }, ["title"]) },
  { name: "edit_task", description: "Change any field of a task: title, duration, notes, category, date and start, unscheduled (move to the backlog), status, reminder, repeat rule ('none' stops repeating) and its end date. For a repeating task choose the scope.", parameters: param({ id: { type: "string" }, title: { type: "string" }, duration: { type: "integer" }, notes: { type: "string" }, category: { type: "string" }, date: DATE, start: TIME, unscheduled: { type: "boolean" }, status: STATUS, remind: REMIND, repeat: { type: "string", enum: [...repeats, "none"] }, repeat_until: { type: ["string", "null"], description: "End date YYYY-MM-DD, null = never ends" }, scope: SCOPE }, ["id"]) },
  { name: "complete_task", description: "Mark a task done.", parameters: param({ id: { type: "string" } }, ["id"]) },
  { name: "reopen_task", description: "Mark a done task as not done.", parameters: param({ id: { type: "string" } }, ["id"]) },
  { name: "move_task", description: "Move a task to another date and start time.", parameters: param({ id: { type: "string" }, date: DATE, start: TIME, scope: SCOPE }, ["id", "date", "start"]) },
  { name: "delete_task", description: "Delete a task; for a repeating task choose the scope.", parameters: param({ id: { type: "string" }, scope: SCOPE }, ["id"]) },
  { name: "complete_tasks", description: "Mark several tasks done at once (at most 30).", parameters: param({ ids: { type: "array", items: { type: "string" } } }, ["ids"]) },
  { name: "delete_tasks", description: "Delete several tasks at once (at most 30; only these occurrences of repeating tasks).", parameters: param({ ids: { type: "array", items: { type: "string" } } }, ["ids"]) },
  { name: "update_settings", description: "Change app settings. `changes` is a partial settings object with the same shape get_settings returns.", parameters: param({ changes: { type: "object" } }, ["changes"]) },
  { name: "set_language", description: "Switch the app language.", parameters: param({ language: { type: "string", enum: ["en", "vi"] } }, ["language"]) },
  { name: "add_category", description: "Add a task category.", parameters: param({ name: { type: "string" }, color: { type: "string", enum: [...COLOR_SLOTS] }, icon: { type: "string", enum: [...ICON_KEYS] } }, ["name"]) },
  { name: "rename_category", description: "Rename a category.", parameters: param({ id: { type: "string" }, name: { type: "string" } }, ["id", "name"]) },
  { name: "add_special_day", description: "Add a yearly special day on a solar or lunar date.", parameters: param({ title: { type: "string" }, kind: { type: "string", enum: [...SPECIAL_KINDS] }, calendar: { type: "string", enum: [...SPECIAL_CALENDARS] }, month: { type: "integer" }, day: { type: "integer" }, start_year: { type: "integer" }, remind: { type: "string", enum: [...SPECIAL_REMINDS] } }, ["title", "kind", "calendar", "month", "day"]) },
  { name: "delete_special_day", description: "Delete a special day.", parameters: param({ id: { type: "string" } }, ["id"]) },
  { name: "undo_last", description: "Undo the last change made to the tasks (also one made by hand).", parameters: param({}) },
].map(fn => ({ type: "function" as const, function: fn }));

export type ToolContext = {
  tasks: readonly Task[];
  settings: Settings;
  categories: readonly CategoryRef[];
  specialDays?: readonly SpecialDay[];
  /** False keeps task titles and notes from being sent to the provider ("Share task titles" off). */
  shareTitles: boolean;
  now: Date;
  newId: () => string;
  newSeriesId?: () => string;
  /** Formats a stored HH:mm for the confirmation card. */
  time?: (value: string) => string;
};

export type Parsed =
  | { kind: "read"; result: unknown }
  | { kind: "action"; action: Action }
  | { kind: "error"; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map(key => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
}

function resolveCategory(raw: string | undefined, categories: readonly CategoryRef[]): string | null {
  if (!raw) return null;
  const wanted = raw.trim().toLowerCase();
  const found = categories.find(c => c.id.toLowerCase() === wanted || c.name.toLowerCase() === wanted);
  return found ? found.id : null;
}

function categoryName(categoryId: string, categories: readonly CategoryRef[]): string {
  return categories.find(c => c.id === categoryId)?.name ?? categoryId;
}

/** The settings the AI may see and change: only the open groups and fields. */
export function openSettings(settings: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [group, fields] of Object.entries(OPEN_SETTINGS)) {
    const value = (settings as unknown as Record<string, unknown>)[group];
    if (fields === "all" || !isRecord(value)) out[group] = value;
    else out[group] = Object.fromEntries(fields.map(field => [field, value[field]]));
  }
  return out;
}

function leafPaths(value: unknown, prefix: string): string[] {
  if (!isRecord(value)) return [prefix];
  return Object.entries(value).flatMap(([key, inner]) => leafPaths(inner, prefix ? `${prefix}.${key}` : key));
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((at, key) => (isRecord(at) ? at[key] : undefined), value);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = deepMerge(base[key], value);
  return out;
}

/**
 * Checks a settings patch: every changed field must be open to the AI and survive the settings schema unchanged (a
 * value the schema would replace with a default is refused rather than silently changed).
 */
export function checkSettingsChanges(settings: Settings, changes: Record<string, unknown>): { ok: true; paths: string[] } | { ok: false; message: string } {
  const paths = leafPaths(changes, "");
  if (paths.length === 0 || (paths.length === 1 && paths[0] === "")) return { ok: false, message: "No settings to change." };
  for (const path of paths) {
    const [group, field] = path.split(".");
    const open = OPEN_SETTINGS[group];
    if (!open) return { ok: false, message: `The setting ${path} cannot be changed by the assistant.` };
    if (open !== "all" && (!field || !open.includes(field))) return { ok: false, message: `The setting ${path} cannot be changed by the assistant.` };
  }
  const merged = deepMerge(settings, changes);
  const resolved = resolveSettings(merged);
  for (const path of paths) {
    if (JSON.stringify(getPath(resolved, path)) !== JSON.stringify(getPath(merged, path))) {
      return { ok: false, message: `The value for ${path} is not allowed.` };
    }
  }
  return { ok: true, paths };
}

function taskView(task: Task, ctx: ToolContext) {
  return {
    id: task.id,
    title: ctx.shareTitles ? task.title : "(hidden)",
    date: task.date,
    start: task.start,
    duration: task.duration,
    status: task.status,
    category: categoryName(task.category, ctx.categories),
    remind: task.remind ?? null,
    repeat: task.repeat ?? null,
    repeat_until: task.repeatUntil ?? null,
    repeating: task.seriesId ? true : undefined,
  };
}

const REPEAT_LINES: Record<Repeat, string> = {
  daily: "Repeats every day",
  weekdays: "Repeats on weekdays",
  weekly: "Repeats every week",
  monthly: "Repeats every month",
};
const STATUS_LINES: Record<Status, string> = {
  todo: "Status: to do",
  in_progress: "Status: in progress",
  done: "Status: done",
};
const SCOPE_LINES: Record<EditScope, string> = {
  this: "Applies to this occurrence only",
  following: "Applies to this and the following occurrences",
  all: "Applies to every occurrence",
};

function remindLine(value: number | null | undefined): Line {
  if (value === null || value === undefined) return { text: "No reminder" };
  return value === 0 ? { text: "Reminder at the start" } : { text: "Reminder {minutes} min before", vars: { minutes: value } };
}

/** The confirmation lines of a saved task (new, or what an edit changes). */
function saveLines(candidate: Task, existing: Task | null, scope: EditScope, ctx: ToolContext): Line[] {
  const time = ctx.time ?? ((value: string) => value);
  const lines: Line[] = existing
    ? [{ text: "Edit task: {title}", vars: { title: existing.title } }]
    : [{ text: "Create task: {title}", vars: { title: candidate.title } }];
  const changed = <K extends keyof Task>(key: K) => !existing || JSON.stringify(existing[key] ?? null) !== JSON.stringify(candidate[key] ?? null);
  if (existing && changed("title")) lines.push({ text: "New title: {value}", vars: { value: candidate.title } });
  if (changed("date") || changed("start") || changed("duration")) {
    if (candidate.date && candidate.start) lines.push({ text: "On {date} at {time}, {minutes} min", vars: { date: candidate.date, time: time(candidate.start), minutes: candidate.duration } });
    else lines.push({ text: "In the backlog, {minutes} min", vars: { minutes: candidate.duration } });
  }
  if (changed("category")) lines.push({ text: "Category: {category}", vars: { category: categoryName(candidate.category, ctx.categories) } });
  if (changed("status") && (existing || candidate.status !== "todo")) lines.push({ text: STATUS_LINES[candidate.status] });
  if (changed("remind") && candidate.date) lines.push(remindLine(candidate.remind));
  if (changed("repeat") || changed("repeatUntil")) {
    if (candidate.repeat) {
      lines.push({ text: REPEAT_LINES[candidate.repeat] });
      if (candidate.repeatUntil) lines.push({ text: "Until {date}", vars: { date: candidate.repeatUntil } });
    } else if (existing?.repeat) {
      lines.push({ text: "Stops repeating" });
    }
  }
  if (existing && changed("notes")) lines.push({ text: "New notes" });
  if (existing?.seriesId) lines.push({ text: SCOPE_LINES[scope] });
  return lines;
}

/** Plans a create or an edit through the editor's own `planSave`; an error message for the model when it cannot. */
function planTaskSave(form: SaveForm, existing: Task | null, scope: EditScope, ctx: ToolContext): Parsed {
  const invalid = validateForm({
    title: form.title, duration: String(form.duration), scheduled: form.scheduled, date: form.date, time: form.time,
    repeat: form.repeat, repeatUntil: form.repeatUntil,
  });
  if (invalid) return { kind: "error", message: invalid };
  if (existing) {
    const allowed = allowedScopes(existing, { repeat: form.scheduled ? form.repeat : null, repeatUntil: form.repeatUntil });
    if (!allowed.includes(scope)) return { kind: "error", message: `Scope "${scope}" is not possible here; use one of: ${allowed.join(", ")}.` };
  }
  const plan = planSave(form, {
    existing, scope, today: dateKey(ctx.now), newId: ctx.newId,
    newSeriesId: ctx.newSeriesId ?? (() => `series-${ctx.now.getTime()}-${Math.random().toString(36).slice(2, 8)}`),
    nowIso: ctx.now.toISOString(),
  });
  if (!plan.ok) return { kind: "error", message: RULE_CHANGE_MESSAGE };
  return { kind: "action", action: { kind: "tasks", update: plan.update, lines: saveLines(plan.candidate, existing, scope, ctx) } };
}

/** Turns one tool call into a read result, an action to confirm, or an error for the model. */
export function parseToolCall(call: ToolCall, ctx: ToolContext): Parsed {
  const name = call.function.name as ToolName;
  const schema = SCHEMAS[name];
  if (!schema) return { kind: "error", message: `Unknown tool ${call.function.name}.` };
  let raw: unknown;
  try {
    raw = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
  } catch {
    return { kind: "error", message: "The arguments are not valid JSON." };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { kind: "error", message: `Invalid arguments: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "input"} ${issue.message}`).join("; ")}` };
  const args = parsed.data as Record<string, unknown>;
  const find = (taskId: string) => ctx.tasks.find(task => task.id === taskId) ?? null;
  const missing: Parsed = { kind: "error", message: "No task has that id. Call list_tasks first." };

  switch (name) {
    case "list_tasks": {
      const from = args.from as string;
      const to = args.to as string;
      const span = daysBetween(from, to);
      if (span < 0 || span > MAX_RANGE_DAYS) return { kind: "error", message: `The range must be 0..${MAX_RANGE_DAYS} days.` };
      const listed = ctx.tasks
        .filter(task => (task.date !== null && task.date >= from && task.date <= to) || (args.include_backlog === true && task.date === null))
        .sort((a, b) => `${a.date ?? "9999"}${a.start ?? ""}`.localeCompare(`${b.date ?? "9999"}${b.start ?? ""}`));
      return { kind: "read", result: { tasks: listed.slice(0, MAX_LISTED).map(task => taskView(task, ctx)), more: Math.max(0, listed.length - MAX_LISTED) } };
    }
    case "get_settings":
      return { kind: "read", result: { settings: openSettings(ctx.settings), categories: ctx.categories.map(c => ({ id: c.id, name: c.name })) } };
    case "list_special_days":
      return { kind: "read", result: { specialDays: (ctx.specialDays ?? []).map(day => ({ ...day, title: ctx.shareTitles ? day.title : "(hidden)" })) } };
    case "create_task": {
      const date = (args.date as string | undefined) ?? null;
      const start = (args.start as string | undefined) ?? null;
      if ((date === null) !== (start === null)) return { kind: "error", message: "Give both date and start, or neither for the backlog." };
      const category = args.category === undefined ? ctx.settings.defaults.category : resolveCategory(args.category as string, ctx.categories);
      if (category === null) return { kind: "error", message: "Unknown category. Call get_settings to see the categories." };
      if (date === null && (args.repeat !== undefined || args.remind !== undefined)) return { kind: "error", message: "A backlog task can neither repeat nor remind; give a date and start." };
      const form: SaveForm = {
        title: (args.title as string).trim(),
        duration: (args.duration as number | undefined) ?? ctx.settings.defaults.duration,
        scheduled: date !== null,
        date: date ?? dateKey(ctx.now),
        time: start ?? ctx.settings.defaults.startFixed,
        category,
        status: (args.status as Status | undefined) ?? "todo",
        notes: (args.notes as string | undefined) ?? "",
        remind: args.remind === undefined ? ctx.settings.defaults.remind : (args.remind as number | null),
        repeat: (args.repeat as Repeat | undefined) ?? null,
        repeatUntil: (args.repeat_until as string | undefined) ?? null,
      };
      return planTaskSave(form, null, "this", ctx);
    }
    case "edit_task":
    case "move_task": {
      const task = find(args.id as string);
      if (!task) return missing;
      let category = task.category;
      if (args.category !== undefined) {
        const found = resolveCategory(args.category as string, ctx.categories);
        if (found === null) return { kind: "error", message: "Unknown category. Call get_settings to see the categories." };
        category = found;
      }
      const date = (args.date as string | undefined) ?? task.date;
      const start = (args.start as string | undefined) ?? task.start;
      const scheduled = args.unscheduled === true ? false : date !== null;
      const repeatArg = args.repeat as Repeat | "none" | undefined;
      const form: SaveForm = {
        title: (args.title as string | undefined)?.trim() ?? task.title,
        duration: (args.duration as number | undefined) ?? task.duration,
        scheduled,
        date: date ?? dateKey(ctx.now),
        time: start ?? ctx.settings.defaults.startFixed,
        category,
        status: (args.status as Status | undefined) ?? task.status,
        notes: (args.notes as string | undefined) ?? task.notes,
        remind: args.remind === undefined ? task.remind ?? null : (args.remind as number | null),
        repeat: repeatArg === undefined ? task.repeat ?? null : repeatArg === "none" ? null : repeatArg,
        repeatUntil: args.repeat_until === undefined ? task.repeatUntil ?? null : (args.repeat_until as string | null),
      };
      return planTaskSave(form, task, (args.scope as EditScope | undefined) ?? "this", ctx);
    }
    case "complete_task":
    case "reopen_task": {
      const task = find(args.id as string);
      if (!task) return missing;
      const done = name === "complete_task";
      if (done && task.status === "done") return { kind: "error", message: "That task is already done." };
      if (!done && task.status !== "done") return { kind: "error", message: "That task is not done." };
      return {
        kind: "action",
        action: {
          kind: "tasks",
          update: tasks => tasks.map(t => (t.id === task.id ? { ...t, status: done ? "done" : "todo" } : t)),
          lines: [{ text: done ? "Mark as done: {title}" : "Mark as not done: {title}", vars: { title: task.title } }],
        },
      };
    }
    case "delete_task": {
      const task = find(args.id as string);
      if (!task) return missing;
      const scope = (args.scope as EditScope | undefined) ?? "this";
      const plan = planDelete(task, task.seriesId ? scope : "this");
      const lines: Line[] = [{ text: "Delete task: {title}", vars: { title: task.title } }];
      if (task.seriesId) lines.push({ text: SCOPE_LINES[scope] });
      return { kind: "action", action: { kind: "tasks", update: plan.kind === "remove" ? tasks => tasks.filter(t => t.id !== plan.id) : plan.update, lines } };
    }
    case "complete_tasks":
    case "delete_tasks": {
      const ids = [...new Set(args.ids as string[])];
      const found = ids.map(find);
      if (found.some(task => task === null)) return { kind: "error", message: "Some ids are not tasks. Call list_tasks first." };
      const chosen = found as Task[];
      const done = name === "complete_tasks";
      const lines: Line[] = [
        { text: done ? "Mark {n} tasks as done:" : "Delete {n} tasks:", vars: { n: chosen.length } },
        ...chosen.map(task => ({ text: "• {title}", vars: { title: task.title } })),
      ];
      const update = done
        ? (tasks: Task[]) => tasks.map(t => (ids.includes(t.id) ? { ...t, status: "done" as const } : t))
        : (tasks: Task[]) => chosen.reduce((list, task) => {
          const plan = planDelete(task, "this");
          return plan.kind === "remove" ? list.filter(t => t.id !== plan.id) : plan.update(list);
        }, tasks);
      return { kind: "action", action: { kind: "tasks", update, lines } };
    }
    case "update_settings": {
      const changes = args.changes as Record<string, unknown>;
      const check = checkSettingsChanges(ctx.settings, changes);
      if (!check.ok) return { kind: "error", message: check.message };
      return { kind: "action", action: { kind: "settings", changes: changes as DeepPartial<Settings>, paths: check.paths } };
    }
    case "set_language":
      return { kind: "action", action: { kind: "language", language: args.language as "en" | "vi" } };
    case "add_category":
      return { kind: "action", action: { kind: "category-add", name: (args.name as string).trim(), color: (args.color as ColorSlot | undefined) ?? "violet", icon: (args.icon as IconKey | undefined) ?? "star-outline" } };
    case "rename_category": {
      const existing = ctx.categories.find(c => c.id === args.id);
      if (!existing) return { kind: "error", message: "No category has that id. Call get_settings first." };
      return { kind: "action", action: { kind: "category-rename", id: existing.id, from: existing.name, name: (args.name as string).trim() } };
    }
    case "add_special_day":
      return {
        kind: "action",
        action: {
          kind: "special-add",
          input: {
            title: (args.title as string).trim(), kind: args.kind as SpecialDayInput["kind"], calendar: args.calendar as SpecialDayInput["calendar"],
            month: args.month as number, day: args.day as number, startYear: (args.start_year as number | undefined) ?? null,
            remind: (args.remind as SpecialDayInput["remind"] | undefined) ?? "none",
          },
        },
      };
    case "delete_special_day": {
      const day = (ctx.specialDays ?? []).find(item => item.id === args.id);
      if (!day) return { kind: "error", message: "No special day has that id. Call list_special_days first." };
      return { kind: "action", action: { kind: "special-remove", id: day.id, title: day.title } };
    }
    case "undo_last":
      return { kind: "action", action: { kind: "undo" } };
  }
}

/** The change an agreed task action makes, as one `mutate` update (undoable); null for the other kinds. */
export function taskUpdate(action: Action): ((tasks: Task[]) => Task[]) | null {
  return action.kind === "tasks" ? action.update : null;
}

/**
 * What the confirmation card says, as translatable lines. Titles are user content and go in as values. `time` formats
 * an HH:mm in the user's 12/24-hour setting (task lines were already built with it).
 */
export function describeAction(action: Action, _ctx?: { categories: readonly CategoryRef[]; time: (value: string) => string }): Line[] {
  switch (action.kind) {
    case "tasks":
      return action.lines;
    case "settings":
      return [{ text: "Change settings:" }, ...action.paths.map(path => ({ text: "{path} → {value}", vars: { path, value: JSON.stringify(getPath(action.changes, path)) } }))];
    case "language":
      return [{ text: "Switch the language to {language}", vars: { language: action.language === "vi" ? "Tiếng Việt" : "English" } }];
    case "category-add":
      return [{ text: "Add category: {name}", vars: { name: action.name } }];
    case "category-rename":
      return [{ text: "Rename category {from} to {name}", vars: { from: action.from, name: action.name } }];
    case "special-add": {
      const { input } = action;
      return [
        { text: "Add special day: {title}", vars: { title: input.title } },
        { text: input.calendar === "lunar" ? "Every year on lunar {day}/{month}" : "Every year on {day}/{month}", vars: { day: input.day, month: input.month } },
      ];
    }
    case "special-remove":
      return [{ text: "Delete special day: {title}", vars: { title: action.title } }];
    case "undo":
      return [{ text: "Undo the last change to the tasks" }];
  }
}

/** Today's key, for the prompt and for defaults. */
export function todayKey(now: Date): string {
  return dateKey(now);
}

/** Every text a confirmation card can show, for the translation check. */
export const CARD_TEXTS: readonly string[] = [
  "Create task: {title}", "Edit task: {title}", "New title: {value}", "On {date} at {time}, {minutes} min", "In the backlog, {minutes} min",
  "Category: {category}", ...Object.values(STATUS_LINES), "No reminder", "Reminder at the start", "Reminder {minutes} min before",
  ...Object.values(REPEAT_LINES), "Until {date}", "Stops repeating", "New notes", ...Object.values(SCOPE_LINES),
  "Mark as done: {title}", "Mark as not done: {title}", "Delete task: {title}", "Mark {n} tasks as done:", "Delete {n} tasks:", "• {title}",
  "Change settings:", "{path} → {value}", "Switch the language to {language}", "Add category: {name}", "Rename category {from} to {name}",
  "Add special day: {title}", "Every year on lunar {day}/{month}", "Every year on {day}/{month}", "Delete special day: {title}",
  "Undo the last change to the tasks",
];

export const AI_TOOL_NAMES = Object.keys(SCHEMAS) as ToolName[];

/** Minutes of a stored HH:mm, re-exported for the prompt's "now". */
export { minutes };
