import { describe, expect, test } from "bun:test";
import { CYCLE_MAX_REMINDERS, CYCLES_AHEAD, planCycleReminders, type PlanCycleOptions } from "./cycle-reminders";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle";
import { predict } from "./cycle-predict";
import { CYCLE_ID_PREFIX } from "./reminders";

/** Four regular 28-day cycles: 3 cycles on record, so safe days (and the fertile window) are available. */
const REGULAR = ["2026-07-08", "2026-08-05", "2026-09-02", "2026-09-30"];
const stateOf = (patch: Partial<CycleState> = {}, reminders: Partial<CycleState["reminders"]> = {}): CycleState => ({
  ...DEFAULT_CYCLE_STATE,
  enabled: true,
  acknowledged: true,
  periods: REGULAR.map(start => ({ start })),
  ...patch,
  reminders: { ...DEFAULT_CYCLE_STATE.reminders, ...reminders },
});
const NOW = new Date(2026, 9, 5, 8, 0);
const TODAY = "2026-10-05";
const plan = (state: CycleState, extra: Partial<PlanCycleOptions> = {}) =>
  planCycleReminders({ state, now: NOW, today: TODAY, language: "en", ...extra });
const withFertile = stateOf({}, { notifyFertile: true });
const at = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute);
const kindOf = (id: string) => id.split(":")[2];

describe("planCycleReminders plan", () => {
  test("plans before, late and (with the option) fertile for two cycles, in time order", () => {
    // next start 10-28 and 11-25; the fertile window starts 10-09 and 11-06 (ovulation 14 days before the start, minus 5).
    expect(predict(withFertile, TODAY).safeDays.reason).toBe("ok");
    const planned = plan(withFertile);
    expect(CYCLES_AHEAD).toBe(2);
    expect(planned.map(item => [kindOf(item.id), item.fireAt])).toEqual([
      ["fertile", at(10, 9)], ["before", at(10, 27)], ["late", at(10, 29)], ["fertile", at(11, 6)], ["before", at(11, 24)],
    ]);
    expect(planned.length).toBeLessThanOrEqual(CYCLE_MAX_REMINDERS);
  });

  test("by default there is no fertile reminder", () => {
    expect(plan(stateOf()).map(item => kindOf(item.id))).toEqual(["before", "late", "before"]);
  });

  test("ids are dayform:cycle:<kind>:<fire date>:<hash>, kind is cycle and no task id or data is carried", () => {
    for (const item of plan(withFertile)) {
      expect(item.id).toMatch(/^dayform:cycle:(before|late|fertile):\d{4}-\d{2}-\d{2}:[0-9a-f]+$/);
      expect(item.id.startsWith(CYCLE_ID_PREFIX)).toBe(true);
      expect(item.kind).toBe("cycle");
      expect(item.taskId).toBe("");
      expect(Object.keys(item).sort()).toEqual(["body", "fireAt", "id", "kind", "taskId", "title"]);
    }
    expect(plan(stateOf())[0]!.id).toMatch(/^dayform:cycle:before:2026-10-27:/);
  });

  test("ids are unique and stable between runs", () => {
    const first = plan(withFertile).map(item => item.id);
    expect(new Set(first).size).toBe(first.length);
    expect(plan(withFertile).map(item => item.id)).toEqual(first);
  });

  test("daysBefore 0 fires on the predicted day and 3 three days before, at the chosen time", () => {
    expect(plan(stateOf({}, { daysBefore: 0, time: "07:30" }))[0]!.fireAt).toEqual(at(10, 28, 7, 30));
    expect(plan(stateOf({}, { daysBefore: 3, time: "20:15" }))[0]!.fireAt).toEqual(at(10, 25, 20, 15));
  });

  test("the late reminder is the day after the predicted start, first cycle only, and can be switched off", () => {
    const late = plan(stateOf()).filter(item => item.id.includes(":late:"));
    expect(late.map(item => item.fireAt)).toEqual([at(10, 29)]);
    expect(plan(stateOf({}, { notifyLate: false })).some(item => item.id.includes(":late:"))).toBe(false);
  });

  test("past reminders are skipped: after the first fire time only later ones remain", () => {
    const afterBefore = planCycleReminders({ state: stateOf(), now: new Date(2026, 9, 27, 9, 30), today: "2026-10-27", language: "en" });
    expect(afterBefore.map(item => kindOf(item.id))).toEqual(["late", "before"]);
    const exactlyNow = planCycleReminders({ state: stateOf(), now: at(10, 27), today: "2026-10-27", language: "en" });
    expect(exactlyNow.some(item => item.fireAt.getTime() === at(10, 27).getTime())).toBe(false);
  });

  test("a late period gets one late reminder (if still ahead) and no second cycle", () => {
    const lateToday = planCycleReminders({ state: stateOf(), now: new Date(2026, 9, 29, 8, 0), today: "2026-10-29", language: "en" });
    expect(lateToday.map(item => [kindOf(item.id), item.fireAt])).toEqual([["late", at(10, 29)]]);
    const veryLate = planCycleReminders({ state: stateOf(), now: new Date(2026, 9, 30, 8, 0), today: "2026-10-30", language: "en" });
    expect(veryLate).toEqual([]);
  });

  test("a fertile reminder is withheld while the period is late", () => {
    const planned = planCycleReminders({ state: withFertile, now: new Date(2026, 9, 29, 8, 0), today: "2026-10-29", language: "en" });
    expect(planned.some(item => item.id.includes(":fertile:"))).toBe(false);
  });
});

describe("planCycleReminders nothing to plan", () => {
  test("disabled, paused, empty or stale trackers plan nothing", () => {
    expect(plan(stateOf({ enabled: false }))).toEqual([]);
    expect(plan(stateOf({ paused: true }))).toEqual([]);
    expect(plan(stateOf({ periods: [] }))).toEqual([]);
    expect(planCycleReminders({ state: stateOf(), now: new Date(2027, 2, 1, 8, 0), today: "2027-03-01", language: "en" })).toEqual([]);
  });

  test("a future-only period (no usable start) plans nothing", () => {
    expect(plan(stateOf({ periods: [{ start: "2026-12-01" }] }))).toEqual([]);
  });

  test("bad inputs plan nothing and never throw", () => {
    expect(plan(stateOf(), { today: "2026-02-30" })).toEqual([]);
    expect(plan(stateOf(), { today: "nope" })).toEqual([]);
    expect(plan(stateOf(), { now: new Date(Number.NaN) })).toEqual([]);
    expect(plan(stateOf({}, { time: "25:99" }))).toEqual([]);
  });

  test("no fertile reminder with fewer than 3 cycles, with irregular cycles, or without the notice accepted", () => {
    const two = stateOf({ periods: [{ start: "2026-08-05" }, { start: "2026-09-02" }, { start: "2026-09-30" }] }, { notifyFertile: true });
    expect(predict(two, TODAY).safeDays.reason).toBe("not-enough-cycles");
    expect(plan(two).some(item => item.id.includes(":fertile:"))).toBe(false);
    const irregular = stateOf({
      periods: ["2026-05-01", "2026-05-23", "2026-07-01", "2026-07-25", "2026-09-30"].map(start => ({ start })),
    }, { notifyFertile: true });
    expect(predict(irregular, TODAY).safeDays.reason).toBe("irregular");
    expect(plan(irregular).some(item => item.id.includes(":fertile:"))).toBe(false);
    expect(plan({ ...withFertile, acknowledged: false }).some(item => item.id.includes(":fertile:"))).toBe(false);
  });

  test("does not mutate the state", () => {
    const state = withFertile;
    const before = JSON.stringify(state);
    plan(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("planCycleReminders text", () => {
  test("neutral text is the same for every kind, in both languages", () => {
    const english = plan(withFertile);
    expect(new Set(english.map(item => `${item.title}|${item.body}`))).toEqual(new Set(["Dayform|Dayform: personal reminder"]));
    const vietnamese = plan(withFertile, { language: "vi" });
    expect(new Set(vietnamese.map(item => `${item.title}|${item.body}`))).toEqual(new Set(["Dayform|Dayform: nhắc nhở cá nhân"]));
  });

  test("plain wording when neutralText is off", () => {
    const body = (planned: ReturnType<typeof plan>, kind: string) => planned.find(item => item.id.includes(`:${kind}:`))!.body;
    const one = plan(stateOf({}, { neutralText: false, notifyFertile: true }));
    expect(body(one, "before")).toBe("Period expected tomorrow");
    expect(body(one, "late")).toBe("Period may be late");
    expect(body(one, "fertile")).toBe("Fertile window may start today (estimate)");
    expect(body(plan(stateOf({}, { neutralText: false, daysBefore: 0 })), "before")).toBe("Period expected today");
    expect(body(plan(stateOf({}, { neutralText: false, daysBefore: 3 })), "before")).toBe("Period expected in 3 days");
    expect(plan(stateOf({}, { neutralText: false, daysBefore: 2 }), { language: "vi" })[0]!.body).toBe("Kỳ kinh dự kiến bắt đầu sau 2 ngày");
    expect(one.every(item => item.title === "Dayform")).toBe(true);
  });

  test("a translate override receives the English key and values", () => {
    const seen: string[] = [];
    const planned = plan(stateOf({}, { neutralText: false, daysBefore: 2 }), {
      translate: (key, values) => { seen.push(`${key}|${JSON.stringify(values ?? {})}`); return `T:${key}`; },
    });
    expect(planned[0]!.body).toBe("T:Period expected in {n} days");
    expect(seen).toContain('Period expected in {n} days|{"n":"2"}');
  });
});

describe("planCycleReminders content hash", () => {
  const firstId = (state: CycleState, extra: Partial<PlanCycleOptions> = {}) => plan(state, extra)[0]!.id;
  test("a changed setting reschedules: time, days before, text style and language change the id", () => {
    const base = firstId(stateOf());
    expect(firstId(stateOf({}, { time: "09:05" }))).not.toBe(base);
    expect(firstId(stateOf({}, { daysBefore: 2 }))).not.toBe(base);
    expect(firstId(stateOf({}, { neutralText: false }))).not.toBe(base);
    expect(firstId(stateOf(), { language: "vi" })).not.toBe(base);
  });
  test("a logged period moves the predicted dates, so the ids change too", () => {
    const logged = stateOf({ periods: [...REGULAR, "2026-10-04"].map(start => ({ start })) });
    expect(plan(logged).map(item => item.id)).not.toEqual(plan(stateOf()).map(item => item.id));
  });
  test("settings that change nothing planned keep the id", () => {
    expect(firstId(stateOf({}, { notifyLate: false }))).toBe(firstId(stateOf()));
    expect(firstId(stateOf({ showOnTimeline: true }))).toBe(firstId(stateOf()));
  });
});

describe("planCycleReminders quiet hours", () => {
  const quiet = { from: "22:00", to: "07:00" };
  test("outside quiet hours nothing moves", () => {
    expect(plan(stateOf(), { quiet })[0]!.fireAt).toEqual(at(10, 27));
  });
  test("inside the window it waits for the end of the window on the same day", () => {
    expect(plan(stateOf({}, { time: "06:30" }), { quiet })[0]!.fireAt).toEqual(at(10, 27, 7, 0));
    expect(plan(stateOf({}, { time: "09:00" }), { quiet: { from: "08:00", to: "10:00" } })[0]!.fireAt).toEqual(at(10, 27, 10, 0));
  });
  test("the id carries the date after postponing", () => {
    expect(plan(stateOf({}, { time: "06:30" }), { quiet })[0]!.id).toMatch(/:before:2026-10-27:/);
  });
  test("it is dropped when postponing would push it to the next day", () => {
    expect(plan(stateOf({}, { time: "23:00" }), { quiet })).toEqual([]);
  });
  test("no or empty windows change nothing", () => {
    expect(plan(stateOf(), { quiet: null })[0]!.fireAt).toEqual(at(10, 27));
    expect(plan(stateOf(), { quiet: { from: "08:00", to: "08:00" } })[0]!.fireAt).toEqual(at(10, 27));
  });
  test("a postponed reminder is never earlier than now", () => {
    const now = new Date(2026, 9, 27, 6, 0);
    const planned = planCycleReminders({ state: stateOf({}, { time: "06:30" }), now, today: "2026-10-27", language: "en", quiet });
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every(item => item.fireAt.getTime() > now.getTime())).toBe(true);
  });
});

describe("planCycleReminders calendar edges", () => {
  const near = (lastStart: string, today: string, reminders: Partial<CycleState["reminders"]> = {}) =>
    planCycleReminders({
      state: stateOf({ periods: [{ start: lastStart }] }, reminders),
      now: new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8)), 8, 0),
      today, language: "en",
    });
  test("month ends: a start on 03-01 reminds on 02-28 (or 02-29 in a leap year)", () => {
    // default length 28: 2026-02-01 + 28 = 2026-03-01 ; 2028-02-01 + 28 = 2028-02-29
    expect(near("2026-02-01", "2026-02-10")[0]!.fireAt).toEqual(new Date(2026, 1, 28, 9, 0));
    expect(near("2028-02-01", "2028-02-10", { daysBefore: 0 })[0]!.fireAt).toEqual(new Date(2028, 1, 29, 9, 0));
    expect(near("2026-12-10", "2026-12-20")[0]!.fireAt).toEqual(new Date(2027, 0, 6, 9, 0));
  });
  test("the second cycle crosses a year end", () => {
    const planned = near("2026-11-20", "2026-11-25", { daysBefore: 0 });
    expect(planned.filter(item => item.id.includes(":before:")).map(item => item.fireAt)).toEqual([
      new Date(2026, 11, 18, 9, 0), new Date(2027, 0, 15, 9, 0),
    ]);
  });
  test("the wall-clock time survives daylight saving changes", () => {
    for (const [lastStart, today] of [["2026-03-01", "2026-03-05"], ["2026-10-10", "2026-10-15"], ["2026-03-15", "2026-03-20"]] as const) {
      for (const item of near(lastStart, today, { time: "09:00" })) {
        expect(item.fireAt.getHours()).toBe(9);
        expect(item.fireAt.getMinutes()).toBe(0);
      }
      // 02:30 does not exist on a spring-forward day; JS moves it forward, every other day it is exact.
      for (const item of near(lastStart, today, { time: "02:30" })) expect([2, 3]).toContain(item.fireAt.getHours());
    }
  });
});
