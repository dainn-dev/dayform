/**
 * The Vietnamese lunisolar calendar (âm lịch): solar date <-> lunar date, offline, for 1900-2100.
 *
 * It follows Hồ Ngọc Đức's well-known algorithm: a lunar month starts on the day of the new moon and the lunar
 * year is anchored on the month that holds the winter solstice (month 11), both worked out for UTC+7, the time zone
 * the Vietnamese calendar uses whatever the device's own zone is. Only the date numbers matter, so nothing here
 * depends on the device's time zone. Dates are `YYYY-MM-DD` strings like everywhere else in the app.
 */
export type LunarDate = {
  day: number;
  month: number;
  year: number;
  /** The month is the repeated (leap, nhuận) month of its number. */
  leap: boolean;
};

export const LUNAR_FIRST_YEAR = 1900;
export const LUNAR_LAST_YEAR = 2100;

const TIME_ZONE = 7;
const SYNODIC_MONTH = 29.530588853;
const MONTH_ANCHOR = 2415021.076998695;
const EPOCH_OFFSET = 2415021;
const DEG = Math.PI / 180;
/** A new moon whose sun longitude is already in this sector (30 degrees each) is too late to start month 11. */
const WINTER_SECTOR = 9;
const SECTORS_PER_TURN = 12;
const DAYS_IN_PLAIN_YEAR = 365;
const MONTH_ESTIMATE_DAYS = 29;
const MAX_LEAP_SEARCH = 14;

const floor = Math.floor;

function julianDay(day: number, month: number, year: number): number {
  const a = floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045;
}

function toKey(jd: number): string {
  const a = jd + 32044;
  const b = floor((4 * a + 3) / 146097);
  const c = a - floor((b * 146097) / 4);
  const d = floor((4 * c + 3) / 1461);
  const e = c - floor((1461 * d) / 4);
  const m = floor((5 * e + 2) / 153);
  const day = e - floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * floor(m / 10);
  const year = b * 100 + d - 4800 + floor(m / 10);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Julian day number of the (local, UTC+7) day on which the k-th new moon after 1900 falls. */
function newMoonDay(k: number): number {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  let jd = 2415020.75933 + SYNODIC_MONTH * k + 0.0001178 * t2 - 0.000000155 * t3;
  jd += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * DEG);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mp = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  let c = (0.1734 - 0.000393 * t) * Math.sin(m * DEG) + 0.0021 * Math.sin(2 * DEG * m);
  c -= 0.4068 * Math.sin(mp * DEG) - 0.0161 * Math.sin(DEG * 2 * mp);
  c -= 0.0004 * Math.sin(DEG * 3 * mp);
  c += 0.0104 * Math.sin(DEG * 2 * f) - 0.0051 * Math.sin(DEG * (m + mp));
  c -= 0.0074 * Math.sin(DEG * (m - mp)) - 0.0004 * Math.sin(DEG * (2 * f + m));
  c -= 0.0004 * Math.sin(DEG * (2 * f - m)) + 0.0006 * Math.sin(DEG * (2 * f + mp));
  c += 0.001 * Math.sin(DEG * (2 * f - mp)) + 0.0005 * Math.sin(DEG * (2 * mp + m));
  const deltaT = t < -11
    ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
    : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return floor(jd + c - deltaT + 0.5 + TIME_ZONE / 24);
}

/** The sun's longitude at local midnight of day `jdn`, in 30-degree sectors (0-11). */
function sunSector(jdn: number): number {
  const t = (jdn - 2451545.5 - TIME_ZONE / 24) / 36525;
  const t2 = t * t;
  const m = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  let dl = (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(DEG * m);
  dl += (0.019993 - 0.000101 * t) * Math.sin(DEG * 2 * m) + 0.00029 * Math.sin(DEG * 3 * m);
  let l = (l0 + dl) * DEG;
  l -= Math.PI * 2 * floor(l / (Math.PI * 2));
  return floor((l / Math.PI) * 6);
}

/** Start day of the lunar month 11 (the one with the winter solstice) of the solar year `year`. */
function lunarMonth11(year: number): number {
  const off = julianDay(31, 12, year) - EPOCH_OFFSET;
  const k = floor(off / SYNODIC_MONTH);
  const nm = newMoonDay(k);
  return sunSector(nm) >= WINTER_SECTOR ? newMoonDay(k - 1) : nm;
}

/** How many months after month 11 the leap month comes, in a lunar year of 13 months starting at month 11 `a11`. */
function leapMonthOffset(a11: number): number {
  const k = floor((a11 - MONTH_ANCHOR) / SYNODIC_MONTH + 0.5);
  let last = 0;
  let i = 1;
  let arc = sunSector(newMoonDay(k + i));
  do {
    last = arc;
    i += 1;
    arc = sunSector(newMoonDay(k + i));
  } while (arc !== last && i < MAX_LEAP_SEARCH);
  return i - 1;
}

function parseKey(key: string): { day: number; month: number; year: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { day, month, year };
}

/** The lunar date of a solar date (`YYYY-MM-DD`; years 1901-2099 are reliable). */
export function solarToLunar(key: string): LunarDate {
  const { day: dd, month: mm, year: yy } = parseKey(key);
  const dayNumber = julianDay(dd, mm, yy);
  const k = floor((dayNumber - MONTH_ANCHOR) / SYNODIC_MONTH);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(yy);
  let b11 = a11;
  let year: number;
  if (a11 >= monthStart) {
    year = yy;
    a11 = lunarMonth11(yy - 1);
  } else {
    year = yy + 1;
    b11 = lunarMonth11(yy + 1);
  }
  const diff = floor((monthStart - a11) / MONTH_ESTIMATE_DAYS);
  let leap = false;
  let month = diff + 11;
  if (b11 - a11 > DAYS_IN_PLAIN_YEAR) {
    const leapDiff = leapMonthOffset(a11);
    if (diff >= leapDiff) {
      month = diff + 10;
      if (diff === leapDiff) leap = true;
    }
  }
  if (month > SECTORS_PER_TURN) month -= SECTORS_PER_TURN;
  if (month >= 11 && diff < 4) year -= 1;
  return { day: dayNumber - monthStart + 1, month, year, leap };
}

/** The new moon index of a lunar month's first day, or null when the year has no such month. */
function locateMonth(month: number, year: number, leap: boolean): number | null {
  if (!Number.isInteger(month) || month < 1 || month > SECTORS_PER_TURN) return null;
  if (!Number.isInteger(year) || year < LUNAR_FIRST_YEAR || year > LUNAR_LAST_YEAR) return null;
  const a11 = month < 11 ? lunarMonth11(year - 1) : lunarMonth11(year);
  const b11 = month < 11 ? lunarMonth11(year) : lunarMonth11(year + 1);
  const k = floor(0.5 + (a11 - MONTH_ANCHOR) / SYNODIC_MONTH);
  let off = month - 11;
  if (off < 0) off += SECTORS_PER_TURN;
  if (b11 - a11 > DAYS_IN_PLAIN_YEAR) {
    const leapOff = leapMonthOffset(a11);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += SECTORS_PER_TURN;
    if (leap && month !== leapMonth) return null;
    if (leap || off >= leapOff) off += 1;
  } else if (leap) {
    return null;
  }
  return k + off;
}

/** The number of days (29 or 30) of a lunar month, or null when the year has no such month. */
export function lunarDaysInMonth(month: number, year: number, leap: boolean): number | null {
  const index = locateMonth(month, year, leap);
  return index === null ? null : newMoonDay(index + 1) - newMoonDay(index);
}

/** The solar date (`YYYY-MM-DD`) of a lunar date, or null when that date does not exist (a missing leap month, day 30 of a 29-day month ...). */
export function lunarToSolar(date: LunarDate): string | null {
  const index = locateMonth(date.month, date.year, date.leap);
  if (index === null || !Number.isInteger(date.day) || date.day < 1) return null;
  const start = newMoonDay(index);
  if (date.day > newMoonDay(index + 1) - start) return null;
  return toKey(start + date.day - 1);
}
