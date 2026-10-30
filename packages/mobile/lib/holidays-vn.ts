import { solarToLunar, type LunarDate } from "./lunar";
import { addDays, fromKey } from "./planner";

/**
 * The Vietnamese holidays and occasions the app marks on the calendar. Only the occasions are marked: whether a day
 * is a day off (and any make-up day) changes every year by decree and cannot be worked out offline, so it is not
 * claimed here. Lunar festivals follow the lunar date (lib/lunar.ts); the rest are fixed solar dates or the n-th
 * weekday of a month.
 */
export const HOLIDAY_GROUPS = ["national", "traditional", "occasion"] as const;
/** national: the big public holidays; traditional: lunar festivals; occasion: other well-known days. */
export type HolidayGroup = (typeof HOLIDAY_GROUPS)[number];
export type HolidayLanguage = "en" | "vi";

export type Holiday = {
  id: string;
  group: HolidayGroup;
  name: { en: string; vi: string };
  /** The lunar date of a lunar festival, shown after its name. */
  lunar?: { day: number; month: number };
};

type Named = { id: string; group: HolidayGroup; en: string; vi: string };
type SolarRule = Named & { month: number; day: number };
/** `showDate: false` leaves the lunar date off the label when the name already says it (the days of Tết). */
type LunarRule = Named & { lunarMonth: number; lunarDay: number; showDate?: boolean };
type WeekdayRule = Named & { month: number; weekday: number; nth: number };

const SUNDAY = 0;

const SOLAR_RULES: readonly SolarRule[] = [
  { id: "new-year", group: "national", en: "New Year's Day", vi: "Tết Dương lịch", month: 1, day: 1 },
  { id: "reunification", group: "national", en: "Reunification Day", vi: "Ngày Giải phóng miền Nam", month: 4, day: 30 },
  { id: "labour-day", group: "national", en: "International Labour Day", vi: "Quốc tế Lao động", month: 5, day: 1 },
  { id: "national-day", group: "national", en: "National Day", vi: "Quốc khánh", month: 9, day: 2 },
  { id: "party-founding", group: "occasion", en: "Party Founding Anniversary", vi: "Ngày thành lập Đảng", month: 2, day: 3 },
  { id: "valentines", group: "occasion", en: "Valentine's Day", vi: "Valentine", month: 2, day: 14 },
  { id: "womens-day", group: "occasion", en: "International Women's Day", vi: "Quốc tế Phụ nữ", month: 3, day: 8 },
  { id: "ho-chi-minh", group: "occasion", en: "Ho Chi Minh's Birthday", vi: "Ngày sinh Chủ tịch Hồ Chí Minh", month: 5, day: 19 },
  { id: "childrens-day", group: "occasion", en: "Children's Day", vi: "Quốc tế Thiếu nhi", month: 6, day: 1 },
  { id: "war-invalids", group: "occasion", en: "War Invalids and Martyrs Day", vi: "Ngày Thương binh Liệt sĩ", month: 7, day: 27 },
  { id: "vn-womens-day", group: "occasion", en: "Vietnamese Women's Day", vi: "Ngày Phụ nữ Việt Nam", month: 10, day: 20 },
  { id: "teachers-day", group: "occasion", en: "Teachers' Day", vi: "Ngày Nhà giáo Việt Nam", month: 11, day: 20 },
  { id: "peoples-army", group: "occasion", en: "People's Army Day", vi: "Ngày Quân đội nhân dân", month: 12, day: 22 },
  { id: "christmas-eve", group: "occasion", en: "Christmas Eve", vi: "Đêm Giáng sinh", month: 12, day: 24 },
  { id: "christmas", group: "occasion", en: "Christmas", vi: "Giáng sinh", month: 12, day: 25 },
];

const LUNAR_RULES: readonly LunarRule[] = [
  { id: "tet-1", group: "national", en: "Lunar New Year (day 1)", vi: "Mùng 1 Tết Nguyên Đán", lunarMonth: 1, lunarDay: 1, showDate: false },
  { id: "tet-2", group: "national", en: "Lunar New Year (day 2)", vi: "Mùng 2 Tết Nguyên Đán", lunarMonth: 1, lunarDay: 2, showDate: false },
  { id: "tet-3", group: "national", en: "Lunar New Year (day 3)", vi: "Mùng 3 Tết Nguyên Đán", lunarMonth: 1, lunarDay: 3, showDate: false },
  { id: "hung-kings", group: "national", en: "Hung Kings' Commemoration", vi: "Giỗ Tổ Hùng Vương", lunarMonth: 3, lunarDay: 10 },
  { id: "lantern", group: "traditional", en: "Lantern Festival", vi: "Rằm tháng Giêng", lunarMonth: 1, lunarDay: 15 },
  { id: "cold-food", group: "traditional", en: "Cold Food Festival", vi: "Tết Hàn thực", lunarMonth: 3, lunarDay: 3 },
  { id: "buddhas-birthday", group: "traditional", en: "Buddha's Birthday", vi: "Phật Đản", lunarMonth: 4, lunarDay: 15 },
  { id: "double-fifth", group: "traditional", en: "Double Fifth Festival", vi: "Tết Đoan Ngọ", lunarMonth: 5, lunarDay: 5 },
  { id: "vu-lan", group: "traditional", en: "Vu Lan Festival", vi: "Lễ Vu Lan", lunarMonth: 7, lunarDay: 15 },
  { id: "mid-autumn", group: "traditional", en: "Mid-Autumn Festival", vi: "Tết Trung thu", lunarMonth: 8, lunarDay: 15 },
  { id: "kitchen-gods", group: "traditional", en: "Kitchen Gods Day", vi: "Ông Công Ông Táo", lunarMonth: 12, lunarDay: 23 },
];

const WEEKDAY_RULES: readonly WeekdayRule[] = [
  { id: "mothers-day", group: "occasion", en: "Mother's Day", vi: "Ngày của Mẹ", month: 5, weekday: SUNDAY, nth: 2 },
  { id: "fathers-day", group: "occasion", en: "Father's Day", vi: "Ngày của Cha", month: 6, weekday: SUNDAY, nth: 3 },
];

/** The last day of the lunar year, the day before Tết (the 29th or the 30th of month 12). */
const TAT_NIEN: Named = { id: "tat-nien", group: "traditional", en: "Lunar New Year's Eve", vi: "Tất niên" };

const DAYS_PER_WEEK = 7;
const MAX_CACHED_DAYS = 2000;

function indexBy<T>(rules: readonly T[], keyOf: (rule: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const rule of rules) index.set(keyOf(rule), [...(index.get(keyOf(rule)) ?? []), rule]);
  return index;
}

const solarByDay = indexBy(SOLAR_RULES, rule => `${rule.month}-${rule.day}`);
const lunarByDay = indexBy(LUNAR_RULES, rule => `${rule.lunarMonth}-${rule.lunarDay}`);

const lunarCache = new Map<string, LunarDate>();

function lunarOf(key: string): LunarDate {
  const cached = lunarCache.get(key);
  if (cached !== undefined) return cached;
  if (lunarCache.size >= MAX_CACHED_DAYS) lunarCache.clear();
  const found = solarToLunar(key);
  lunarCache.set(key, found);
  return found;
}

function holiday(rule: Named, lunar?: { day: number; month: number }): Holiday {
  return { id: rule.id, group: rule.group, name: { en: rule.en, vi: rule.vi }, ...(lunar === undefined ? {} : { lunar }) };
}

function holidaysFor(key: string, groups: ReadonlySet<HolidayGroup>): Holiday[] {
  const [, month, day] = key.split("-").map(Number);
  const found: Holiday[] = [];
  for (const rule of solarByDay.get(`${month}-${day}`) ?? []) if (groups.has(rule.group)) found.push(holiday(rule));
  const date = fromKey(key);
  const nth = Math.ceil(day / DAYS_PER_WEEK);
  for (const rule of WEEKDAY_RULES) {
    if (groups.has(rule.group) && rule.month === month && rule.weekday === date.getDay() && rule.nth === nth) found.push(holiday(rule));
  }
  const lunar = lunarOf(key);
  if (!lunar.leap) {
    for (const rule of lunarByDay.get(`${lunar.month}-${lunar.day}`) ?? []) {
      if (groups.has(rule.group)) found.push(holiday(rule, rule.showDate === false ? undefined : { day: rule.lunarDay, month: rule.lunarMonth }));
    }
  }
  if (groups.has(TAT_NIEN.group)) {
    const tomorrow = lunarOf(addDays(key, 1));
    if (tomorrow.day === 1 && tomorrow.month === 1 && !tomorrow.leap) found.push(holiday(TAT_NIEN));
  }
  return found.sort((a, b) => HOLIDAY_GROUPS.indexOf(a.group) - HOLIDAY_GROUPS.indexOf(b.group) || a.id.localeCompare(b.id));
}

const ALL_GROUPS: ReadonlySet<HolidayGroup> = new Set(HOLIDAY_GROUPS);

/** The holidays of one day (`YYYY-MM-DD`); `groups` limits them (all groups when omitted). */
export function holidaysOn(key: string, groups: ReadonlySet<HolidayGroup> = ALL_GROUPS): Holiday[] {
  return holidaysFor(key, groups);
}

/** The holidays of several days at once: only days that have one are present. */
export function holidaysByDay(keys: readonly string[], groups: ReadonlySet<HolidayGroup> | undefined): Record<string, Holiday[]> {
  const result: Record<string, Holiday[]> = {};
  for (const key of keys) {
    const found = holidaysFor(key, groups ?? ALL_GROUPS);
    if (found.length > 0) result[key] = found;
  }
  return result;
}

/** The holiday's name in `language`, with its lunar date after a lunar festival: "Tết Trung thu (15/8 ÂL)". */
export function holidayLabel(item: Holiday, language: HolidayLanguage): string {
  const name = item.name[language];
  if (item.lunar === undefined) return name;
  return `${name} (${item.lunar.day}/${item.lunar.month} ${language === "vi" ? "ÂL" : "lunar"})`;
}
