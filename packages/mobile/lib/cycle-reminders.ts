import { isDateKey } from "./cycle-date";
import { predict, type Prediction } from "./cycle-predict";
import type { CycleState } from "./cycle-model";
import { CYCLE_NOTIFICATION_TITLE, NEUTRAL_BODY, localizeCycle } from "./i18n/cycle-notify";
import { addDays, dateKey } from "./planner";
import { CYCLE_ID_PREFIX, contentHash, type PlannedReminder, type QuietWindow, type ReminderLanguage } from "./reminders";
import { postponeOutOfQuiet } from "./reminders-quiet";

/*
 * Notifications for the private period tracker. Health data, so:
 *   - nothing is planned unless predict() has a prediction (it returns none when the tracker is off, paused,
 *     empty or stale), and the caller only asks while the cycle state is ready, readable and enabled;
 *   - the default text is neutral and identical for every kind, so the lock screen cannot tell them apart;
 *   - a planned reminder carries no data at all (no kind, no date): a tap only opens the app, and the
 *     Done/Snooze handlers ignore it because they only act on a validated task id.
 *
 * What is planned, for the next CYCLES_AHEAD predicted cycles (at `reminders.time`, local wall-clock):
 *   before   `daysBefore` days before the predicted start (0 = on the day);
 *   late     the day after the predicted start, FIRST cycle only (notifyLate). It is planned in advance and is
 *            replaced as soon as a new period is logged, because the predicted start then moves;
 *   fertile  the first day of the predicted fertile window (notifyFertile + acknowledged). Only when
 *            predict().safeDays.reason === "ok", i.e. at least 3 regular cycles on record: the same rule that
 *            gates the "safe days" in the app. With less data, or while the period is late, there is none.
 * The second cycle is not planned while the first is already late (its start depends on when the late period
 * begins). A reminder that would fire in the past is skipped; one inside quiet hours is postponed to the end of
 * the window, or dropped when that moves it to another calendar day (the task rule).
 * At most CYCLE_MAX_REMINDERS are returned (the budget in reminders-plan.ts reserves exactly that many).
 */
export const CYCLES_AHEAD = 2;
export const CYCLE_MAX_REMINDERS = 6;

export type CycleReminderKind = "before" | "late" | "fertile";
export type CycleTranslate = (key: string, values?: Readonly<Record<string, string>>) => string;

export type PlanCycleOptions = {
  state: CycleState;
  now: Date;
  /** Local `YYYY-MM-DD` of `now`. */
  today: string;
  quiet?: QuietWindow | null;
  language: ReminderLanguage;
  /** Overrides the built-in translation (tests); receives the English key and the `{name}` values. */
  translate?: CycleTranslate;
};

type Candidate = { kind: CycleReminderKind; day: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const KIND_ORDER: Record<CycleReminderKind, number> = { before: 0, late: 1, fertile: 2 };

function fertileWanted(state: CycleState, prediction: Prediction): boolean {
  return state.reminders.notifyFertile && state.acknowledged && prediction.safeDays.reason === "ok" &&
    prediction.fertileWindow !== null;
}

function candidatesFor(state: CycleState, prediction: Prediction): Candidate[] {
  const { nextStart, cycleLength, fertileWindow } = prediction;
  if (nextStart === null || cycleLength === null) return [];
  const found: Candidate[] = [];
  const withFertile = fertileWanted(state, prediction);
  for (let cycle = 0; cycle < CYCLES_AHEAD; cycle += 1) {
    if (cycle > 0 && prediction.late) break;
    const start = addDays(nextStart, cycle * cycleLength);
    found.push({ kind: "before", day: addDays(start, -state.reminders.daysBefore) });
    if (cycle === 0 && state.reminders.notifyLate) found.push({ kind: "late", day: addDays(start, 1) });
    if (withFertile && fertileWindow !== null) {
      found.push({ kind: "fertile", day: addDays(fertileWindow.start, cycle * cycleLength) });
    }
  }
  return found;
}

function plainBody(kind: CycleReminderKind, daysBefore: number, translate: CycleTranslate): string {
  if (kind === "late") return translate("Period may be late");
  if (kind === "fertile") return translate("Fertile window may start today (estimate)");
  if (daysBefore === 0) return translate("Period expected today");
  if (daysBefore === 1) return translate("Period expected tomorrow");
  return translate("Period expected in {n} days", { n: String(daysBefore) });
}

/** Neutral by default: the same title and body for every kind. */
function textFor(kind: CycleReminderKind, state: CycleState, translate: CycleTranslate): { title: string; body: string } {
  const body = state.reminders.neutralText ? translate(NEUTRAL_BODY) : plainBody(kind, state.reminders.daysBefore, translate);
  return { title: CYCLE_NOTIFICATION_TITLE, body };
}

function localFireAt(day: string, time: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const match = TIME_PATTERN.exec(time)!;
  return new Date(year!, month! - 1, date!, Number(match[1]), Number(match[2]));
}

/** The time after quiet hours, or null when postponing moves it to another calendar day. */
function afterQuiet(fireAt: Date, quiet: QuietWindow | null | undefined): Date | null {
  const adjusted = postponeOutOfQuiet(fireAt, quiet);
  if (adjusted === fireAt) return fireAt;
  return dateKey(adjusted) === dateKey(fireAt) ? adjusted : null;
}

function byFireAtThenKind(a: PlannedReminder & { order: number }, b: PlannedReminder & { order: number }): number {
  return a.fireAt.getTime() - b.fireAt.getTime() || a.order - b.order;
}

/** Pure; never throws. Returns [] when there is nothing to plan (see the header for every case). */
export function planCycleReminders(options: PlanCycleOptions): PlannedReminder[] {
  const { state, now, today, quiet = null, language } = options;
  const translate = options.translate ?? ((key, values) => localizeCycle(language, key, values));
  if (Number.isNaN(now.getTime()) || !isDateKey(today) || !TIME_PATTERN.test(state.reminders.time)) return [];
  const prediction = predict(state, today);
  const planned: (PlannedReminder & { order: number })[] = [];
  for (const { kind, day } of candidatesFor(state, prediction)) {
    const scheduled = localFireAt(day, state.reminders.time);
    if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= now.getTime()) continue;
    const fireAt = afterQuiet(scheduled, quiet);
    if (fireAt === null) continue;
    const { title, body } = textFor(kind, state, translate);
    const hash = contentHash(`${fireAt.getTime()}\u0000${title}\u0000${body}`);
    planned.push({
      id: `${CYCLE_ID_PREFIX}${kind}:${dateKey(fireAt)}:${hash}`,
      taskId: "", fireAt, title, body, kind: "cycle", order: KIND_ORDER[kind],
    });
  }
  return planned.sort(byFireAtThenKind).slice(0, CYCLE_MAX_REMINDERS).map(({ order: _order, ...reminder }) => reminder);
}
