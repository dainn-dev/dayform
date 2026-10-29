import type { Task } from "./planner";
import { localize } from "./i18n/notifications";
import { postponeOutOfQuiet, type QuietWindow } from "./reminders-quiet";

export type { QuietWindow };

/** Local copy of the app language union: lib/language.tsx imports React, so it cannot be used here. */
export type ReminderLanguage = "en" | "vi";

export type PlannedReminder = {
  id: string;
  taskId: string;
  fireAt: Date;
  title: string;
  body: string;
  /**
   * "summary" notifications are daily digests: no task data, no action buttons. "cycle" notifications belong to the
   * private period tracker: neutral text, no data, no buttons. Missing means "task".
   */
  kind?: "task" | "summary" | "cycle";
};

export type ReminderScheduler = {
  listScheduledIds(): Promise<string[]>;
  schedule(reminder: PlannedReminder): Promise<void>;
  cancel(ids: string[]): Promise<void>;
};

export type ReconcileResult = { scheduled: number; cancelled: number; errors: string[] };

export type PlanOptions = {
  limit?: number;
  language?: ReminderLanguage;
  /** Notification text shows a generic title instead of the task title. */
  hideTitles?: boolean;
  /** Reminders firing inside this window are postponed to its end (dropped when that is after the task ends). */
  quiet?: QuietWindow | null;
};

/** Every notification id we create starts with this; anything else belongs to someone else. */
export const REMINDER_ID_PREFIX = "dayform:task:";
/** Snoozed notifications use this prefix, NOT REMINDER_ID_PREFIX, so the plain reconcile never cancels them. */
export const SNOOZE_ID_PREFIX = "dayform:snooze:";
/** Morning-summary notifications (`dayform:summary:<YYYY-MM-DD>:<hash>`) are reconciled like task reminders. */
export const SUMMARY_ID_PREFIX = "dayform:summary:";
/** Period-tracker notifications (`dayform:cycle:<kind>:<YYYY-MM-DD>:<hash>`) are reconciled like the summaries. */
export const CYCLE_ID_PREFIX = "dayform:cycle:";
/** iOS keeps at most 64 pending local notifications; stay below it. */
export const DEFAULT_REMINDER_LIMIT = 50;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_MINUTE = 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 32-bit FNV-1a over UTF-16 code units, base 16. Content-addresses notification ids. */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function leadTime(remind: number, language: ReminderLanguage): string {
  const hours = Math.floor(remind / 60);
  const mins = remind % 60;
  const hourUnit = language === "vi" ? "giờ" : "hr";
  const minUnit = language === "vi" ? "phút" : "min";
  const parts = [hours ? `${hours} ${hourUnit}` : "", mins ? `${mins} ${minUnit}` : ""];
  return parts.filter(Boolean).join(" ");
}

export function reminderMessage(
  task: Task,
  language: ReminderLanguage,
  hideTitle = false,
): { title: string; body: string } {
  const remind = task.remind ?? 0;
  const time = task.start ?? "";
  const prefix = language === "vi" ? "Bắt đầu" : "Starts";
  const when = remind <= 0
    ? (language === "vi" ? "ngay" : "now")
    : `${language === "vi" ? "sau" : "in"} ${leadTime(remind, language)}`;
  const title = hideTitle ? localize(language, "Upcoming task") : task.title;
  return { title, body: `${prefix} ${when} · ${time}` };
}

type Schedule = { startsAt: Date; fireAt: Date };

/** When the task starts and when its reminder should fire, or null when the task data is not a valid schedule. */
function scheduleOf(task: Task): Schedule | null {
  const date = task.date ? DATE_PATTERN.exec(task.date) : null;
  const time = task.start ? TIME_PATTERN.exec(task.start) : null;
  if (!date || !time || task.remind == null || !Number.isFinite(task.remind) || task.remind < 0) return null;
  const startsAt = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(time[1]), Number(time[2]));
  if (Number.isNaN(startsAt.getTime())) return null;
  return { startsAt, fireAt: new Date(startsAt.getTime() - task.remind * MS_PER_MINUTE) };
}

/** The fire time after quiet hours, or null when the postponed reminder would come at or after the task ends. */
function quietFireAt({ startsAt, fireAt }: Schedule, task: Task, quiet: QuietWindow | null | undefined): Date | null {
  const adjusted = postponeOutOfQuiet(fireAt, quiet);
  if (adjusted === fireAt) return fireAt;
  const endsAt = startsAt.getTime() + task.duration * MS_PER_MINUTE;
  return adjusted.getTime() >= endsAt ? null : adjusted;
}

function toPlanned(task: Task, fireAt: Date, language: ReminderLanguage, hideTitles: boolean): PlannedReminder {
  const { title, body } = reminderMessage(task, language, hideTitles);
  const hash = contentHash(`${fireAt.getTime()}\u0000${title}\u0000${body}`);
  return { id: `${REMINDER_ID_PREFIX}${task.id}:${hash}`, taskId: task.id, fireAt, title, body };
}

export function planReminders(tasks: readonly Task[], now: Date, options: PlanOptions = {}): PlannedReminder[] {
  const { limit = DEFAULT_REMINDER_LIMIT, language = "en", hideTitles = false, quiet = null } = options;
  const upcoming: PlannedReminder[] = [];
  for (const task of tasks) {
    if (task.status === "done") continue;
    const schedule = scheduleOf(task);
    if (!schedule || schedule.fireAt.getTime() <= now.getTime()) continue;
    const fireAt = quietFireAt(schedule, task, quiet);
    if (fireAt) upcoming.push(toPlanned(task, fireAt, language, hideTitles));
  }
  upcoming.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));
  return upcoming.slice(0, Math.max(0, limit));
}

async function cancelStale(scheduler: ReminderScheduler, ids: string[], errors: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    await scheduler.cancel(ids);
    return ids.length;
  } catch {
    // The batch failed; retry one by one so a single bad id does not block the rest.
  }
  let cancelled = 0;
  for (const id of ids) {
    try {
      await scheduler.cancel([id]);
      cancelled += 1;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return cancelled;
}

/** The task id inside `dayform:snooze:<taskId>:<ms>` (task ids may contain ":"), or null when malformed. */
function snoozeTaskId(id: string): string | null {
  const rest = id.slice(SNOOZE_ID_PREFIX.length);
  const split = rest.lastIndexOf(":");
  return split > 0 ? rest.slice(0, split) : null;
}

function staleSnoozes(existing: readonly string[], liveTaskIds: ReadonlySet<string>): string[] {
  return existing.filter((id) => {
    if (!id.startsWith(SNOOZE_ID_PREFIX)) return false;
    const taskId = snoozeTaskId(id);
    return taskId === null || !liveTaskIds.has(taskId);
  });
}

export type ReconcileOptions = {
  /**
   * Leave the scheduled `dayform:cycle:*` notifications alone (they are neither cancelled nor replaced). Set while the
   * tracker's state is unknown (still loading, or unreadable): an empty plan then means "I do not know", not "none".
   */
  keepCycle?: boolean;
};

/**
 * Makes the scheduled notifications match `planned`. When `liveTaskIds` (tasks that exist and are not
 * done) is given, snoozed notifications of any other task are cancelled too. Every `dayform:cycle:*` id that is not
 * in `planned` is cancelled (feature off, paused, data deleted) unless `options.keepCycle` is set.
 */
export async function reconcileReminders(
  scheduler: ReminderScheduler,
  planned: readonly PlannedReminder[],
  liveTaskIds?: ReadonlySet<string>,
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const errors: string[] = [];
  let existing: string[];
  try {
    existing = await scheduler.listScheduledIds();
  } catch (error) {
    return { scheduled: 0, cancelled: 0, errors: [errorMessage(error)] };
  }
  const owned = (id: string): boolean =>
    id.startsWith(REMINDER_ID_PREFIX) || id.startsWith(SUMMARY_ID_PREFIX) ||
    (options.keepCycle !== true && id.startsWith(CYCLE_ID_PREFIX));
  const ours = existing.filter(owned);
  const wanted = new Set(planned.map((r) => r.id));
  const present = new Set(existing.filter((id) => owned(id) || id.startsWith(CYCLE_ID_PREFIX)));
  const stale = ours.filter((id) => !wanted.has(id));
  if (liveTaskIds) stale.push(...staleSnoozes(existing, liveTaskIds));
  const cancelled = await cancelStale(scheduler, stale, errors);
  let scheduled = 0;
  for (const reminder of planned) {
    if (present.has(reminder.id)) continue;
    try {
      await scheduler.schedule(reminder);
      scheduled += 1;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return { scheduled, cancelled, errors };
}
