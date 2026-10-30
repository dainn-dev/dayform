import { describe, expect, test } from "bun:test";
import { SPECIAL_ID_PREFIX } from "./reminders";
import {
  SPECIAL_HORIZON_DAYS, SPECIAL_MAX_REMINDERS, SPECIAL_NOTIFICATION_TITLE, hasSpecialReminders, planSpecialReminders,
  type PlanSpecialOptions,
} from "./special-reminders";
import type { SpecialDay } from "./special-days";

const NOW = new Date(2026, 9, 30, 12, 0);
const day = (id: string, patch: Partial<SpecialDay> = {}): SpecialDay => ({
  id, title: "Linh", kind: "birthday", calendar: "solar", month: 11, day: 5, startYear: 1996, remind: "same-day", ...patch,
});
const plan = (items: SpecialDay[], patch: Partial<PlanSpecialOptions> = {}) =>
  planSpecialReminders({ items, now: NOW, language: "en", hideTitles: false, ...patch });

describe("planSpecialReminders", () => {
  test("a same-day reminder is at 08:00 on the day and names it", () => {
    const [only] = plan([day("s_aaaaaaaa")]);
    expect(only.fireAt).toEqual(new Date(2026, 10, 5, 8, 0));
    expect(only.title).toBe("Linh (turns 30)");
    expect(only.body).toBe("Today");
    expect(only.kind).toBe("special");
    expect(only.taskId).toBe("");
    expect(only.id.startsWith(`${SPECIAL_ID_PREFIX}s_aaaaaaaa:2026-11-05:`)).toBe(true);
  });

  test("a day-before reminder is at 08:00 the day before and says tomorrow", () => {
    const [only] = plan([day("s_a", { remind: "day-before" })]);
    expect(only.fireAt).toEqual(new Date(2026, 10, 4, 8, 0));
    expect(only.body).toBe("Tomorrow");
  });

  test("a day without a reminder plans nothing", () => {
    expect(plan([day("s_a", { remind: "none" })])).toEqual([]);
    expect(plan([])).toEqual([]);
    expect(hasSpecialReminders([day("s_a", { remind: "none" })])).toBe(false);
    expect(hasSpecialReminders([day("s_a", { remind: "none" }), day("s_b")])).toBe(true);
  });

  test("a reminder whose time has passed is skipped, the next year's is not planned past the horizon", () => {
    expect(plan([day("s_a", { month: 10, day: 30 })])).toEqual([]);
    expect(plan([day("s_a", { month: 10, day: 29 })])).toEqual([]);
  });

  test("a day-before reminder that is already in the past is skipped", () => {
    expect(plan([day("s_a", { month: 10, day: 31, remind: "day-before" })])).toEqual([]);
  });

  test("a day beyond the horizon is not planned yet", () => {
    expect(plan([day("s_a", { month: 3, day: 15 })])).toEqual([]);
    const inside = new Date(2026, 9, 30 + SPECIAL_HORIZON_DAYS - 1);
    expect(plan([day("s_a", { month: inside.getMonth() + 1, day: inside.getDate() })])).toHaveLength(1);
  });

  test("a lunar day is planned on its solar date", () => {
    const giỗ = day("s_l", { title: "Giỗ ông", kind: "memorial", calendar: "lunar", month: 10, day: 15, startYear: 2010 });
    const [only] = plan([giỗ]);
    expect(only.fireAt.getFullYear()).toBe(2026);
    expect(only.title).toBe("Giỗ ông (16 years)");
  });

  test("hidden titles give one neutral line that says nothing about the day", () => {
    const [same] = plan([day("s_a")], { hideTitles: true });
    expect(same.title).toBe(SPECIAL_NOTIFICATION_TITLE);
    expect(same.body).toBe("Today is a special day");
    const [before] = plan([day("s_a", { remind: "day-before" })], { hideTitles: true });
    expect(before.body).toBe("A special day is coming up");
    expect(JSON.stringify([same, before])).not.toContain("Linh");
  });

  test("the words follow the language, the user's own title stays as typed", () => {
    const [vi] = plan([day("s_a")], { language: "vi" });
    expect(vi.title).toBe("Linh (30 tuổi)");
    expect(vi.body).toBe("Hôm nay");
    const [neutral] = plan([day("s_a")], { language: "vi", hideTitles: true });
    expect(neutral.body).toBe("Hôm nay là một ngày đặc biệt");
  });

  test("reminders come in time order and are capped", () => {
    const many = Array.from({ length: 12 }, (_, i) => day(`s_${String(i).padStart(8, "0")}`, { month: 11, day: 1 + i, title: `N${i}` }));
    const planned = plan(many.reverse());
    expect(planned).toHaveLength(SPECIAL_MAX_REMINDERS);
    expect(planned.map(item => item.title.startsWith("N"))).toEqual(Array(SPECIAL_MAX_REMINDERS).fill(true));
    const times = planned.map(item => item.fireAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test("quiet hours push a reminder to the end of the window, or drop it when that is another day", () => {
    const [pushed] = plan([day("s_a")], { quiet: { from: "07:00", to: "09:00" } });
    expect(pushed.fireAt).toEqual(new Date(2026, 10, 5, 9, 0));
    expect(plan([day("s_a")], { quiet: { from: "07:00", to: "07:00" } })).toHaveLength(1);
    expect(plan([day("s_a")], { quiet: { from: "08:00", to: "03:00" } })).toEqual([]);
  });

  test("the id changes when the text changes, so a stale notification is replaced", () => {
    const [first] = plan([day("s_a", { title: "Linh" })]);
    const [second] = plan([day("s_a", { title: "Lan" })]);
    expect(first.id).not.toBe(second.id);
  });

  test("an invalid clock plans nothing", () => {
    expect(planSpecialReminders({ items: [day("s_a")], now: new Date(Number.NaN), language: "en", hideTitles: false })).toEqual([]);
  });
});
