import { BUILTIN_CATEGORIES, dateKey, type Category } from "./planner";
import type { Settings } from "./settings";

const MINUTES_PER_HOUR = 60;
const FALLBACK_CATEGORY: Category = "Focus";

export type NewTaskContext = {
  /** The current moment; a parameter so nothing here reads the wall clock. */
  now: Date;
  /** 'HH:mm' of a tapped timeline slot, or null when the editor was opened without one. */
  slotTime: string | null;
  /** 'YYYY-MM-DD' of the day the new task is created for. */
  selectedDate: string;
  /** Visible category ids (built-in and custom) a default may name; anything else falls back to "Focus", or the first one when "Focus" is hidden. */
  knownCategories?: readonly Category[];
};

export type NewTaskDefaults = {
  duration: number;
  category: Category;
  remind: number | null;
  scheduled: boolean;
  date: string;
  time: string;
};

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const mins = totalMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** The next full hour after `now`, kept inside the visible day so the new block is on the timeline. */
function nextFullHour(now: Date, dayStart: number, dayEnd: number): string {
  const nowMinutes = now.getHours() * MINUTES_PER_HOUR + now.getMinutes();
  const next = (Math.floor(nowMinutes / MINUTES_PER_HOUR) + 1) * MINUTES_PER_HOUR;
  const latest = dayEnd - MINUTES_PER_HOUR;
  return formatTime(Math.min(Math.max(next, dayStart), latest));
}

function startTime(settings: Settings, { now, selectedDate }: NewTaskContext): string {
  const { startMode, startFixed } = settings.defaults;
  if (startMode === "fixed" || selectedDate !== dateKey(now)) return startFixed;
  return nextFullHour(now, settings.calendar.dayStart, settings.calendar.dayEnd);
}

/** `wanted` when it is still offered, otherwise "Focus", or the first offered category when "Focus" is hidden. */
export function pickCategory(wanted: Category, known: readonly Category[]): Category {
  if (known.includes(wanted)) return wanted;
  return known.includes(FALLBACK_CATEGORY) ? FALLBACK_CATEGORY : known[0] ?? FALLBACK_CATEGORY;
}

/**
 * Initial values of the editor for a NEW task. A tapped time slot always wins (the task is scheduled at that time);
 * a reminder is only kept when the task ends up scheduled, because a reminder needs a start time.
 */
export function newTaskDefaults(settings: Settings, context: NewTaskContext): NewTaskDefaults {
  const { defaults } = settings;
  const { slotTime, selectedDate, knownCategories = BUILTIN_CATEGORIES } = context;
  const scheduled = slotTime !== null || defaults.scheduleNew;
  return {
    duration: defaults.duration,
    category: pickCategory(defaults.category, knownCategories),
    remind: scheduled ? defaults.remind : null,
    scheduled,
    date: selectedDate,
    time: slotTime ?? startTime(settings, context),
  };
}
