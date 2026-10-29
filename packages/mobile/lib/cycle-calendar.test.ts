import { describe, test, expect } from "bun:test";
import { DEFAULT_CYCLE_STATE, type CycleState, type Period } from "./cycle";
import { MAX_PROJECTED_CYCLES, monthGrid, weekMarks, type CalendarDay, type CalendarKind } from "./cycle-calendar";
import { addDays } from "./planner";

const closed = (start: string): Period => ({ start, end: addDays(start, 4) });
// Four 28-day cycles' starts: 3 cycles, so Standard Days applies. Last start Monday 2026-06-01, next 2026-06-29.
const PERIODS = [closed("2026-03-09"), closed("2026-04-06"), closed("2026-05-04"), closed("2026-06-01")];
const STATE: CycleState = { ...DEFAULT_CYCLE_STATE, enabled: true, periods: PERIODS };
const TODAY = "2026-06-10";

const flat = (grid: CalendarDay[][]) => grid.flat();
const kindOn = (grid: CalendarDay[][], date: string): CalendarKind => {
  const found = flat(grid).find(day => day.date === date);
  if (!found) throw new Error(`${date} not in grid`);
  return found.kind;
};
const datesOfKind = (grid: CalendarDay[][], kind: CalendarKind) => flat(grid).filter(day => day.kind === kind).map(day => day.date);

describe("monthGrid layout", () => {
  test("covers whole weeks, Monday first, with days from the neighbouring months", () => {
    const grid = monthGrid(2026, 6, "mon", STATE, TODAY);
    expect(grid).toHaveLength(5);
    expect(grid.every(week => week.length === 7)).toBe(true);
    expect(grid[0][0].date).toBe("2026-06-01");
    expect(grid[4][6].date).toBe("2026-07-05");
    expect(flat(grid).filter(day => day.inMonth)).toHaveLength(30);
    expect(grid[4][1]).toMatchObject({ date: "2026-06-30", inMonth: true });
    expect(grid[4][2]).toMatchObject({ date: "2026-07-01", inMonth: false });
  });

  test("honours Sunday and Saturday week starts", () => {
    const sunday = monthGrid(2026, 6, "sun", STATE, TODAY);
    expect(sunday[0][0].date).toBe("2026-05-31");
    expect(sunday[0][0].inMonth).toBe(false);
    expect(sunday[0][1].date).toBe("2026-06-01");
    const saturday = monthGrid(2026, 6, "sat", STATE, TODAY);
    expect(saturday[0][0].date).toBe("2026-05-30");
  });

  test("handles February in a leap year, a 4-week month and a 6-week month", () => {
    const leap = monthGrid(2024, 2, "mon", DEFAULT_CYCLE_STATE, "2024-02-10");
    expect(flat(leap).filter(day => day.inMonth)).toHaveLength(29);
    expect(monthGrid(2027, 2, "mon", DEFAULT_CYCLE_STATE, TODAY)).toHaveLength(4);
    expect(monthGrid(2026, 8, "mon", DEFAULT_CYCLE_STATE, TODAY)).toHaveLength(6);
  });

  test("crosses the year boundary", () => {
    const december = monthGrid(2025, 12, "mon", DEFAULT_CYCLE_STATE, "2025-12-15");
    expect(flat(december).at(-1)!.date).toBe("2026-01-04");
    const january = monthGrid(2026, 1, "mon", DEFAULT_CYCLE_STATE, "2025-12-15");
    expect(january[0][0].date).toBe("2025-12-29");
  });

  test("marks today only", () => {
    const today = flat(monthGrid(2026, 6, "mon", STATE, TODAY)).filter(day => day.isToday);
    expect(today.map(day => day.date)).toEqual([TODAY]);
    expect(flat(monthGrid(2026, 7, "mon", STATE, TODAY)).some(day => day.isToday)).toBe(false);
  });
});

describe("monthGrid kinds", () => {
  const june = monthGrid(2026, 6, "mon", STATE, TODAY);

  test("logged period days are 'period' and logged", () => {
    expect(datesOfKind(june, "period")).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
    expect(flat(june).filter(day => day.logged).map(day => day.date)).toEqual(datesOfKind(june, "period"));
  });

  test("past days that are not logged are never predicted", () => {
    for (const date of ["2026-06-06", "2026-06-07", "2026-06-08", "2026-06-09"]) expect(kindOn(june, date)).toBe("none");
    const may = monthGrid(2026, 5, "mon", STATE, TODAY);
    expect(datesOfKind(may, "period")).toEqual([
      "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08", "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
    ].filter(date => flat(may).some(day => day.date === date)));
    expect(datesOfKind(may, "fertile")).toEqual([]);
    expect(datesOfKind(may, "safe-estimate")).toEqual([]);
  });

  test("fertile days run from today to the end of the method range, then safe estimates follow", () => {
    expect(datesOfKind(june, "fertile")).toEqual([
      "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15",
      "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19",
    ]);
    expect(kindOn(june, "2026-06-20")).toBe("safe-estimate");
    expect(kindOn(june, "2026-06-28")).toBe("safe-estimate");
  });

  test("the next period is predicted from the predicted start for the usual length", () => {
    expect(kindOn(june, "2026-06-29")).toBe("predicted-period");
    expect(kindOn(june, "2026-06-30")).toBe("predicted-period");
    expect(kindOn(june, "2026-07-03")).toBe("predicted-period");
    expect(kindOn(june, "2026-07-04")).toBe("none");
  });

  test("predictions repeat for the following cycles and stop after 2 projected cycles", () => {
    expect(MAX_PROJECTED_CYCLES).toBe(2);
    const july = monthGrid(2026, 7, "mon", STATE, TODAY);
    expect(kindOn(july, "2026-07-06")).toBe("fertile");
    expect(kindOn(july, "2026-07-27")).toBe("predicted-period");
    const august = monthGrid(2026, 8, "mon", STATE, TODAY);
    expect(kindOn(august, "2026-08-23")).toBe("none");
    expect(kindOn(august, "2026-08-24")).toBe("none");
    expect(kindOn(monthGrid(2027, 3, "mon", STATE, TODAY), "2027-03-10")).toBe("none");
  });

  test("a logged period outranks a prediction", () => {
    const state = { ...STATE, periods: [...PERIODS, closed("2026-06-12")] };
    const grid = monthGrid(2026, 6, "mon", state, "2026-06-13");
    expect(kindOn(grid, "2026-06-12")).toBe("period");
    expect(flat(grid).find(day => day.date === "2026-06-12")!.logged).toBe(true);
  });

  test("the period length for predictions is the average of the closed ones", () => {
    const long = PERIODS.map(period => ({ start: period.start, end: addDays(period.start, 6) }));
    const grid = monthGrid(2026, 7, "mon", { ...STATE, periods: long }, TODAY);
    expect(kindOn(grid, "2026-07-05")).toBe("predicted-period");
    expect(kindOn(grid, "2026-07-06")).toBe("fertile");
  });

  test("with no closed periods the default period length applies", () => {
    const open = [{ start: "2026-03-09" }, { start: "2026-04-06" }, { start: "2026-05-04" }, { start: "2026-06-01" }];
    const state = { ...STATE, periods: open, defaults: { cycleLength: 28, periodLength: 3 } };
    const grid = monthGrid(2026, 6, "mon", state, "2026-06-03");
    expect(kindOn(grid, "2026-06-29")).toBe("predicted-period");
    expect(kindOn(grid, "2026-07-01")).toBe("predicted-period");
    expect(kindOn(grid, "2026-07-02")).toBe("none");
  });

  test("a period still going on keeps predicting its remaining days", () => {
    const state = { ...STATE, periods: [...PERIODS.slice(0, 3), { start: "2026-06-08" }] };
    const grid = monthGrid(2026, 6, "mon", state, "2026-06-10");
    expect(kindOn(grid, "2026-06-08")).toBe("period");
    expect(kindOn(grid, "2026-06-09")).toBe("none");
    expect(kindOn(grid, "2026-06-10")).toBe("predicted-period");
    expect(kindOn(grid, "2026-06-12")).toBe("predicted-period");
    expect(kindOn(grid, "2026-06-13")).not.toBe("predicted-period");
  });
});

describe("safe-estimate only in the current cycle", () => {
  test("it runs from the last start up to the predicted next start and never beyond", () => {
    const grid = [...monthGrid(2026, 6, "mon", STATE, TODAY), ...monthGrid(2026, 7, "mon", STATE, TODAY), ...monthGrid(2026, 8, "mon", STATE, TODAY)];
    const safe = datesOfKind(grid, "safe-estimate");
    expect(safe.length).toBeGreaterThan(0);
    expect(safe.every(date => date >= "2026-06-01" && date < "2026-06-29")).toBe(true);
  });

  test("projected cycles keep the predicted period and the fertile window, never a safe estimate", () => {
    const july = monthGrid(2026, 7, "mon", STATE, TODAY);
    expect(kindOn(july, "2026-07-01")).toBe("predicted-period");
    expect(kindOn(july, "2026-07-06")).toBe("fertile");
    // Cycle days 7..18 of the method range stay marked fertile in projected cycles (the cautious side), nothing is safe.
    expect(kindOn(july, "2026-07-17")).toBe("fertile");
    expect(kindOn(july, "2026-07-18")).toBe("none");
    expect(datesOfKind(july, "safe-estimate").every(date => date < "2026-06-29")).toBe(true);
    const august = monthGrid(2026, 8, "mon", STATE, TODAY);
    expect(kindOn(august, "2026-07-28")).toBe("predicted-period");
    expect(kindOn(august, "2026-08-10")).toBe("fertile");
  });

  test("a period that comes late cannot turn a labelled-safe day fertile: days after the predicted start are never safe", () => {
    for (const date of ["2026-06-29", "2026-07-04", "2026-07-10", "2026-07-20", "2026-08-15"]) {
      expect(kindOn(monthGrid(2026, Number(date.slice(5, 7)), "mon", STATE, TODAY), date)).not.toBe("safe-estimate");
    }
  });

  test("weekMarks agree with the grid in the current and in a projected cycle", () => {
    const shown = { ...STATE, showOnTimeline: true };
    expect(weekMarks(["2026-06-25", "2026-07-04", "2026-07-20"], shown, TODAY).map(mark => mark.kind)).toEqual(["safe-estimate", "none", "none"]);
  });
});

describe("monthGrid without enough data for safe days", () => {
  test("fertile days are shown but there are no safe estimates", () => {
    const state = { ...STATE, periods: [closed("2026-05-04"), closed("2026-06-01")] };
    const grid = monthGrid(2026, 6, "mon", state, TODAY);
    expect(datesOfKind(grid, "fertile")).toEqual([
      "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16",
    ]);
    expect(datesOfKind(grid, "safe-estimate")).toEqual([]);
    expect(kindOn(grid, "2026-06-29")).toBe("predicted-period");
  });

  test("irregular cycles produce no safe estimates either", () => {
    const state = { ...STATE, periods: [closed("2026-02-01"), closed("2026-02-22"), closed("2026-04-06"), closed("2026-06-01")] };
    expect(datesOfKind(monthGrid(2026, 6, "mon", state, TODAY), "safe-estimate")).toEqual([]);
  });
});

describe("monthGrid when predictions are not available", () => {
  const logsOnly = (grid: CalendarDay[][]) => flat(grid).every(day => day.kind === "none" || day.kind === "period");

  test("disabled and paused show the history only", () => {
    expect(logsOnly(monthGrid(2026, 6, "mon", { ...STATE, enabled: false }, TODAY))).toBe(true);
    expect(logsOnly(monthGrid(2026, 6, "mon", { ...STATE, paused: true }, TODAY))).toBe(true);
    expect(datesOfKind(monthGrid(2026, 6, "mon", { ...STATE, paused: true }, TODAY), "period")).toHaveLength(5);
  });

  test("no periods at all is an empty calendar", () => {
    expect(flat(monthGrid(2026, 6, "mon", { ...DEFAULT_CYCLE_STATE, enabled: true }, TODAY)).every(day => day.kind === "none")).toBe(true);
  });

  test("a late period withholds the predictions that no longer hold", () => {
    const grid = monthGrid(2026, 7, "mon", STATE, "2026-07-02");
    expect(logsOnly(grid)).toBe(true);
    expect(kindOn(grid, "2026-07-03")).toBe("none");
  });

  test("stale history shows no predictions", () => {
    expect(logsOnly(monthGrid(2026, 9, "mon", STATE, "2026-09-10"))).toBe(true);
  });
});

describe("weekMarks", () => {
  const dates = ["2026-06-09", "2026-06-10", "2026-06-11"];
  const shown = { ...STATE, showOnTimeline: true };

  test("gives one mark per date, in order, when shown on the timeline", () => {
    expect(weekMarks(dates, shown, TODAY)).toEqual([
      { date: "2026-06-09", kind: "none" }, { date: "2026-06-10", kind: "fertile" }, { date: "2026-06-11", kind: "fertile" },
    ]);
    expect(weekMarks(["2026-06-02", "2026-06-29", "2026-06-20"], shown, TODAY).map(mark => mark.kind))
      .toEqual(["period", "predicted-period", "safe-estimate"]);
  });

  test("gives only 'none' unless showOnTimeline and enabled and not paused", () => {
    for (const state of [STATE, { ...shown, enabled: false }, { ...shown, paused: true }]) {
      expect(weekMarks(dates, state, TODAY).every(mark => mark.kind === "none")).toBe(true);
      expect(weekMarks(dates, state, TODAY)).toHaveLength(3);
    }
  });

  test("an empty week is empty", () => {
    expect(weekMarks([], shown, TODAY)).toEqual([]);
  });
});
