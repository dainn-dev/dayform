import { CYCLE_MAX_REMINDERS, planCycleReminders } from "./cycle-reminders";
import type { CycleState } from "./cycle-model";
import { dateKey, type Task } from "./planner";
import {
  CYCLE_ID_PREFIX, DEFAULT_REMINDER_LIMIT, planReminders, type PlannedReminder, type ReminderLanguage, type ReminderScheduler,
} from "./reminders";
import type { Settings } from "./settings";
import type { SpecialDay } from "./special-days";
import { SPECIAL_MAX_REMINDERS, hasSpecialReminders, planSpecialReminders } from "./special-reminders";
import { planSummary, SUMMARY_DAYS } from "./summary-notification";

/*
 * Notification budget. iOS keeps at most 64 pending local notifications; DEFAULT_REMINDER_LIMIT (50) is the budget
 * for everything this planner schedules, which leaves 14 for snoozed notifications (one per tapped "Snooze").
 *
 *   task reminders + morning summaries + cycle reminders + special-day reminders <= 50
 *   tasks = 50 - (summary on ? SUMMARY_DAYS = 7 : 0) - (cycle active ? CYCLE_MAX_REMINDERS = 6 : 0)
 *                - (a special day asks for a reminder ? SPECIAL_MAX_REMINDERS = 8 : 0)
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

export function taskReminderLimit(summaryEnabled: boolean, cycleReserved: boolean, specialReserved = false): number {
  return DEFAULT_REMINDER_LIMIT - (summaryEnabled ? SUMMARY_DAYS : 0) - (cycleReserved ? CYCLE_MAX_REMINDERS : 0) - (specialReserved ? SPECIAL_MAX_REMINDERS : 0);
}

export type PlanAllInput = {
  tasks: readonly Task[];
  language: ReminderLanguage;
  notifications: NotificationSettings;
  cycle: CycleSync;
  /** The user's special days; undefined while they are still loading or unreadable (their notifications are then left alone). */
  specialDays?: readonly SpecialDay[];
  now: Date;
};
export type PlanAllResult = {
  planned: PlannedReminder[];
  /**
   * True while the tracker state is unknown (still loading, or unreadable): the scheduled cycle notifications must
   * then be left alone. When it is known and off, paused or empty, `planned` has none and they are all cancelled.
   */
  keepCycle: boolean;
  /** True while the special days are unknown: the scheduled `dayform:special:*` notifications must then be left alone. */
  keepSpecial?: boolean;
};

/** Task reminders, the next days' morning summaries, the period-tracker reminders and the special-day reminders, within one shared budget. */
export function planAllReminders({ tasks, language, notifications, cycle, specialDays, now }: PlanAllInput): PlanAllResult {
  const { hideTitles, quietEnabled, quietFrom, quietTo, summaryEnabled, summaryTime } = notifications;
  const quiet = quietEnabled ? { from: quietFrom, to: quietTo } : null;
  const active = cycleActive(cycle);
  const specialReserved = specialDays !== undefined && hasSpecialReminders(specialDays);
  const limit = taskReminderLimit(summaryEnabled, active, specialReserved);
  const planned = planReminders(tasks, now, { language, hideTitles, quiet, limit });
  if (summaryEnabled) planned.push(...planSummary(tasks, now, { time: summaryTime, language, hideTitles }));
  if (active) planned.push(...planCycleReminders({ state: cycle.state, now, today: dateKey(now), quiet, language }));
  if (specialReserved && specialDays !== undefined) planned.push(...planSpecialReminders({ items: specialDays, now, language, hideTitles, quiet }));
  return { planned, keepCycle: !cycle.ready || cycle.locked, keepSpecial: specialDays === undefined };
}

// --- The tracker group on its own ---------------------------------------------------------------------------------

/**
 * What a sync may touch. `all`: tasks, summaries and the tracker group. `cycle`: only the `dayform:cycle:*` group, because
 * the task store is loading or unhealthy (its list is empty or partial, so task reminders must be left alone) but the
 * tracker was read safely: switching it off, pausing it or deleting its data must still cancel its notifications, which
 * with neutral text off read "Period expected tomorrow". `none`: nothing is known well enough to touch anything.
 */
export type SyncScope = "all" | "cycle" | "none";

export function syncScope(input: { tasksReady: boolean; settingsReady: boolean; cycle: CycleSync }): SyncScope {
  if (input.tasksReady && input.settingsReady) return "all";
  return input.cycle.ready && !input.cycle.locked ? "cycle" : "none";
}

export type PlanCycleGroupInput = {
  language: ReminderLanguage;
  notifications: NotificationSettings;
  cycle: CycleSync;
  /** The quiet hours come from the settings: until they are read an active tracker's reminders are left as they are. */
  settingsReady: boolean;
  now: Date;
};

/** The tracker's reminders alone (same plan as in `planAllReminders`). `keepCycle` is true while it is unknown. */
export function planCycleGroup({ language, notifications, cycle, settingsReady, now }: PlanCycleGroupInput): PlanAllResult {
  const unknown = !cycle.ready || cycle.locked;
  const active = cycleActive(cycle);
  if (!active) return { planned: [], keepCycle: unknown };
  if (!settingsReady) return { planned: [], keepCycle: true };
  const { quietEnabled, quietFrom, quietTo } = notifications;
  const quiet = quietEnabled ? { from: quietFrom, to: quietTo } : null;
  return { planned: planCycleReminders({ state: cycle.state, now, today: dateKey(now), quiet, language }), keepCycle: false };
}

/** A view of `base` that only lists the tracker's notifications, so reconciling it can never touch any other. */
export function cycleGroupScheduler(base: ReminderScheduler): ReminderScheduler {
  return {
    async listScheduledIds() {
      return (await base.listScheduledIds()).filter(id => id.startsWith(CYCLE_ID_PREFIX));
    },
    schedule: reminder => base.schedule(reminder),
    cancel: ids => base.cancel(ids),
  };
}
