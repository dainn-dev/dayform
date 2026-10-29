export type Status = "todo" | "in_progress" | "done";
/**
 * A category id: one of the built-in ids ("Focus", "Work", "Personal", "Wellness") or a user-defined
 * `c_xxxxxxxx` id (see lib/categories.ts). Stored tasks may reference an id that no longer exists.
 */
export type Category = string;
export type Repeat = "daily" | "weekdays" | "weekly" | "monthly";
export const repeats: Repeat[] = ["daily", "weekdays", "weekly", "monthly"];
/** Minutes before `start` that a reminder can fire. */
export const reminderOptions = [0, 5, 15, 30, 60] as const;
export type Task = {
  id: string;
  title: string;
  date: string | null;
  start: string | null;
  duration: number;
  status: Status;
  category: Category;
  notes: string;
  createdAt: string;
  /** Minutes before `start` to notify; null/undefined = no reminder. Scheduled tasks only. */
  remind?: number | null;
  /** Links the generated occurrences of one recurring task. Scheduled tasks only. */
  seriesId?: string | null;
  repeat?: Repeat | null;
  /** Last day (local YYYY-MM-DD, inclusive) a repeating task may occur; null/undefined = never ends. Needs `repeat`. */
  repeatUntil?: string | null;
};

/** Ids of the categories that ship with the app. Their display names are translated; the ids never change. */
export const BUILTIN_CATEGORIES = ["Focus", "Work", "Personal", "Wellness"] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];
export const categories: readonly BuiltinCategory[] = BUILTIN_CATEGORIES;
/** Styles of the built-in categories only; custom ones are resolved through `resolveCategory` in lib/categories.ts. */
export const categoryStyle: Record<BuiltinCategory, { bg: string; accent: string; icon: string }> = {
  Focus: { bg: "#E9EEFF", accent: "#5A78DD", icon: "bulb-outline" },
  Work: { bg: "#EBF7F5", accent: "#4BB3A4", icon: "briefcase-outline" },
  Personal: { bg: "#FFF3E8", accent: "#EDAA6A", icon: "heart-outline" },
  Wellness: { bg: "#FCECF0", accent: "#E38AA5", icon: "walk-outline" },
};

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function fromKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(key: string, days: number) {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function mondayOf(key: string) {
  const d = fromKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}
export type WeekStart = "mon" | "sun" | "sat";
const WEEK_START_DAY: Record<WeekStart, number> = { sun: 0, mon: 1, sat: 6 };
const DAYS_PER_WEEK = 7;

/** First day of the week containing `key`, for a week that starts on `weekStart`. */
export function weekStartOf(key: string, weekStart: WeekStart): string {
  const offset = (fromKey(key).getDay() - WEEK_START_DAY[weekStart] + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(key, -offset);
}
/** The seven consecutive day keys of the week that begins on `startKey`. */
export function weekDays(startKey: string): string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(startKey, i));
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function timeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export type TimeFormat = "12h" | "24h";
/** The "Time format" setting resolved: "auto" is 24h for Vietnamese and 12h otherwise. */
export function resolveTimeFormat(setting: "auto" | TimeFormat, language: string): TimeFormat {
  if (setting !== "auto") return setting;
  return language === "vi" ? "24h" : "12h";
}
/** A stored HH:mm shown in the chosen format (the stored value itself never changes). */
export function formatTime(time: string, format: TimeFormat): string {
  return format === "24h" ? time : timeLabel(time);
}
export function durationLabel(value: number) {
  const h = Math.floor(value / 60), m = value % 60;
  return h ? `${h} hr${m ? ` ${m} min` : ""}` : `${m} min`;
}
export function overlaps(a: Task, b: Task) {
  if (!a.date || !a.start || a.date !== b.date || !b.start || a.id === b.id) return false;
  const x = minutes(a.start), y = minutes(b.start);
  return x < y + b.duration && y < x + a.duration;
}
export function seedTasks(): Task[] {
  const today = dateKey(new Date());
  const sample: [string, string | null, number, Category, Status][] = [
    ["Plan the week ahead", "08:00", 45, "Focus", "done"],
    ["Deep work session", "09:30", 90, "Focus", "in_progress"],
    ["Team check-in", "11:30", 45, "Work", "todo"],
    ["Lunch & reset", "13:00", 60, "Personal", "todo"],
    ["Afternoon walk", "15:00", 30, "Wellness", "todo"],
    ["Review project notes", null, 45, "Work", "todo"],
    ["Read for 20 minutes", null, 20, "Personal", "todo"],
  ];
  return sample.map(([title, start, duration, category, status], i) => ({
    id: `sample-${i}`, title, date: start ? today : null, start, duration, category, status,
    notes: "", createdAt: new Date().toISOString(),
  }));
}