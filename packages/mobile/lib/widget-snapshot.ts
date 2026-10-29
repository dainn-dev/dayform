import { addDays, dateKey, minutes, type Task } from "./planner";
import { vi } from "./i18n/widget";

/** What the native home-screen widget reads. Titles are already localised or user-written; dates are local. */
export type WidgetItem = {
  /** Task title; null when the user hides titles on the widget. */
  t: string | null;
  /** Start time, `HH:mm`. */
  s: string;
  /** Duration in minutes. */
  d: number;
  /** 1 when the task is done. */
  x: 0 | 1;
};
export type WidgetDay = {
  /** Scheduled tasks that day (may be larger than `items.length`). */
  n: number;
  done: number;
  items: WidgetItem[];
};
export type WidgetLabels = { empty: string; more: string; today: string; tasks: string; task: string };
export type WidgetLocale = "en" | "vi";
export type WidgetSnapshot = {
  version: 1;
  generatedAt: number;
  locale: WidgetLocale;
  /** Only days that have at least one scheduled task, in date order. */
  days: Record<string, WidgetDay>;
  labels: WidgetLabels;
};
export type BuildOptions = {
  now: Date;
  showTitles: boolean;
  locale: WidgetLocale;
  /** Days covered, starting today. */
  days?: number;
  maxPerDay?: number;
};
export type WidgetSnapshotResult = {
  snapshot: WidgetSnapshot;
  json: string;
  /** True when days or items were dropped to stay under MAX_SNAPSHOT_BYTES. */
  truncated: boolean;
};

export const MAX_SNAPSHOT_BYTES = 60_000;
const DEFAULT_DAYS = 14;
const DEFAULT_MAX_PER_DAY = 12;
const MAX_TITLE_CHARS = 60;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
/** Share of a lone oversized day's items dropped per shrink step. */
const TRIM_KEEP_RATIO = 0.9;

const ENGLISH_LABELS: WidgetLabels = {
  empty: "Nothing planned today",
  more: "more",
  today: "Today",
  tasks: "tasks",
  task: "task",
};

function labelsFor(locale: WidgetLocale): WidgetLabels {
  if (locale === "en") return ENGLISH_LABELS;
  const translated = (text: string): string => vi[text] ?? text;
  return {
    empty: translated(ENGLISH_LABELS.empty),
    more: translated(ENGLISH_LABELS.more),
    today: translated(ENGLISH_LABELS.today),
    tasks: translated(ENGLISH_LABELS.tasks),
    task: translated(ENGLISH_LABELS.task),
  };
}

/** Number of bytes `text` takes as UTF-8 (TextEncoder is not guaranteed on every runtime). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function shortTitle(title: string): string {
  const chars = Array.from(title.replace(/\s+/g, " ").trim());
  return chars.length > MAX_TITLE_CHARS ? `${chars.slice(0, MAX_TITLE_CHARS - 1).join("")}…` : chars.join("");
}

function toItem(task: Task, showTitles: boolean): WidgetItem {
  return {
    t: showTitles ? shortTitle(task.title) : null,
    s: task.start ?? "",
    d: task.duration,
    x: task.status === "done" ? 1 : 0,
  };
}

function byStart(a: Task, b: Task): number {
  return minutes(a.start ?? "00:00") - minutes(b.start ?? "00:00") || a.id.localeCompare(b.id);
}

function buildDays(tasks: readonly Task[], keys: readonly string[], showTitles: boolean, maxPerDay: number) {
  const days: Record<string, WidgetDay> = {};
  for (const key of keys) {
    const sameDay = tasks
      .filter((task) => task.date === key && task.start !== null && TIME_PATTERN.test(task.start))
      .sort(byStart);
    if (sameDay.length === 0) continue;
    days[key] = {
      n: sameDay.length,
      done: sameDay.filter((task) => task.status === "done").length,
      items: sameDay.slice(0, maxPerDay).map((task) => toItem(task, showTitles)),
    };
  }
  return days;
}

/** One shrink step: drop the farthest day, or trim the items of the only day left. */
function shrink(snapshot: WidgetSnapshot): WidgetSnapshot {
  const entries = Object.entries(snapshot.days);
  if (entries.length > 1) return { ...snapshot, days: Object.fromEntries(entries.slice(0, -1)) };
  const [[key, day]] = entries;
  const keep = Math.floor(day.items.length * TRIM_KEEP_RATIO);
  return { ...snapshot, days: { [key]: { ...day, items: day.items.slice(0, keep) } } };
}

function fitSize(snapshot: WidgetSnapshot): WidgetSnapshotResult {
  let current = snapshot;
  let json = JSON.stringify(current);
  let truncated = false;
  while (utf8ByteLength(json) > MAX_SNAPSHOT_BYTES) {
    truncated = true;
    current = shrink(current);
    json = JSON.stringify(current);
  }
  return { snapshot: current, json, truncated };
}

/** Builds the widget payload from the scheduled tasks of today and the following days. */
export function buildWidgetSnapshot(tasks: readonly Task[], options: BuildOptions): WidgetSnapshotResult {
  const { now, showTitles, locale, days = DEFAULT_DAYS, maxPerDay = DEFAULT_MAX_PER_DAY } = options;
  const today = dateKey(now);
  const keys = Array.from({ length: days }, (_, index) => addDays(today, index));
  return fitSize({
    version: 1,
    generatedAt: now.getTime(),
    locale,
    days: buildDays(tasks, keys, showTitles, maxPerDay),
    labels: labelsFor(locale),
  });
}

/** Change detection for the sender: everything except `generatedAt` counts. */
export function snapshotsEqual(a: WidgetSnapshot | null, b: WidgetSnapshot | null): boolean {
  if (a === null || b === null) return false;
  return JSON.stringify({ ...a, generatedAt: 0 }) === JSON.stringify({ ...b, generatedAt: 0 });
}
