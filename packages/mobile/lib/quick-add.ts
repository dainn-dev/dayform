import { addDays, dateKey, fromKey, mondayOf, type Category, type Repeat } from "./planner";
import type { SaveForm } from "./task-save";

/**
 * Natural-language quick add: "họp team 3pm mai 45p", "chạy bộ mỗi sáng 6h", "trả tiền nhà mỗi tháng".
 * Framework-free. The text is read in Vietnamese and English; what is recognised is cut out and the rest is the title.
 *
 * Reading rules (the ones that could be ambiguous):
 *  - `15h`, `15:30`, `3pm`, `9h-10h30` are times; `N giờ` / `N hours` is a duration unless a period word follows
 *    ("3 giờ chiều") or "lúc"/"at" precedes it. A duration written with `h` needs "trong"/"for" before it.
 *  - `15/11` is day/month (Vietnamese order); a date already past this year means next year.
 *  - A weekday is the next one after today ("thứ hai" said on a Monday is next Monday); "tuần sau" pushes it to next week.
 *  - A time without a day is today when it is still ahead, tomorrow otherwise; a day without a time takes the default start.
 *  - "tôi" (I) is not "tối" (evening) and "sang" is not "sáng" (morning): those day parts need their accent when
 *    written alone (next to "nay"/"mai" they are unambiguous).
 */

export type QuickAddContext = {
  /** The current moment: the wall clock is never read here. */
  now: Date;
  /** Categories a `#tag` may name: the id and the name the user sees (translated or user-written). */
  categories?: readonly { id: Category; name: string }[];
};

export type QuickAddResult = {
  /** Empty when the text holds nothing but recognised words. */
  title: string;
  /** Set together with `start`, or both null (a backlog task). `start` is null only when `date` is too, or for a bare repeat. */
  date: string | null;
  start: string | null;
  /** Minutes, or null when none was written (the user's default applies). */
  duration: number | null;
  repeat: Repeat | null;
  category: Category | null;
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const DAYS_PER_WEEK = 7;
const MAX_DURATION = 1440;
const COMBINING_MARKS = /\p{M}/u;
const ACUTE = "\u0301";

/** Default time of a day part named without a clock time ("tối nay"). */
const DAY_PART_MINUTES: Record<string, number> = { sang: 9 * 60, trua: 12 * 60, chieu: 15 * 60, toi: 19 * 60 };
const DAY_PART_WORDS: Record<string, string> = { morning: "sang", afternoon: "chieu", evening: "toi", tonight: "toi" };

/** One UTF-16 unit in, one out, so a match in the folded text points at the same place of the original. */
function foldText(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.toLowerCase().normalize("NFD").replace(/đ/g, "d");
    const first = [...base].find(c => !COMBINING_MARKS.test(c)) ?? " ";
    out += first.padEnd(ch.length, " ").slice(0, ch.length);
  }
  return out;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const clock = (minutes: number): string => `${pad2(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad2(minutes % MINUTES_PER_HOUR)}`;

function validDate(year: number, month: number, day: number): string | null {
  const key = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
  return month >= 1 && month <= 12 && day >= 1 && dateKey(fromKey(key)) === key ? key : null;
}

/** First day after `from` (never `from` itself) that falls on weekday `dow` (0 = Sunday). */
function nextWeekday(from: string, dow: number): string {
  const gap = (dow - fromKey(from).getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(from, gap === 0 ? DAYS_PER_WEEK : gap);
}

const WEEKDAY_NAMES: [string, number][] = [
  ["chu\\s*nhat", 0], ["cn", 0], ["sunday", 0],
  ["thu\\s*hai", 1], ["t2", 1], ["monday", 1],
  ["thu\\s*ba", 2], ["t3", 2], ["tuesday", 2],
  ["thu\\s*tu", 3], ["t4", 3], ["wednesday", 3],
  ["thu\\s*nam", 4], ["t5", 4], ["thursday", 4],
  ["thu\\s*sau", 5], ["t6", 5], ["friday", 5],
  ["thu\\s*bay", 6], ["t7", 6], ["saturday", 6],
];
const WEEKDAY_SOURCE = WEEKDAY_NAMES.map(([name]) => name).join("|");
const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAY_SOURCE})\\b`);
const EVERY_WEEKDAY_RE = new RegExp(`\\b(?:moi|hang|every)\\s+(${WEEKDAY_SOURCE})\\b`);

function weekdayOf(word: string): number {
  const squeezed = word.replace(/\s+/g, "");
  const found = WEEKDAY_NAMES.find(([name]) => name.replace(/\\s\*/g, "") === squeezed);
  return found ? found[1] : 0;
}

/** Words that may be left hanging at an edge of the title once the rest was cut out. */
const FILLER = new Set(["luc", "vao", "at", "on", "for", "trong", "den", "to", "from", "tu", "nhe", "nha", "in", "by", "every", "moi", "hang", "ngay"]);

type Cutter = {
  /** Runs `re` on what is left; on a match the span is blanked and the match returned. */
  take(re: RegExp): RegExpExecArray | null;
  /** Like `take`, but leaves the text alone until `remove` is called (for a match that may be refused). */
  peek(re: RegExp): RegExpExecArray | null;
  remove(match: RegExpExecArray): void;
  /** The part of the original text a match covered. */
  original(match: RegExpExecArray): string;
  keptText(): string;
};

function cutter(source: string): Cutter {
  let work = foldText(source);
  const gone: boolean[] = Array.from({ length: source.length }, () => false);
  const remove = (match: RegExpExecArray): void => {
    const from = match.index;
    const to = from + match[0].length;
    work = work.slice(0, from) + " ".repeat(to - from) + work.slice(to);
    for (let i = from; i < to; i++) gone[i] = true;
  };
  return {
    take(re) {
      const match = re.exec(work);
      if (match) remove(match);
      return match;
    },
    peek: re => re.exec(work),
    remove,
    original: match => source.slice(match.index, match.index + match[0].length),
    keptText: () => Array.from({ length: source.length }, (_, i) => (gone[i] ? " " : source[i])).join(""),
  };
}

function periodHour(hour: number, period: string | undefined): number | null {
  if (hour > 23) return null;
  switch (period) {
    case "pm": case "chieu": case "toi": return hour < 12 ? hour + 12 : hour;
    case "am": case "sang": return hour === 12 ? 0 : hour;
    case "trua": return hour <= 3 ? hour + 12 : hour;
    case "dem": return hour === 12 ? 0 : hour < 6 ? hour : hour < 12 ? hour + 12 : hour;
    default: return hour;
  }
}

function toMinutes(hour: number, minute: number, period?: string): number | null {
  const h = periodHour(hour, period);
  return h === null || minute > 59 ? null : h * MINUTES_PER_HOUR + minute;
}

type Time = { start: number; end: number | null };

const PERIOD = "(am|pm|sang|trua|chieu|toi|dem)";
const RANGE_RE = /(?<![\d:])(\d{1,2})[:h](\d{2})?\s*(?:-|–|den|to)\s*(\d{1,2})[:h](\d{2})?(?![\d:a-z])/;
const GIO_PERIOD_RE = new RegExp(`(?<![\\d:/])(\\d{1,2})\\s*(?:gio|tieng)\\s*(\\d{2})?\\s*${PERIOD}\\b`);
const AFTER_AT_RE = new RegExp(`\\b(?:luc|at)\\s+(\\d{1,2})(?:\\s*(?:gio|tieng|h(?![a-z]))\\s*(\\d{2})?)?\\s*(?:${PERIOD}\\b)?(?![\\d:/])`);
const MERIDIEM_RE = /(?<![\d:/])(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
const CLOCK_RE = new RegExp(`(?<![\\d:/])(\\d{1,2})\\s*(?::|h(?![a-z]))\\s*(\\d{2})?\\s*(?:${PERIOD}\\b)?(?!\\d)`);

function timeFrom(match: RegExpExecArray, hourAt: number, minuteAt: number | null, periodAt: number): number | null {
  const minute = minuteAt === null ? 0 : Number(match[minuteAt] ?? 0);
  return toMinutes(Number(match[hourAt]), minute, match[periodAt]);
}

/** Times that can be told from a duration by their shape ("9h-10h30", "3 giờ chiều", "lúc 9"): read before durations. */
function takeSureTime(cut: Cutter): Time | null {
  const range = cut.take(RANGE_RE);
  if (range) {
    const a = toMinutes(Number(range[1]), Number(range[2] ?? 0));
    const b = toMinutes(Number(range[3]), Number(range[4] ?? 0));
    if (a !== null && b !== null && b > a) return { start: a, end: b };
  }
  const gio = cut.take(GIO_PERIOD_RE);
  const fromGio = gio ? timeFrom(gio, 1, 2, 3) : null;
  if (fromGio !== null) return { start: fromGio, end: null };
  const at = cut.take(AFTER_AT_RE);
  const fromAt = at ? timeFrom(at, 1, 2, 3) : null;
  return fromAt === null ? null : { start: fromAt, end: null };
}

/** `15h`, `15:30`, `3pm`: read after the durations, so "for 2h" is not taken for 02:00. */
function takeClockTime(cut: Cutter): Time | null {
  const meridiem = cut.take(MERIDIEM_RE);
  const fromMeridiem = meridiem ? timeFrom(meridiem, 1, 2, 3) : null;
  if (fromMeridiem !== null) return { start: fromMeridiem, end: null };
  const clockMatch = cut.take(CLOCK_RE);
  const fromClock = clockMatch ? timeFrom(clockMatch, 1, 2, 3) : null;
  return fromClock === null ? null : { start: fromClock, end: null };
}

const MINUTES_UNIT = "phut|mins?|minutes?|p|m";
const KEYWORD_H_RE = /\b(?:trong(?:\s+vong)?|keo\s+dai|for|khoang)\s*(\d+)\s*h(?![a-z])\s*(\d{1,2})?/;
const HOURS_RE = new RegExp(`(?<![\\d:/])(\\d+(?:[.,]\\d+)?)\\s*(?:gio|tieng|hours?|hrs?)\\b(?:\\s*(\\d{1,2})\\s*(?:${MINUTES_UNIT})\\b)?`);
const MINUTES_RE = new RegExp(`(?<![\\d:/])(\\d+)\\s*(?:${MINUTES_UNIT})\\b`);

function takeDuration(cut: Cutter): number | null {
  const keyword = cut.take(KEYWORD_H_RE);
  if (keyword) return Number(keyword[1]) * MINUTES_PER_HOUR + Number(keyword[2] ?? 0);
  const hours = cut.take(HOURS_RE);
  if (hours) return Math.round(Number(hours[1].replace(",", ".")) * MINUTES_PER_HOUR) + Number(hours[2] ?? 0);
  const minutes = cut.take(MINUTES_RE);
  return minutes ? Number(minutes[1]) : null;
}

const REPEAT_RULES: [RegExp, Repeat][] = [
  [/\b(?:ngay thuong|cac ngay trong tuan|moi ngay thuong|weekdays?|every weekday)\b/, "weekdays"],
  [/\b(?:moi ngay|hang ngay|every\s*day|daily)\b/, "daily"],
  [/\b(?:moi tuan|hang tuan|every\s*week|weekly)\b/, "weekly"],
  [/\b(?:moi thang|hang thang|every\s*month|monthly)\b/, "monthly"],
];
const EVERY_PART_RE = /\b(?:moi|hang|every)\s+(sang|trua|chieu|toi|morning|afternoon|evening|night)\b/;

type Repetition = { rule: Repeat; weekday: number | null; part: string | null };

function takeRepeat(cut: Cutter): Repetition | null {
  const weekly = cut.take(EVERY_WEEKDAY_RE);
  if (weekly) return { rule: "weekly", weekday: weekdayOf(weekly[1]), part: null };
  const part = cut.take(EVERY_PART_RE);
  if (part) return { rule: "daily", weekday: null, part: part[1] === "night" ? "toi" : DAY_PART_WORDS[part[1]] ?? part[1] };
  for (const [re, rule] of REPEAT_RULES) {
    if (cut.take(re)) return { rule, weekday: null, part: null };
  }
  return null;
}

function takeExplicitDate(cut: Cutter, today: string): string | null {
  const iso = cut.take(/(?<![\d/-])(\d{4})-(\d{2})-(\d{2})(?![\d/-])/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = cut.take(/(?<![\d/:])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/:])/);
  if (slash) {
    const [year, month, day] = [Number(today.slice(0, 4)), Number(slash[2]), Number(slash[1])];
    if (slash[3]) {
      const written = Number(slash[3]);
      return validDate(slash[3].length === 2 ? 2000 + written : written, month, day);
    }
    const thisYear = validDate(year, month, day);
    if (thisYear === null) return null;
    return thisYear >= today ? thisYear : validDate(year + 1, month, day);
  }
  const dayOnly = cut.take(/\b(?:ngay|on the|on)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*[:h/])/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const sameMonth = validDate(year, month, day);
    if (sameMonth !== null && sameMonth >= today) return sameMonth;
    const next = month === 12 ? validDate(year + 1, 1, day) : validDate(year, month + 1, day);
    return next ?? sameMonth;
  }
  return null;
}

const DAY_PART_DAY_RE = /\b(sang|trua|chieu|toi)\s+(nay|mai|mot)\b/;
const DAY_OFFSET: Record<string, number> = { nay: 0, mai: 1, mot: 2 };

function takeRelativeDate(cut: Cutter, today: string): string | null {
  if (cut.take(/\b(?:hom nay|today)\b/)) return today;
  if (cut.take(/\b(?:ngay mai|tomorrow|tmrw|tmr)\b/) || cut.take(/\bmai\b/)) return addDays(today, 1);
  if (cut.take(/\b(?:ngay kia|ngay mot|day after tomorrow)\b/)) return addDays(today, 2);
  const later = cut.take(/\b(?:sau|in)\s+(\d{1,3})\s*(ngay|days?|tuan|weeks?)\b|\b(\d{1,3})\s*(ngay|tuan)\s+nua\b/);
  if (!later) return null;
  const amount = Number(later[1] ?? later[3]);
  return addDays(today, /^(?:tuan|week)/.test(later[2] ?? later[4]) ? amount * DAYS_PER_WEEK : amount);
}

/** A weekday (or "next week") date; "next week" lands the weekday after the end of the current week. */
function takeWeekDate(cut: Cutter, today: string, repeatWeekday: number | null): string | null {
  const week = cut.take(/\b(tuan sau|tuan toi|next week|tuan nay|this week)\b/);
  const named = cut.take(WEEKDAY_RE);
  const weekday = named ? weekdayOf(named[1]) : repeatWeekday;
  const wantsNext = week !== null && /sau|toi|next/.test(week[1]);
  if (weekday === null) return wantsNext ? addDays(today, DAYS_PER_WEEK) : null;
  let date = nextWeekday(today, weekday);
  const nextWeekStart = addDays(mondayOf(today), DAYS_PER_WEEK);
  while (wantsNext && date < nextWeekStart) date = addDays(date, DAYS_PER_WEEK);
  return date;
}

function takeCategory(cut: Cutter, categories: QuickAddContext["categories"]): Category | null {
  if (!categories || categories.length === 0) return null;
  const tag = cut.peek(/(?:^|\s)#([^\s#]+)/);
  if (!tag) return null;
  const wanted = foldText(tag[1]);
  const squeezed = (name: string): string => foldText(name).replace(/\s+/g, "");
  const found = categories.find(c => squeezed(c.name) === wanted || foldText(c.id) === wanted)
    ?? categories.find(c => squeezed(c.name).startsWith(wanted));
  if (!found) return null;
  cut.remove(tag);
  return found.id;
}

/** A lone day part: "tối"/"sáng" need their acute accent, or "tôi" (I) and "sang" (to cross) would count. */
function takeDayPart(cut: Cutter): string | null {
  const match = cut.peek(/\b(sang|trua|chieu|toi|morning|afternoon|evening|tonight)\b/);
  if (!match) return null;
  const word = DAY_PART_WORDS[match[1]] ?? match[1];
  const written = cut.original(match);
  const needsAccent = word === "sang" || word === "toi";
  const english = match[1] in DAY_PART_WORDS;
  if (needsAccent && !english && !written.normalize("NFD").includes(ACUTE)) return null;
  cut.remove(match);
  return word;
}

function cleanTitle(raw: string): string {
  const words = raw.replace(/[,;:]+/g, " ").split(/\s+/).filter(Boolean);
  const isFiller = (word: string): boolean => FILLER.has(foldText(word).replace(/[.!]+$/, ""));
  while (words.length > 0 && isFiller(words[0])) words.shift();
  while (words.length > 0 && isFiller(words[words.length - 1])) words.pop();
  return words.join(" ").trim();
}

/** Reads `text`; never throws. An empty or unreadable text gives an empty title and no schedule. */
export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAddResult {
  const source = text.normalize("NFC");
  const today = dateKey(ctx.now);
  const nowMinutes = ctx.now.getHours() * MINUTES_PER_HOUR + ctx.now.getMinutes();
  const cut = cutter(source);

  const category = takeCategory(cut, ctx.categories);
  const explicitDate = takeExplicitDate(cut, today);
  const repetition = takeRepeat(cut);
  const sureTime = takeSureTime(cut);
  const duration = takeDuration(cut);
  const time = sureTime ?? takeClockTime(cut);
  // After the clock time, so the "chiều" of "3 giờ chiều mai" belongs to the time and not to "chiều mai".
  const partDay = cut.take(DAY_PART_DAY_RE);
  const relative = explicitDate ?? (partDay ? addDays(today, DAY_OFFSET[partDay[2]]) : takeRelativeDate(cut, today));
  const weekDate = relative === null ? takeWeekDate(cut, today, repetition?.weekday ?? null) : null;
  const lonePart = time === null && partDay === null && repetition?.part == null ? takeDayPart(cut) : null;

  const part = partDay ? partDay[1] : repetition?.part ?? lonePart;
  const date = relative ?? weekDate;
  const start = time ? time.start : part ? DAY_PART_MINUTES[part] : null;
  const written = time?.end != null ? time.end - time.start : duration;

  const wantsSchedule = date !== null || start !== null || repetition !== null;
  const slideToTomorrow = date === null && start !== null && start < nowMinutes && repetition === null;
  const day = !wantsSchedule ? null : date ?? (slideToTomorrow ? addDays(today, 1) : today);

  return {
    title: cleanTitle(cut.keptText()),
    date: day,
    start: day === null || start === null ? null : clock(start),
    duration: written === null ? null : Math.min(Math.max(Math.round(written), 1), MAX_DURATION),
    repeat: repetition?.rule ?? null,
    category,
  };
}

export type QuickAddDefaults = {
  duration: number;
  category: Category;
  remind: number | null;
  /** HH:mm used when a day was named without a time. */
  startTime: string;
};

/**
 * The editor form for a parsed text: the defaults fill what the text left out, and a task that would pass midnight
 * is shortened (or started earlier) so it fits the day. Returns null when there is no title.
 */
export function quickAddForm(result: QuickAddResult, defaults: QuickAddDefaults): SaveForm | null {
  if (result.title === "") return null;
  const scheduled = result.date !== null;
  let time = result.start ?? defaults.startTime;
  let length = result.duration ?? defaults.duration;
  if (scheduled) {
    const [h, m] = time.split(":").map(Number);
    const startMinutes = h * MINUTES_PER_HOUR + m;
    if (startMinutes + length > MINUTES_PER_DAY) {
      if (result.start === null) time = clock(Math.max(0, MINUTES_PER_DAY - length));
      else length = MINUTES_PER_DAY - startMinutes;
    }
  }
  return {
    title: result.title,
    duration: length,
    scheduled,
    date: result.date ?? "",
    time,
    category: result.category ?? defaults.category,
    status: "todo",
    notes: "",
    remind: scheduled ? defaults.remind : null,
    repeat: scheduled ? result.repeat : null,
  };
}
