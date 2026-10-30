import { extraTranslations } from "./i18n";
import { addDays, dateKey } from "./planner";
import { SPECIAL_ID_PREFIX, contentHash, type PlannedReminder, type QuietWindow, type ReminderLanguage } from "./reminders";
import { postponeOutOfQuiet } from "./reminders-quiet";
import { occurrencesInRange, specialLabel, type SpecialDay } from "./special-days";

/*
 * Notifications for the user's special days (birthdays, anniversaries ...). Only a day with `remind` set gets one:
 *   same-day    at 08:00 on the day;
 *   day-before  at 08:00 the day before.
 * The next SPECIAL_MAX_REMINDERS within SPECIAL_HORIZON_DAYS are planned; the budget in reminders-plan.ts reserves
 * exactly that many while any day asks for a reminder. A reminder in the past is skipped; one inside quiet hours is
 * postponed to the end of the window, or dropped when that moves it to another calendar day (the task rule).
 * The text names the day (the user's own words, never translated) unless "hide titles" is on: then it is the same
 * neutral line for every day. A planned reminder carries no data and has no buttons, so a tap only opens the app.
 */
export const SPECIAL_MAX_REMINDERS = 8;
export const SPECIAL_HORIZON_DAYS = 60;
export const SPECIAL_REMINDER_HOUR = 8;
export const SPECIAL_NOTIFICATION_TITLE = "Dayform";

export type PlanSpecialOptions = {
  items: readonly SpecialDay[];
  now: Date;
  language: ReminderLanguage;
  /** The notifications setting: the title and body then say nothing about which day it is. */
  hideTitles: boolean;
  quiet?: QuietWindow | null;
};

/** Whether any day asks for a reminder (the budget is reserved then, even if none is due soon). */
export function hasSpecialReminders(items: readonly SpecialDay[]): boolean {
  return items.some(item => item.remind !== "none");
}

function atReminderHour(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, SPECIAL_REMINDER_HOUR, 0);
}

/** The time after quiet hours, or null when postponing moves it to another calendar day. */
function afterQuiet(fireAt: Date, quiet: QuietWindow | null | undefined): Date | null {
  const adjusted = postponeOutOfQuiet(fireAt, quiet);
  if (adjusted === fireAt) return fireAt;
  return dateKey(adjusted) === dateKey(fireAt) ? adjusted : null;
}

/** Pure; never throws. Returns [] when there is nothing to plan. */
export function planSpecialReminders({ items, now, language, hideTitles, quiet = null }: PlanSpecialOptions): PlannedReminder[] {
  if (Number.isNaN(now.getTime())) return [];
  const asking = items.filter(item => item.remind !== "none");
  if (asking.length === 0) return [];
  const t = (text: string): string => (language === "vi" ? extraTranslations[text] ?? text : text);
  const today = dateKey(now);
  const found = occurrencesInRange(asking, today, addDays(today, SPECIAL_HORIZON_DAYS + 1));
  const planned: PlannedReminder[] = [];
  for (const [date, list] of Object.entries(found)) {
    for (const { item, years } of list) {
      const sameDay = item.remind === "same-day";
      const scheduled = atReminderHour(sameDay ? date : addDays(date, -1));
      if (scheduled.getTime() <= now.getTime()) continue;
      const fireAt = afterQuiet(scheduled, quiet);
      if (fireAt === null) continue;
      const title = hideTitles ? SPECIAL_NOTIFICATION_TITLE : specialLabel(item, years, t);
      const body = hideTitles ? t(sameDay ? "Today is a special day" : "A special day is coming up") : t(sameDay ? "Today" : "Tomorrow");
      const hash = contentHash(`${fireAt.getTime()}\u0000${title}\u0000${body}`);
      planned.push({ id: `${SPECIAL_ID_PREFIX}${item.id}:${dateKey(fireAt)}:${hash}`, taskId: "", fireAt, title, body, kind: "special" });
    }
  }
  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id));
  return planned.slice(0, SPECIAL_MAX_REMINDERS);
}
