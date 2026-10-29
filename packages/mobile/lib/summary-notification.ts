import { dateKey, type Task } from "./planner";
import { localize } from "./i18n/notifications";
import { contentHash, SUMMARY_ID_PREFIX, type PlannedReminder, type ReminderLanguage } from "./reminders";

/** One summary is planned per upcoming day, this many days ahead (stays well inside iOS's 64 pending limit). */
export const SUMMARY_DAYS = 7;

export type SummaryOptions = { time: string; language: ReminderLanguage; hideTitles?: boolean };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function byStartThenId(a: Task, b: Task): number {
  const first = a.start ?? "";
  const second = b.start ?? "";
  if (first !== second) return first < second ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Scheduled (dated, timed), not-done tasks of one local day, earliest first. */
function tasksOfDay(tasks: readonly Task[], key: string): Task[] {
  return tasks.filter((task) => task.date === key && task.start !== null && task.status !== "done").sort(byStartThenId);
}

function summaryText(day: readonly Task[], language: ReminderLanguage, hideTitles: boolean): { title: string; body: string } {
  const title = day.length === 1
    ? localize(language, "Today you have 1 task")
    : localize(language, "Today you have {n} tasks", { n: String(day.length) });
  const first = day[0]!;
  const time = first.start!;
  const body = hideTitles
    ? localize(language, "First task at {time}", { time })
    : localize(language, "First: {title} · {time}", { title: first.title, time });
  return { title, body };
}

/**
 * The next days' "Today you have N tasks" notifications: one per upcoming day (within the next SUMMARY_DAYS fire
 * times of `time`) that has at least one scheduled, not-done task. Days without tasks get none. The id carries a
 * content hash, so a changed day is rescheduled by `reconcileReminders`. Pure; local wall-clock, DST-safe.
 */
export function planSummary(tasks: readonly Task[], now: Date, options: SummaryOptions): PlannedReminder[] {
  const match = TIME_PATTERN.exec(options.time);
  if (!match) return [];
  const { language, hideTitles = false } = options;
  const planned: PlannedReminder[] = [];
  let days = 0;
  for (let offset = 0; days < SUMMARY_DAYS; offset += 1) {
    const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, Number(match[1]), Number(match[2]));
    if (fireAt.getTime() <= now.getTime()) continue;
    days += 1;
    const key = dateKey(fireAt);
    const day = tasksOfDay(tasks, key);
    if (day.length === 0) continue;
    const { title, body } = summaryText(day, language, hideTitles);
    const hash = contentHash(`${fireAt.getTime()}\u0000${title}\u0000${body}`);
    planned.push({ id: `${SUMMARY_ID_PREFIX}${key}:${hash}`, taskId: "", fireAt, title, body, kind: "summary" });
  }
  return planned;
}
