import { addDays, dateKey, minutes, type Task } from "./planner";
import { vi } from "./i18n/widget";
import type { DayMark } from "./day-marks";
import type { PetKind } from "./settings";

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
  /** Names of the day's holidays and special days (at most MAX_MARKS), already in the language. Left out when none. */
  m?: string[];
  /** 1 when one of the user's own special days falls on this day. */
  sp?: 1;
};
export type WidgetLabels = { empty: string; more: string; today: string; tasks: string; task: string; special: string };
export type WidgetLocale = "en" | "vi";
export type WidgetSnapshot = {
  version: 1;
  generatedAt: number;
  locale: WidgetLocale;
  /** Only days that have at least one scheduled task, in date order. */
  days: Record<string, WidgetDay>;
  labels: WidgetLabels;
  /** The pet the user chose; an older widget build ignores both fields. */
  pet: PetKind;
  /** Whether the pet strolls along the bottom (true) or stays in the corner (false). */
  petWalks: boolean;
};
export type BuildOptions = {
  now: Date;
  showTitles: boolean;
  locale: WidgetLocale;
  pet?: PetKind;
  petWalks?: boolean;
  /** The holidays and special days of the given days (lib/day-marks.ts); omitted when the widget shows none. */
  marksFor?: (keys: readonly string[]) => Record<string, DayMark[]>;
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
/** The widget shows at most this many names under its header, each cut to this many characters. */
const MAX_MARKS = 2;
const MAX_MARK_CHARS = 40;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
/** Share of a lone oversized day's items dropped per shrink step. */
const TRIM_KEEP_RATIO = 0.9;

const ENGLISH_LABELS: WidgetLabels = {
  empty: "Nothing planned today",
  more: "more",
  today: "Today",
  tasks: "tasks",
  task: "task",
  special: "Special day",
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
    special: translated(ENGLISH_LABELS.special),
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

function shortText(text: string, limit: number): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length > limit ? `${chars.slice(0, limit - 1).join("")}…` : chars.join("");
}

function shortTitle(title: string): string {
  return shortText(title, MAX_TITLE_CHARS);
}

/** The lines shown under the widget's header: a user-written name becomes the generic label when titles are hidden. */
function markLines(marks: readonly DayMark[], showTitles: boolean, genericLabel: string): string[] {
  return marks.slice(0, MAX_MARKS).map((mark) => (mark.userText && !showTitles ? genericLabel : shortText(mark.label, MAX_MARK_CHARS)));
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

type DayContext = { showTitles: boolean; maxPerDay: number; marks: Record<string, DayMark[]>; genericLabel: string };

function buildDays(tasks: readonly Task[], keys: readonly string[], context: DayContext) {
  const { showTitles, maxPerDay, marks, genericLabel } = context;
  const days: Record<string, WidgetDay> = {};
  for (const key of keys) {
    const sameDay = tasks
      .filter((task) => task.date === key && task.start !== null && TIME_PATTERN.test(task.start))
      .sort(byStart);
    const dayMarks = marks[key] ?? [];
    // A day with nothing scheduled still appears when it has something to mark, so the widget can say what it is.
    if (sameDay.length === 0 && dayMarks.length === 0) continue;
    const lines = markLines(dayMarks, showTitles, genericLabel);
    days[key] = {
      n: sameDay.length,
      done: sameDay.filter((task) => task.status === "done").length,
      items: sameDay.slice(0, maxPerDay).map((task) => toItem(task, showTitles)),
      ...(lines.length > 0 ? { m: lines } : {}),
      ...(dayMarks.some((mark) => mark.kind === "special") ? { sp: 1 as const } : {}),
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
  const { now, showTitles, locale, days = DEFAULT_DAYS, maxPerDay = DEFAULT_MAX_PER_DAY, pet = "orange-cat", petWalks = true, marksFor } = options;
  const today = dateKey(now);
  const keys = Array.from({ length: days }, (_, index) => addDays(today, index));
  const labels = labelsFor(locale);
  return fitSize({
    version: 1,
    generatedAt: now.getTime(),
    locale,
    days: buildDays(tasks, keys, { showTitles, maxPerDay, marks: marksFor?.(keys) ?? {}, genericLabel: labels.special }),
    labels,
    pet,
    petWalks,
  });
}

/** Change detection for the sender: everything except `generatedAt` counts. */
export function snapshotsEqual(a: WidgetSnapshot | null, b: WidgetSnapshot | null): boolean {
  if (a === null || b === null) return false;
  return JSON.stringify({ ...a, generatedAt: 0 }) === JSON.stringify({ ...b, generatedAt: 0 });
}
