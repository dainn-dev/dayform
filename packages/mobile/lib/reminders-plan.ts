import { CYCLE_MAX_REMINDERS, planCycleReminders } from "./cycle-reminders";
import type { CycleState } from "./cycle-model";
import { dateKey, type Task } from "./planner";
import { DEFAULT_REMINDER_LIMIT, planReminders, type PlannedReminder, type ReminderLanguage } from "./reminders";
import type { Settings } from "./settings";
import { planSummary, SUMMARY_DAYS } from "./summary-notification";

/*
 * Notification budget. iOS keeps at most 64 pending local notifications; DEFAULT_REMINDER_LIMIT (50) is the budget
 * for everything this planner schedules, which leaves 14 for snoozed notifications (one per tapped "Snooze").
 *
 *   task reminders + morning summaries + cycle reminders <= 50
 *   tasks = 50 - (summary on ? SUMMARY_DAYS = 7 : 0) - (cycle active ? CYCLE_MAX_REMINDERS = 6 : 0)
 *
 *   neither: 50 tasks            summary only: 43 + 7 = 50
 *   cycle only: 44 + 6 = 50      both: 37 + 7 + 6 = 50
 *
 * The cycle share is reserved whenever the tracker is active, even if fewer than six are planned, so the task
 * limit does not jump around when a prediction appears or disappears.
 */
export const IOS_PENDING_LIMIT = 64;

export type NotificationSettings = Settings["notifications"];

/** What the planner needs to know about the period tracker. `ready`/`locked` mirror the cycle store. */
export type CycleSync = { state: CycleState; ready: boolean; locked: boolean };

/** The tracker can plan reminders: its state was read safely, it is on and not paused. */
export function cycleActive(cycle: CycleSync): boolean {
  return cycle.ready && !cycle.locked && cycle.state.enabled && !cycle.state.paused;
}

export function taskReminderLimit(summaryEnabled: boolean, cycleReserved: boolean): number {
  return DEFAULT_REMINDER_LIMIT - (summaryEnabled ? SUMMARY_DAYS : 0) - (cycleReserved ? CYCLE_MAX_REMINDERS : 0);
}

export type PlanAllInput = {
  tasks: readonly Task[];
  language: ReminderLanguage;
  notifications: NotificationSettings;
  cycle: CycleSync;
  now: Date;
};
export type PlanAllResult = {
  planned: PlannedReminder[];
  /**
   * True while the tracker state is unknown (still loading, or unreadable): the scheduled cycle notifications must
   * then be left alone. When it is known and off, paused or empty, `planned` has none and they are all cancelled.
   */
  keepCycle: boolean;
};

/** Task reminders, the next days' morning summaries and the period-tracker reminders, within one shared budget. */
export function planAllReminders({ tasks, language, notifications, cycle, now }: PlanAllInput): PlanAllResult {
  const { hideTitles, quietEnabled, quietFrom, quietTo, summaryEnabled, summaryTime } = notifications;
  const quiet = quietEnabled ? { from: quietFrom, to: quietTo } : null;
  const active = cycleActive(cycle);
  const limit = taskReminderLimit(summaryEnabled, active);
  const planned = planReminders(tasks, now, { language, hideTitles, quiet, limit });
  if (summaryEnabled) planned.push(...planSummary(tasks, now, { time: summaryTime, language, hideTitles }));
  if (active) planned.push(...planCycleReminders({ state: cycle.state, now, today: dateKey(now), quiet, language }));
  return { planned, keepCycle: !cycle.ready || cycle.locked };
}
