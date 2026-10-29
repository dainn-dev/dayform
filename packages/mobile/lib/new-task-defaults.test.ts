import { describe, expect, test } from "bun:test";
import { newTaskDefaults } from "./new-task-defaults";
import { DEFAULT_SETTINGS, mergeSettings, type DeepPartial, type Settings } from "./settings";

const TODAY = "2026-10-29";
const OTHER_DAY = "2026-10-30";
const at = (hour: number, minute: number) => new Date(2026, 9, 29, hour, minute);

function withSettings(patch: DeepPartial<Settings>): Settings {
  return mergeSettings(DEFAULT_SETTINGS, patch);
}

const noSlot = (selectedDate = TODAY, now = at(14, 20)) => ({ now, slotTime: null, selectedDate });

describe("newTaskDefaults with the stock settings", () => {
  test("reproduces the historic new-task form", () => {
    expect(newTaskDefaults(DEFAULT_SETTINGS, noSlot())).toEqual({
      duration: 30, category: "Focus", remind: null, scheduled: false, date: TODAY, time: "09:00",
    });
  });

  test("keeps the selected date even when it is not today", () => {
    expect(newTaskDefaults(DEFAULT_SETTINGS, noSlot(OTHER_DAY)).date).toBe(OTHER_DAY);
  });
});

describe("duration, category and reminder", () => {
  test("take the configured values", () => {
    const settings = withSettings({ defaults: { duration: 90, category: "Work", remind: 15, scheduleNew: true } });
    const result = newTaskDefaults(settings, noSlot());
    expect(result).toMatchObject({ duration: 90, category: "Work", remind: 15, scheduled: true });
  });

  test("an unknown category falls back to Focus", () => {
    const settings = withSettings({ defaults: { category: "Gardening" } });
    expect(newTaskDefaults(settings, noSlot()).category).toBe("Focus");
  });

  test("a custom category id is accepted when it is visible, and falls back when it is not", () => {
    const settings = withSettings({ defaults: { category: "c_gym00000" } });
    expect(newTaskDefaults(settings, { ...noSlot(), knownCategories: ["Focus", "c_gym00000"] }).category).toBe("c_gym00000");
    expect(newTaskDefaults(settings, { ...noSlot(), knownCategories: ["Focus", "Work"] }).category).toBe("Focus");
  });

  test("when Focus is hidden the fallback is the first visible category", () => {
    const settings = withSettings({ defaults: { category: "Gardening" } });
    expect(newTaskDefaults(settings, { ...noSlot(), knownCategories: ["Work", "Personal"] }).category).toBe("Work");
    expect(newTaskDefaults(settings, { ...noSlot(), knownCategories: [] }).category).toBe("Focus");
  });

  test("a category is accepted when it is in the supplied list", () => {
    const settings = withSettings({ defaults: { category: "Wellness" } });
    expect(newTaskDefaults(settings, { ...noSlot(), knownCategories: ["Focus", "Wellness"] }).category).toBe("Wellness");
    expect(newTaskDefaults(settings, { ...noSlot(), knownCategories: ["Focus", "Work"] }).category).toBe("Focus");
  });

  test("the reminder is dropped when the task ends up unscheduled", () => {
    const settings = withSettings({ defaults: { remind: 30, scheduleNew: false } });
    expect(newTaskDefaults(settings, noSlot()).remind).toBeNull();
  });

  test("the reminder stays when a tapped slot schedules the task", () => {
    const settings = withSettings({ defaults: { remind: 30, scheduleNew: false } });
    const result = newTaskDefaults(settings, { now: at(8, 0), slotTime: "10:00", selectedDate: TODAY });
    expect(result).toMatchObject({ scheduled: true, remind: 30 });
  });

  test("a zero-minute reminder (at start time) is kept, not treated as none", () => {
    const settings = withSettings({ defaults: { remind: 0, scheduleNew: true } });
    expect(newTaskDefaults(settings, noSlot()).remind).toBe(0);
  });
});

describe("a tapped time slot", () => {
  test("always wins over the start mode and scheduling default", () => {
    const settings = withSettings({ defaults: { scheduleNew: false, startMode: "next-hour", startFixed: "08:00" } });
    const result = newTaskDefaults(settings, { now: at(14, 20), slotTime: "16:30", selectedDate: TODAY });
    expect(result).toMatchObject({ scheduled: true, time: "16:30" });
  });

  test("wins on another day too", () => {
    const result = newTaskDefaults(DEFAULT_SETTINGS, { now: at(14, 20), slotTime: "07:15", selectedDate: OTHER_DAY });
    expect(result).toMatchObject({ scheduled: true, time: "07:15", date: OTHER_DAY });
  });
});

describe("start time", () => {
  const nextHour = withSettings({ defaults: { startMode: "next-hour", startFixed: "08:00", scheduleNew: true } });

  test("fixed mode uses the fixed time", () => {
    const settings = withSettings({ defaults: { startMode: "fixed", startFixed: "13:45" } });
    expect(newTaskDefaults(settings, noSlot()).time).toBe("13:45");
  });

  test("next-hour rounds up to the next full hour", () => {
    expect(newTaskDefaults(nextHour, noSlot(TODAY, at(14, 20))).time).toBe("15:00");
  });

  test("next-hour on an exact hour moves to the following hour", () => {
    expect(newTaskDefaults(nextHour, noSlot(TODAY, at(14, 0))).time).toBe("15:00");
  });

  test("next-hour pads single digit hours", () => {
    const settings = withSettings({ ...nextHour, calendar: { dayStart: 0 } });
    expect(newTaskDefaults(settings, noSlot(TODAY, at(3, 5))).time).toBe("04:00");
  });

  test("next-hour is clamped up to the day start", () => {
    expect(newTaskDefaults(nextHour, noSlot(TODAY, at(3, 10))).time).toBe("06:00");
  });

  test("next-hour is clamped to the last hour that still fits before the day end", () => {
    const settings = withSettings({ ...nextHour, calendar: { dayStart: 360, dayEnd: 1320 } });
    expect(newTaskDefaults(settings, noSlot(TODAY, at(21, 40))).time).toBe("21:00");
  });

  test("next-hour near midnight is clamped to the day end minus one hour", () => {
    expect(newTaskDefaults(nextHour, noSlot(TODAY, at(23, 30))).time).toBe("21:00");
    const late = withSettings({ ...nextHour, calendar: { dayEnd: 1440 } });
    expect(newTaskDefaults(late, noSlot(TODAY, at(23, 30))).time).toBe("23:00");
  });

  test("next-hour follows a custom day range", () => {
    const settings = withSettings({ ...nextHour, calendar: { dayStart: 480, dayEnd: 1080 } });
    expect(newTaskDefaults(settings, noSlot(TODAY, at(9, 59))).time).toBe("10:00");
    expect(newTaskDefaults(settings, noSlot(TODAY, at(17, 30))).time).toBe("17:00");
  });

  test("next-hour on a day that is not today uses the fixed time", () => {
    expect(newTaskDefaults(nextHour, noSlot(OTHER_DAY, at(14, 20))).time).toBe("08:00");
  });
});

describe("scheduling default", () => {
  test("scheduleNew true schedules without a slot", () => {
    const settings = withSettings({ defaults: { scheduleNew: true } });
    expect(newTaskDefaults(settings, noSlot()).scheduled).toBe(true);
  });

  test("does not mutate the settings", () => {
    const before = JSON.stringify(DEFAULT_SETTINGS);
    newTaskDefaults(DEFAULT_SETTINGS, noSlot());
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
  });
});
