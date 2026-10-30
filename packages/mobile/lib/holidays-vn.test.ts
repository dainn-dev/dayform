import { describe, expect, test } from "bun:test";
import { HOLIDAY_GROUPS, holidayLabel, holidaysByDay, holidaysOn, type HolidayGroup } from "./holidays-vn";

const ids = (key: string, groups?: ReadonlySet<HolidayGroup>) => holidaysOn(key, groups).map(holiday => holiday.id);

describe("holidaysOn", () => {
  test("a plain day has none", () => {
    expect(ids("2026-03-12")).toEqual([]);
  });

  test("fixed solar days", () => {
    expect(ids("2026-01-01")).toEqual(["new-year"]);
    expect(ids("2026-04-30")).toEqual(["reunification"]);
    expect(ids("2026-05-01")).toEqual(["labour-day"]);
    expect(ids("2026-09-02")).toEqual(["national-day"]);
    expect(ids("2026-10-20")).toEqual(["vn-womens-day"]);
    expect(ids("2026-11-20")).toEqual(["teachers-day"]);
    expect(ids("2026-12-25")).toEqual(["christmas"]);
  });

  test("lunar new year: the eve and the first three days", () => {
    expect(ids("2026-02-16")).toEqual(["tat-nien"]);
    expect(ids("2026-02-17")).toEqual(["tet-1"]);
    expect(ids("2026-02-18")).toEqual(["tet-2"]);
    expect(ids("2026-02-19")).toEqual(["tet-3"]);
    expect(ids("2026-02-20")).toEqual([]);
  });

  test("lunar festivals follow the lunar date, not the solar one", () => {
    expect(ids("2026-04-26")).toEqual(["hung-kings"]);
    expect(ids("2025-04-07")).toEqual(["hung-kings"]);
    expect(ids("2026-09-25")).toEqual(["mid-autumn"]);
    expect(ids("2025-10-06")).toEqual(["mid-autumn"]);
    expect(ids("2025-09-06")).toEqual(["vu-lan"]);
  });

  test("the second Sunday of May is Mother's Day and the third of June is Father's Day", () => {
    expect(ids("2026-05-10")).toEqual(["mothers-day"]);
    expect(ids("2025-05-11")).toEqual(["mothers-day"]);
    expect(ids("2026-05-03")).toEqual([]);
    expect(ids("2026-06-21")).toEqual(["fathers-day"]);
    expect(ids("2026-06-14")).toEqual([]);
  });

  test("a day that is both a national holiday and an occasion lists the national one first", () => {
    // Find, from the rules themselves, a year where Mother's Day or Father's Day coincides with nothing else; the
    // order contract is checked on any day that has two: here Tết day 1 never coincides, so scan a few years.
    for (let year = 2020; year <= 2040; year += 1) {
      for (let day = 0; day < 366; day += 1) {
        const key = new Date(year, 0, 1 + day, 12);
        const text = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, "0")}-${String(key.getDate()).padStart(2, "0")}`;
        const found = holidaysOn(text);
        if (found.length < 2) continue;
        const order = found.map(holiday => HOLIDAY_GROUPS.indexOf(holiday.group));
        expect(order).toEqual([...order].sort((a, b) => a - b));
      }
    }
  });

  test("only the groups that are asked for are returned", () => {
    expect(ids("2026-09-25", new Set<HolidayGroup>(["national"]))).toEqual([]);
    expect(ids("2026-09-25", new Set<HolidayGroup>(["traditional"]))).toEqual(["mid-autumn"]);
    expect(ids("2026-02-14", new Set<HolidayGroup>(["national", "traditional"]))).toEqual([]);
    expect(ids("2026-02-14", new Set<HolidayGroup>(["occasion"]))).toEqual(["valentines"]);
  });

  test("an empty group set returns nothing", () => {
    expect(ids("2026-09-02", new Set<HolidayGroup>())).toEqual([]);
  });
});

describe("holidaysByDay", () => {
  test("lists only the days that have a holiday", () => {
    const week = ["2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21"];
    const result = holidaysByDay(week, undefined);
    expect(Object.keys(result)).toEqual(["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19"]);
  });

  test("returns the same answer as one day at a time", () => {
    const keys = ["2026-04-26", "2026-04-27", "2026-04-30", "2026-05-01"];
    const result = holidaysByDay(keys, undefined);
    for (const key of keys) expect(result[key]?.map(holiday => holiday.id) ?? []).toEqual(ids(key));
  });
});

describe("holidayLabel", () => {
  test("names a lunar festival with its lunar date, in both languages", () => {
    const [midAutumn] = holidaysOn("2026-09-25");
    expect(holidayLabel(midAutumn, "vi")).toBe("Tết Trung thu (15/8 ÂL)");
    expect(holidayLabel(midAutumn, "en")).toBe("Mid-Autumn Festival (15/8 lunar)");
  });

  test("a solar holiday has no date suffix", () => {
    const [nationalDay] = holidaysOn("2026-09-02");
    expect(holidayLabel(nationalDay, "vi")).toBe("Quốc khánh");
    expect(holidayLabel(nationalDay, "en")).toBe("National Day");
  });

  test("the eve of Tết has no lunar date suffix (it is the 29th or the 30th)", () => {
    const [eve] = holidaysOn("2026-02-16");
    expect(holidayLabel(eve, "vi")).toBe("Tất niên");
  });
});

describe("HOLIDAY_GROUPS", () => {
  test("lists the three groups once each, most important first", () => {
    expect(HOLIDAY_GROUPS).toEqual(["national", "traditional", "occasion"]);
  });
});
