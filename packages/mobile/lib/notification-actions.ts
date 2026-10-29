import type { Task } from "./planner";
import { SNOOZE_ID_PREFIX, type PlannedReminder, type ReminderLanguage } from "./reminders";
import { DONE_ACTION_VI, SNOOZED_BODY_VI, vi as notificationActionsVi } from "./i18n/notification-actions";
import { localize } from "./i18n/notifications";

/** Category attached to every reminder. No ":" or "-": expo-notifications warns they break categories. */
export const REMINDER_CATEGORY_ID = "dayform_reminder";
export const DONE_ACTION_ID = "done";
export const SNOOZE_ACTION_ID = "snooze";
/** Value expo-notifications reports when the notification body itself is tapped. */
export const DEFAULT_ACTION_ID = "expo.modules.notifications.actions.DEFAULT";

export { SNOOZE_ID_PREFIX };
export const SNOOZE_MINUTES = 10;

const MAX_TASK_ID_LENGTH = 200;
const MAX_REMEMBERED_RESPONSES = 50;
const MS_PER_MINUTE = 60_000;

/** What the app does about a notification interaction. Carries nothing but a validated task id. */
export type ResponseAction =
  | { kind: "open"; taskId: string }
  | { kind: "done"; taskId: string }
  | { kind: "snooze"; taskId: string }
  | { kind: "ignore" };

/** Structural subset of expo-notifications' NotificationResponse (this module stays native-free). */
export type RawResponse = {
  actionIdentifier: string;
  notification: {
    date: number;
    request: { identifier: string; content: { data?: Record<string, unknown> } };
  };
};

const IGNORE: ResponseAction = { kind: "ignore" };

function validTaskId(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const taskId = (data as Record<string, unknown>).taskId;
  if (typeof taskId !== "string" || taskId.trim() === "" || taskId.length > MAX_TASK_ID_LENGTH) return null;
  return taskId;
}

function kindFor(actionIdentifier: unknown): "open" | "done" | "snooze" | null {
  if (actionIdentifier === DEFAULT_ACTION_ID) return "open";
  if (actionIdentifier === DONE_ACTION_ID) return "done";
  if (actionIdentifier === SNOOZE_ACTION_ID) return "snooze";
  return null;
}

/** Notification data is untrusted input: only the action and a sane task id are ever read from it. */
export function parseResponse(input: { actionIdentifier: string; data: unknown }): ResponseAction {
  const kind = kindFor(input.actionIdentifier);
  const taskId = validTaskId(input.data);
  if (!kind || !taskId) return IGNORE;
  return { kind, taskId };
}

export function snoozeFireAt(now: Date, minutes: number = SNOOZE_MINUTES): Date {
  return new Date(now.getTime() + minutes * MS_PER_MINUTE);
}

export function snoozeId(taskId: string, fireAt: Date): string {
  return `${SNOOZE_ID_PREFIX}${taskId}:${fireAt.getTime()}`;
}

export function snoozeMessage(
  task: Task,
  language: ReminderLanguage,
  hideTitle = false,
): { title: string; body: string } {
  const prefix = language === "vi" ? SNOOZED_BODY_VI : "Reminder";
  const title = hideTitle ? localize(language, "Upcoming task") : task.title;
  return { title, body: task.start ? `${prefix} · ${task.start}` : prefix };
}

export type SnoozeOptions = { minutes?: number; hideTitles?: boolean };

export function buildSnoozeReminder(
  task: Task,
  now: Date,
  language: ReminderLanguage,
  { minutes = SNOOZE_MINUTES, hideTitles = false }: SnoozeOptions = {},
): PlannedReminder {
  const fireAt = snoozeFireAt(now, minutes);
  return { id: snoozeId(task.id, fireAt), taskId: task.id, fireAt, ...snoozeMessage(task, language, hideTitles) };
}

/** One key per interaction: the same response seen twice (listener and last-response) is handled once. */
export function dedupeKey(response: RawResponse): string {
  const { actionIdentifier, notification } = response;
  return `${notification.request.identifier}|${actionIdentifier}|${notification.date}`;
}

/** Returns the bounded history with `key` added, and whether it was new. Never mutates `keys`. */
export function rememberHandled(keys: readonly string[], key: string): { fresh: boolean; keys: string[] } {
  if (keys.includes(key)) return { fresh: false, keys: [...keys] };
  return { fresh: true, keys: [...keys, key].slice(-MAX_REMEMBERED_RESPONSES) };
}

/** A `mutate` updater: marks the task done. Returns the SAME list when the task is missing or already done. */
export function markDoneUpdate(taskId: string): (tasks: Task[]) => Task[] {
  return (tasks) => {
    if (!tasks.some((task) => task.id === taskId && task.status !== "done")) return tasks;
    return tasks.map((task) => (task.id === taskId ? { ...task, status: "done" } : task));
  };
}

/** The task a `?edit=` param names, or null for anything that is not an existing task id. */
export function findEditTarget(tasks: readonly Task[], param: unknown): Task | null {
  if (typeof param !== "string" || param === "" || param.length > MAX_TASK_ID_LENGTH) return null;
  return tasks.find((task) => task.id === param) ?? null;
}

/** Button titles. The snooze key is "Snooze <minutes> min": every length has its own Vietnamese entry. */
export function actionLabels(
  language: ReminderLanguage,
  snoozeMinutes: number = SNOOZE_MINUTES,
): { done: string; snooze: string } {
  const snooze = `Snooze ${snoozeMinutes} min`;
  if (language === "vi") return { done: DONE_ACTION_VI, snooze: notificationActionsVi[snooze] ?? snooze };
  return { done: "Done", snooze };
}

/** What happened to a response: retry keeps it pending, failed drops it (already warned about). */
export type ActionOutcome = "handled" | "retry" | "failed";

/** Everything `runAction` touches, injected so the logic stays native-free. */
export type ActionContext = {
  tasks: readonly Task[];
  language: ReminderLanguage;
  /** Snooze length in minutes (the setting); defaults to SNOOZE_MINUTES. */
  snoozeMinutes?: number;
  /** Snoozed notifications show a generic title instead of the task title. */
  hideTitles?: boolean;
  /** Read fresh each time: the store can become write-blocked while a write is in flight. */
  writesBlocked(): boolean;
  mutate(update: (tasks: Task[]) => Task[], options: { silent: true }): Promise<boolean>;
  schedule(reminder: PlannedReminder): Promise<void>;
  open(taskId: string): void;
  warn(message: string, error?: unknown): void;
  now(): Date;
};

async function markDone(taskId: string, context: ActionContext): Promise<ActionOutcome> {
  // A blocked store refuses the write; keep the tap pending instead of losing it.
  if (context.writesBlocked()) return "retry";
  if (await context.mutate(markDoneUpdate(taskId), { silent: true })) return "handled";
  if (context.writesBlocked()) return "retry";
  context.warn("Notification action: the task could not be marked done");
  return "failed";
}

async function snooze(taskId: string, context: ActionContext): Promise<ActionOutcome> {
  const task = context.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.status === "done") return "handled";
  try {
    await context.schedule(buildSnoozeReminder(task, context.now(), context.language, {
      minutes: context.snoozeMinutes,
      hideTitles: context.hideTitles,
    }));
    return "handled";
  } catch (error) {
    context.warn("Notification action: snooze could not be scheduled", error);
    return "failed";
  }
}

/** Acts on one parsed response. Only the validated task id is ever used. */
export async function runAction(action: ResponseAction, context: ActionContext): Promise<ActionOutcome> {
  switch (action.kind) {
    case "ignore":
      return "handled";
    case "open":
      context.open(action.taskId);
      return "handled";
    case "done":
      return markDone(action.taskId, context);
    case "snooze":
      return snooze(action.taskId, context);
  }
}

export type ActionQueueDeps<R> = {
  /** False until the tasks are loaded and navigation works. */
  ready(): boolean;
  keyOf(response: R): string;
  handle(response: R): Promise<ActionOutcome>;
  /** Called when nothing is pending any more: the last response may then be cleared. */
  onIdle(): void;
  onError(error: unknown): void;
};

export type ActionQueue<R> = { push(response: R): void; drain(): Promise<void> };

/**
 * Single-flight queue: waits until `ready`, handles each response once and in order. A "retry" outcome
 * leaves the response (and everything after it) pending and not remembered, so a later `drain` replays it.
 */
export function createActionQueue<R>(deps: ActionQueueDeps<R>): ActionQueue<R> {
  const pending: R[] = [];
  let handled: string[] = [];
  let current: Promise<void> | null = null;
  let again = false;

  /** Handles the head of the queue; false means "retry later" (the head stays). */
  const processHead = async (): Promise<boolean> => {
    const response = pending[0]!;
    const key = deps.keyOf(response);
    if (!handled.includes(key)) {
      let outcome: ActionOutcome;
      try {
        outcome = await deps.handle(response);
      } catch (error) {
        deps.onError(error);
        outcome = "failed";
      }
      if (outcome === "retry") return false;
      handled = rememberHandled(handled, key).keys;
    }
    pending.shift();
    return true;
  };

  const run = async (): Promise<void> => {
    do {
      again = false;
      while (pending.length > 0 && deps.ready()) {
        if (!(await processHead())) break;
      }
      if (pending.length === 0) deps.onIdle();
    } while (again);
  };

  const drain = (): Promise<void> => {
    if (current) { again = true; return current; }
    current = run().finally(() => { current = null; });
    return current;
  };

  return { push(response) { pending.push(response); void drain(); }, drain };
}
