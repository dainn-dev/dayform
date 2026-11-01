import { z } from "zod";
import { dateKey, minutes, type Task } from "./planner";
import { resolveSettings, type DeepPartial, type Settings } from "./settings";
import { planDelete } from "./task-save";
import type { ToolCall } from "./ai-stream";

/**
 * The tools the AI may call (framework-free, tested). Reading runs at once; **every change is shown to the user and
 * runs only after they agree** (the owner's choice), through the app's own write paths (one `mutate` with undo for
 * tasks, `update` for settings). Arguments come from a model and are never trusted: each is checked here, and a call
 * that fails a check returns an error to the model instead of touching data. The AI cannot reach the period tracker,
 * backups, imports, the AI settings or its key.
 */

export type Line = { text: string; vars?: Record<string, string | number> };
export type CategoryRef = { id: string; name: string };

export type Action =
  | { kind: "create"; task: Task }
  | { kind: "complete" | "reopen" | "delete"; id: string; title: string }
  | { kind: "move"; id: string; title: string; date: string; start: string }
  | { kind: "edit"; id: string; title: string; changes: { title?: string; duration?: number; notes?: string; category?: string } }
  | { kind: "settings"; changes: DeepPartial<Settings>; paths: string[] }
  | { kind: "language"; language: "en" | "vi" };

const MAX_RANGE_DAYS = 31;
const MAX_LISTED = 80;
const MAX_TITLE = 120;
const MAX_NOTES = 1000;

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}, "not a real date");
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const duration = z.number().int().min(5).max(720);
const title = z.string().trim().min(1).max(MAX_TITLE);
const id = z.string().min(1).max(200);

const SCHEMAS = {
  list_tasks: z.object({ from: dateText, to: dateText, include_backlog: z.boolean().optional() }).strict(),
  get_settings: z.object({}).strict(),
  create_task: z.object({
    title, date: dateText.optional(), start: timeText.optional(), duration: duration.optional(),
    category: z.string().max(60).optional(), notes: z.string().max(MAX_NOTES).optional(),
  }).strict(),
  complete_task: z.object({ id }).strict(),
  reopen_task: z.object({ id }).strict(),
  delete_task: z.object({ id }).strict(),
  move_task: z.object({ id, date: dateText, start: timeText }).strict(),
  edit_task: z.object({ id, title: title.optional(), duration: duration.optional(), notes: z.string().max(MAX_NOTES).optional(), category: z.string().max(60).optional() }).strict(),
  update_settings: z.object({ changes: z.record(z.string(), z.unknown()) }).strict(),
  set_language: z.object({ language: z.enum(["en", "vi"]) }).strict(),
} as const;
export type ToolName = keyof typeof SCHEMAS;

/** Settings the AI may change, by top-level group (and, where only some fields are open, which ones). */
const OPEN_SETTINGS: Record<string, readonly string[] | "all"> = {
  profile: ["name"],
  accent: "all",
  defaults: "all",
  notifications: "all",
  greeting: "all",
  calendar: "all",
  habits: "all",
  widget: "all",
  pet: ["kind", "walks"],
  assistant: ["name", "voice"],
  updates: "all",
};

const param = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const DATE = { type: "string", description: "Local date YYYY-MM-DD" };
const TIME = { type: "string", description: "Local time HH:mm, 24-hour" };

/** The tool list sent with every request, in the OpenAI function format; its order never changes (provider caches). */
export const TOOL_DEFINITIONS = [
  { name: "list_tasks", description: "List the user's tasks between two dates (at most 31 days). Use before answering about tasks or changing one.", parameters: param({ from: DATE, to: DATE, include_backlog: { type: "boolean", description: "Also list unscheduled tasks" } }, ["from", "to"]) },
  { name: "get_settings", description: "Read the app settings the assistant may change.", parameters: param({}) },
  { name: "create_task", description: "Create a task. Without date and start it goes to the backlog.", parameters: param({ title: { type: "string" }, date: DATE, start: TIME, duration: { type: "integer", description: "Minutes, 5..720" }, category: { type: "string", description: "Category name or id" }, notes: { type: "string" } }, ["title"]) },
  { name: "complete_task", description: "Mark a task done.", parameters: param({ id: { type: "string" } }, ["id"]) },
  { name: "reopen_task", description: "Mark a done task as not done.", parameters: param({ id: { type: "string" } }, ["id"]) },
  { name: "delete_task", description: "Delete a task (only this occurrence of a repeating task).", parameters: param({ id: { type: "string" } }, ["id"]) },
  { name: "move_task", description: "Move a task to another date and start time.", parameters: param({ id: { type: "string" }, date: DATE, start: TIME }, ["id", "date", "start"]) },
  { name: "edit_task", description: "Change a task's title, duration, notes or category.", parameters: param({ id: { type: "string" }, title: { type: "string" }, duration: { type: "integer" }, notes: { type: "string" }, category: { type: "string" } }, ["id"]) },
  { name: "update_settings", description: "Change app settings. `changes` is a partial settings object with the same shape get_settings returns.", parameters: param({ changes: { type: "object" } }, ["changes"]) },
  { name: "set_language", description: "Switch the app language.", parameters: param({ language: { type: "string", enum: ["en", "vi"] } }, ["language"]) },
].map(fn => ({ type: "function" as const, function: fn }));

export type ToolContext = {
  tasks: readonly Task[];
  settings: Settings;
  categories: readonly CategoryRef[];
  /** False keeps task titles and notes from being sent to the provider ("Share task titles" off). */
  shareTitles: boolean;
  now: Date;
  newId: () => string;
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

function categoryName(id: string, categories: readonly CategoryRef[]): string {
  return categories.find(c => c.id === id)?.name ?? id;
}

function fitsDay(start: string, minutesLong: number): boolean {
  return minutes(start) + minutesLong <= 24 * 60;
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
    repeating: task.seriesId ? true : undefined,
  };
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
    case "create_task": {
      const date = (args.date as string | undefined) ?? null;
      const start = (args.start as string | undefined) ?? null;
      if ((date === null) !== (start === null)) return { kind: "error", message: "Give both date and start, or neither for the backlog." };
      const minutesLong = (args.duration as number | undefined) ?? ctx.settings.defaults.duration;
      if (start && !fitsDay(start, minutesLong)) return { kind: "error", message: "A task cannot cross midnight." };
      const category = args.category === undefined ? ctx.settings.defaults.category : resolveCategory(args.category as string, ctx.categories);
      if (category === null) return { kind: "error", message: "Unknown category. Call get_settings to see the categories." };
      const task: Task = {
        id: ctx.newId(), title: (args.title as string).trim(), date, start, duration: minutesLong, status: "todo",
        category, notes: (args.notes as string | undefined) ?? "", createdAt: ctx.now.toISOString(),
        remind: start ? ctx.settings.defaults.remind : null,
      };
      return { kind: "action", action: { kind: "create", task } };
    }
    case "complete_task":
    case "reopen_task":
    case "delete_task": {
      const task = find(args.id as string);
      if (!task) return missing;
      const kind = name === "complete_task" ? "complete" : name === "reopen_task" ? "reopen" : "delete";
      if (kind === "complete" && task.status === "done") return { kind: "error", message: "That task is already done." };
      if (kind === "reopen" && task.status !== "done") return { kind: "error", message: "That task is not done." };
      return { kind: "action", action: { kind, id: task.id, title: task.title } };
    }
    case "move_task": {
      const task = find(args.id as string);
      if (!task) return missing;
      if (!fitsDay(args.start as string, task.duration)) return { kind: "error", message: "A task cannot cross midnight." };
      if (task.repeatUntil && (args.date as string) > task.repeatUntil) return { kind: "error", message: "That date is after the end of the repeat." };
      return { kind: "action", action: { kind: "move", id: task.id, title: task.title, date: args.date as string, start: args.start as string } };
    }
    case "edit_task": {
      const task = find(args.id as string);
      if (!task) return missing;
      const changes: { title?: string; duration?: number; notes?: string; category?: string } = {};
      if (args.title !== undefined) changes.title = (args.title as string).trim();
      if (args.notes !== undefined) changes.notes = args.notes as string;
      if (args.duration !== undefined) {
        if (task.start && !fitsDay(task.start, args.duration as number)) return { kind: "error", message: "A task cannot cross midnight." };
        changes.duration = args.duration as number;
      }
      if (args.category !== undefined) {
        const category = resolveCategory(args.category as string, ctx.categories);
        if (category === null) return { kind: "error", message: "Unknown category. Call get_settings to see the categories." };
        changes.category = category;
      }
      if (Object.keys(changes).length === 0) return { kind: "error", message: "Nothing to change." };
      return { kind: "action", action: { kind: "edit", id: task.id, title: task.title, changes } };
    }
    case "update_settings": {
      const changes = args.changes as Record<string, unknown>;
      const check = checkSettingsChanges(ctx.settings, changes);
      if (!check.ok) return { kind: "error", message: check.message };
      return { kind: "action", action: { kind: "settings", changes: changes as DeepPartial<Settings>, paths: check.paths } };
    }
    case "set_language":
      return { kind: "action", action: { kind: "language", language: args.language as "en" | "vi" } };
  }
}

/** The change an agreed task action makes, as one `mutate` update (undoable). */
export function taskUpdate(action: Action): ((tasks: Task[]) => Task[]) | null {
  switch (action.kind) {
    case "create":
      return tasks => [...tasks, action.task];
    case "complete":
    case "reopen":
      return tasks => tasks.map(task => (task.id === action.id ? { ...task, status: action.kind === "complete" ? "done" : "todo" } : task));
    case "move":
      return tasks => tasks.map(task => (task.id === action.id ? { ...task, date: action.date, start: action.start } : task));
    case "edit":
      return tasks => tasks.map(task => (task.id === action.id ? { ...task, ...action.changes } : task));
    case "delete":
      return tasks => {
        const existing = tasks.find(task => task.id === action.id);
        if (!existing) return tasks;
        const plan = planDelete(existing, "this");
        return plan.kind === "remove" ? tasks.filter(task => task.id !== plan.id) : plan.update(tasks);
      };
    default:
      return null;
  }
}

/**
 * What the confirmation card says, as translatable lines. Titles are user content and go in as values. `time`
 * formats an HH:mm in the user's 12/24-hour setting.
 */
export function describeAction(action: Action, ctx: { categories: readonly CategoryRef[]; time: (value: string) => string }): Line[] {
  switch (action.kind) {
    case "create": {
      const { task } = action;
      const lines: Line[] = [{ text: "Create task: {title}", vars: { title: task.title } }];
      if (task.date && task.start) lines.push({ text: "On {date} at {time}, {minutes} min", vars: { date: task.date, time: ctx.time(task.start), minutes: task.duration } });
      else lines.push({ text: "In the backlog, {minutes} min", vars: { minutes: task.duration } });
      lines.push({ text: "Category: {category}", vars: { category: categoryName(task.category, ctx.categories) } });
      return lines;
    }
    case "complete": return [{ text: "Mark as done: {title}", vars: { title: action.title } }];
    case "reopen": return [{ text: "Mark as not done: {title}", vars: { title: action.title } }];
    case "delete": return [{ text: "Delete task: {title}", vars: { title: action.title } }];
    case "move": return [{ text: "Move {title} to {date} at {time}", vars: { title: action.title, date: action.date, time: ctx.time(action.start) } }];
    case "edit": {
      const lines: Line[] = [{ text: "Edit task: {title}", vars: { title: action.title } }];
      if (action.changes.title !== undefined) lines.push({ text: "New title: {value}", vars: { value: action.changes.title } });
      if (action.changes.duration !== undefined) lines.push({ text: "Duration: {minutes} min", vars: { minutes: action.changes.duration } });
      if (action.changes.category !== undefined) lines.push({ text: "Category: {category}", vars: { category: categoryName(action.changes.category, ctx.categories) } });
      if (action.changes.notes !== undefined) lines.push({ text: "New notes" });
      return lines;
    }
    case "settings":
      return [{ text: "Change settings:" }, ...action.paths.map(path => ({ text: "{path} → {value}", vars: { path, value: JSON.stringify(getPath(action.changes, path)) } }))];
    case "language":
      return [{ text: "Switch the language to {language}", vars: { language: action.language === "vi" ? "Tiếng Việt" : "English" } }];
  }
}

/** Today's key, for the prompt and for defaults. */
export function todayKey(now: Date): string {
  return dateKey(now);
}

export const AI_TOOL_NAMES = Object.keys(SCHEMAS) as ToolName[];
