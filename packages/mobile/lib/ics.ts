import { addDays, dateKey, fromKey, type Category, type Task } from "./planner";
import { contentKey } from "./task-storage";

/**
 * Reads an iCalendar (.ics) file exported from Google / Apple / Outlook calendar and turns its events into tasks.
 * Pure. What is understood: timed events (UTC `...Z` times become local, a `TZID` or floating time is taken as local),
 * DTEND or DURATION, and simple repeats (RRULE DAILY / WEEKLY with BYDAY / MONTHLY, INTERVAL, COUNT, UNTIL, EXDATE)
 * unrolled into the window. Skipped and counted: all-day events, cancelled ones, rules it does not understand
 * (YEARLY, BYSETPOS ...), events outside the window. An event that runs past midnight is cut at midnight.
 */
export const IMPORT_WINDOW_DAYS = 90;
export const MAX_IMPORTED_TASKS = 300;
const MAX_FILE_CHARS = 2_000_000;
const MAX_NOTES = 2000;
const MAX_TITLE = 300;
const DEFAULT_MINUTES = 60;
const MINUTES_PER_DAY = 1440;
const MAX_RULE_STEPS = 2000;
const DAYS_PER_WEEK = 7;
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export type IcsOccurrence = { uid: string; title: string; date: string; start: string; duration: number; notes: string };
export type IcsSkipped = { allDay: number; cancelled: number; unsupported: number; outsideWindow: number };
export type IcsResult = { ok: true; occurrences: IcsOccurrence[]; skipped: IcsSkipped; truncated: boolean } | { ok: false; reason: "not-calendar" | "too-large" };

type Prop = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const [name, ...rest] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));
}

type Moment = { date: string; minutes: number } | { date: string; minutes: null };

/** `20261105`, `20261105T090000` (local) or `20261105T090000Z` (UTC, shown in local time). Null when unreadable. */
function parseMoment(value: string): Moment | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (match[4] === undefined) return { date: `${match[1]}-${match[2]}-${match[3]}`, minutes: null };
  const [hour, minute] = [Number(match[4]), Number(match[5])];
  if (match[7] === "Z") {
    const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return { date: dateKey(local), minutes: local.getHours() * 60 + local.getMinutes() };
  }
  return { date: `${match[1]}-${match[2]}-${match[3]}`, minutes: hour * 60 + minute };
}

function dayDiff(from: string, to: string): number {
  return Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86_400_000);
}

/** Minutes between two moments on the calendar, or null when the end is not after the start. */
function lengthBetween(start: Moment, end: Moment): number | null {
  if (start.minutes === null || end.minutes === null) return null;
  const minutes = dayDiff(start.date, end.date) * MINUTES_PER_DAY + end.minutes - start.minutes;
  return minutes > 0 ? minutes : null;
}

function parseDuration(value: string): number | null {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1] ?? 0) * 10_080 + Number(match[2] ?? 0) * MINUTES_PER_DAY + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  return minutes > 0 ? minutes : null;
}

type Rule = { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; count: number | null; until: string | null; byDay: number[] };

/** Null when the rule uses a part this reader does not handle. */
function parseRule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const piece of value.split(";")) {
    const eq = piece.indexOf("=");
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1);
  }
  const freq = parts.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  if (["BYSETPOS", "BYMONTH", "BYYEARDAY", "BYWEEKNO", "BYHOUR", "BYMINUTE"].some(key => key in parts)) return null;
  if (parts.BYMONTHDAY !== undefined && (freq !== "MONTHLY" || parts.BYMONTHDAY.includes(","))) return null;
  const interval = parts.INTERVAL === undefined ? 1 : Number(parts.INTERVAL);
  if (!Number.isInteger(interval) || interval < 1) return null;
  let byDay: number[] = [];
  if (parts.BYDAY !== undefined) {
    if (freq !== "WEEKLY") return null;
    byDay = parts.BYDAY.split(",").map(code => WEEKDAY_CODES.indexOf(code.trim().toUpperCase()));
    if (byDay.some(day => day < 0)) return null;
  }
  const count = parts.COUNT === undefined ? null : Number(parts.COUNT);
  if (count !== null && (!Number.isInteger(count) || count < 1)) return null;
  // The date as written (a UTC time is not converted): the rule then ends on the same day whatever the phone's time zone.
  const untilMatch = parts.UNTIL === undefined ? null : /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL);
  const until = untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null;
  if (parts.UNTIL !== undefined && until === null) return null;
  return { freq, interval, count, until, byDay };
}

function sameDayNextMonths(start: string, months: number): string | null {
  const [year, month, day] = start.split("-").map(Number);
  const target = new Date(year, month - 1 + months, 1, 12);
  const candidate = new Date(target.getFullYear(), target.getMonth(), day, 12);
  // A day the month does not have (the 31st in April) is skipped, as calendars do.
  return candidate.getMonth() === target.getMonth() ? dateKey(candidate) : null;
}

/** The dates a rule produces from `start`, in order, never past `limit`. */
function ruleDates(rule: Rule, start: string, limit: string): string[] {
  const dates: string[] = [];
  const push = (date: string): boolean => {
    if (date < start) return true;
    if (date > limit || (rule.until !== null && date > rule.until)) return false;
    dates.push(date);
    return rule.count === null || dates.length < rule.count;
  };
  if (rule.freq === "DAILY") {
    for (let step = 0, day = start; step < MAX_RULE_STEPS; step += 1, day = addDays(day, rule.interval)) if (!push(day)) break;
  } else if (rule.freq === "WEEKLY") {
    const days = rule.byDay.length > 0 ? [...rule.byDay].sort((a, b) => a - b) : [fromKey(start).getDay()];
    const weekStart = addDays(start, -fromKey(start).getDay());
    outer: for (let week = 0; week < MAX_RULE_STEPS; week += 1) {
      const base = addDays(weekStart, week * rule.interval * DAYS_PER_WEEK);
      if (base > limit) break;
      for (const day of days) if (!push(addDays(base, day))) break outer;
    }
  } else {
    for (let step = 0; step < MAX_RULE_STEPS; step += 1) {
      const date = sameDayNextMonths(start, step * rule.interval);
      if (date !== null && !push(date)) break;
      if (date !== null && date > limit) break;
      if (step * rule.interval > 1200) break;
    }
  }
  return dates;
}

type Block = { props: Prop[] };

function eventBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") current = { props: [] };
    else if (upper === "END:VEVENT") {
      if (current) blocks.push(current);
      current = null;
    } else if (current) {
      const prop = parseLine(line);
      if (prop) current.props.push(prop);
    }
  }
  return blocks;
}

/** Reads `text` and returns every occurrence inside `[today, today + IMPORT_WINDOW_DAYS)`. Never throws. */
export function parseIcs(text: string, today: string): IcsResult {
  if (text.length > MAX_FILE_CHARS) return { ok: false, reason: "too-large" };
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, reason: "not-calendar" };
  const limit = addDays(today, IMPORT_WINDOW_DAYS - 1);
  const skipped: IcsSkipped = { allDay: 0, cancelled: 0, unsupported: 0, outsideWindow: 0 };
  const occurrences: IcsOccurrence[] = [];
  for (const { props } of eventBlocks(unfold(text))) {
    const first = (name: string): Prop | undefined => props.find(prop => prop.name === name);
    if (first("STATUS")?.value.trim().toUpperCase() === "CANCELLED") { skipped.cancelled += 1; continue; }
    const dtstart = first("DTSTART");
    const start = dtstart ? parseMoment(dtstart.value) : null;
    if (start === null) { skipped.unsupported += 1; continue; }
    if (start.minutes === null) { skipped.allDay += 1; continue; }
    const dtend = first("DTEND");
    const end = dtend ? parseMoment(dtend.value) : null;
    const length = (end ? lengthBetween(start, end) : null) ?? parseDuration(first("DURATION")?.value ?? "") ?? DEFAULT_MINUTES;
    const rrule = first("RRULE");
    const rule = rrule ? parseRule(rrule.value) : null;
    if (rrule && rule === null) { skipped.unsupported += 1; continue; }
    const excluded = new Set(props.filter(prop => prop.name === "EXDATE").flatMap(prop => prop.value.split(",")).map(value => parseMoment(value)?.date).filter((d): d is string => d !== undefined));
    const dates = (rule ? ruleDates(rule, start.date, limit) : [start.date]).filter(date => !excluded.has(date));
    const inside = dates.filter(date => date >= today && date <= limit);
    if (inside.length === 0) { skipped.outsideWindow += 1; continue; }
    const startMinutes = start.minutes;
    const duration = Math.max(1, Math.min(length, MINUTES_PER_DAY - startMinutes));
    const title = unescapeText(first("SUMMARY")?.value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || "Event";
    const notes = unescapeText(first("DESCRIPTION")?.value ?? "").trim().slice(0, MAX_NOTES);
    const clock = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
    const uid = first("UID")?.value.trim() || `${title}|${start.date}|${clock}`;
    for (const date of inside) occurrences.push({ uid, title, date, start: clock, duration, notes });
  }
  occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return { ok: true, occurrences: occurrences.slice(0, MAX_IMPORTED_TASKS), skipped, truncated: occurrences.length > MAX_IMPORTED_TASKS };
}

/** Same event, same day: always the same id, so importing the file again adds nothing. */
export function importedTaskId(occurrence: Pick<IcsOccurrence, "uid" | "date" | "start">): string {
  return `${contentKey("ics-", occurrence.uid)}:${occurrence.date}:${occurrence.start.replace(":", "")}`;
}

export type IcsPlan = { toAdd: Task[]; alreadyThere: number };

export function planIcsImport(occurrences: readonly IcsOccurrence[], existing: readonly Task[], category: Category, nowIso: string): IcsPlan {
  const taken = new Set(existing.map(task => task.id));
  const toAdd: Task[] = [];
  let alreadyThere = 0;
  for (const occurrence of occurrences) {
    const id = importedTaskId(occurrence);
    if (taken.has(id)) { alreadyThere += 1; continue; }
    taken.add(id);
    toAdd.push({
      id, title: occurrence.title, date: occurrence.date, start: occurrence.start, duration: occurrence.duration, status: "todo",
      category, notes: occurrence.notes, createdAt: nowIso, remind: null, seriesId: null, repeat: null,
    });
  }
  return { toAdd, alreadyThere };
}
