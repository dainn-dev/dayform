// The editable day window of the Calendar settings, in whole hours. Pure so the stepper rules are tested.

export interface DayWindow {
  readonly startHour: number;
  readonly endHour: number;
}

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** The shortest day window the settings accept (4 hours). */
export const MIN_WINDOW_HOURS = 4;

export function dayWindowFromMinutes(dayStart: number, dayEnd: number): DayWindow {
  return { startHour: dayStart / MINUTES_PER_HOUR, endHour: dayEnd / MINUTES_PER_HOUR };
}

/** Moves one edge by `delta` hours, clamped to a real hour of the day (start 0..23, end 1..24). */
export function stepDayWindow(window: DayWindow, edge: "start" | "end", delta: number): DayWindow {
  if (edge === "start") return { ...window, startHour: Math.min(Math.max(window.startHour + delta, 0), HOURS_PER_DAY - 1) };
  return { ...window, endHour: Math.min(Math.max(window.endHour + delta, 1), HOURS_PER_DAY) };
}

export function isDayWindowValid(window: DayWindow): boolean {
  return window.endHour - window.startHour >= MIN_WINDOW_HOURS;
}

/** The calendar patch to save: both fields every time, because the settings judge the pair as a whole. */
export function dayWindowPatch(window: DayWindow): { dayStart: number; dayEnd: number } {
  return { dayStart: window.startHour * MINUTES_PER_HOUR, dayEnd: window.endHour * MINUTES_PER_HOUR };
}
