import { describe, test, expect } from "bun:test";
import { DEFAULT_CYCLE_STATE, type CycleState, type Period } from "./cycle";
import { averagePeriodLength, cycleEntries, cycleLengths, predict, recentCycleEntries, type SafeDaysReason } from "./cycle-predict";
import { addDays } from "./planner";

/** Period starts `first`, then one more after each gap. */
function startsFrom(first: string, gaps: number[]): Period[] {
  const periods: Period[] = [{ start: first }];
  for (const gap of gaps) periods.push({ start: addDays(periods.at(-1)!.start, gap) });
  return periods;
}
const active = (periods: Period[], patch: Partial<CycleState> = {}): CycleState => ({
  ...DEFAULT_CYCLE_STATE, enabled: true, ...patch, periods,
});
const lastOf = (periods: Period[]) => periods.at(-1)!.start;

describe("cycleEntries / cycleLengths", () => {
  test("are the gaps between consecutive starts, each tagged with the earlier start", () => {
    const periods = startsFrom("2026-01-01", [28, 30, 27]);
    expect(cycleEntries(periods)).toEqual([
      { start: "2026-01-01", length: 28 },
      { start: "2026-01-29", length: 30 },
      { start: "2026-02-28", length: 27 },
    ]);
    expect(cycleLengths(periods)).toEqual([28, 30, 27]);
  });

  test("none or one period means no cycles", () => {
    expect(cycleLengths([])).toEqual([]);
    expect(cycleLengths([{ start: "2026-01-01" }])).toEqual([]);
  });

  test("gaps under 15 and over 60 days are ignored, the edges are kept", () => {
    expect(cycleLengths(startsFrom("2026-01-01", [14, 28, 61, 29, 15, 60]))).toEqual([28, 29, 15, 60]);
  });

  test("works on unsorted input without changing it", () => {
    const periods = [{ start: "2026-02-01" }, { start: "2026-01-01" }];
    expect(cycleLengths(periods)).toEqual([31]);
    expect(periods[0].start).toBe("2026-02-01");
  });

  test("counts across a leap day and a year boundary", () => {
    expect(cycleLengths([{ start: "2024-02-20" }, { start: "2024-03-20" }])).toEqual([29]);
    expect(cycleLengths([{ start: "2025-12-20" }, { start: "2026-01-17" }])).toEqual([28]);
  });
});

describe("averagePeriodLength", () => {
  test("is the mean of closed periods, counting both days, rounded to one decimal", () => {
    expect(averagePeriodLength([{ start: "2026-01-01", end: "2026-01-05" }, { start: "2026-02-01", end: "2026-02-04" }])).toBe(4.5);
    expect(averagePeriodLength([
      { start: "2026-01-01", end: "2026-01-05" }, { start: "2026-02-01", end: "2026-02-04" }, { start: "2026-03-01", end: "2026-03-04" },
    ])).toBe(4.3);
  });

  test("ignores open periods and is null with nothing closed", () => {
    expect(averagePeriodLength([{ start: "2026-01-01" }])).toBeNull();
    expect(averagePeriodLength([])).toBeNull();
    expect(averagePeriodLength([{ start: "2026-01-01" }, { start: "2026-02-01", end: "2026-02-03" }])).toBe(3);
  });
});

describe("predict: inactive and empty", () => {
  const periods = startsFrom("2026-04-01", [28, 28]);
  const empty = (reason: SafeDaysReason) => ({
    nextStart: null, nextRangeEarliest: null, nextRangeLatest: null, averageLength: null, cycleLength: null, cycleCount: 0,
    lastStart: null, daysUntilNext: null, late: false, daysLate: 0, ovulation: null, fertileWindow: null,
    safeDays: { kind: null, fertile: null, cycleDays: null, reason },
  });

  test("disabled gives nothing, with the reason", () => {
    expect(predict(active(periods, { enabled: false }), "2026-06-10")).toEqual(empty("disabled"));
  });

  test("paused gives nothing, with the reason", () => {
    expect(predict(active(periods, { paused: true }), "2026-06-10")).toEqual(empty("paused"));
  });

  test("disabled wins over paused", () => {
    expect(predict(active(periods, { enabled: false, paused: true }), "2026-06-10").safeDays.reason).toBe("disabled");
  });

  test("no periods is no-data", () => {
    expect(predict(active([]), "2026-06-10")).toEqual(empty("no-data"));
  });

  test("periods that start after today are not used", () => {
    expect(predict(active([{ start: "2026-06-20" }]), "2026-06-10")).toEqual(empty("no-data"));
    expect(predict(active([{ start: "2026-05-20" }, { start: "2026-06-20" }]), "2026-06-10").lastStart).toBe("2026-05-20");
  });
});

describe("predict: average and next start", () => {
  test("one period uses the default cycle length, with no cycles known", () => {
    const result = predict(active([{ start: "2026-06-01" }], { defaults: { cycleLength: 30, periodLength: 5 } }), "2026-06-05");
    expect(result).toMatchObject({
      lastStart: "2026-06-01", cycleCount: 0, averageLength: 30, cycleLength: 30, nextStart: "2026-07-01",
      daysUntilNext: 26, late: false, daysLate: 0,
    });
  });

  test("two periods give one known cycle", () => {
    const periods = startsFrom("2026-05-01", [30]);
    const result = predict(active(periods), "2026-06-05");
    expect(result).toMatchObject({ cycleCount: 1, averageLength: 30, nextStart: "2026-06-30", lastStart: "2026-05-31" });
  });

  test("averages the most recent 6 cycles only", () => {
    const periods = startsFrom("2025-06-01", [40, 40, 40, 26, 28, 30, 26, 28, 30]);
    const result = predict(active(periods), addDays(lastOf(periods), 2));
    expect(result.cycleCount).toBe(9);
    expect(result.averageLength).toBe(28);
    expect(result.nextStart).toBe(addDays(lastOf(periods), 28));
  });

  test("a fractional average is shown to one decimal and rounded for dates", () => {
    const periods = startsFrom("2026-01-01", [28, 29, 28]);
    const result = predict(active(periods), "2026-04-01");
    expect(result.averageLength).toBe(28.3);
    expect(result.cycleLength).toBe(28);
    expect(result.nextStart).toBe(addDays(lastOf(periods), 28));
    const up = predict(active(startsFrom("2026-01-01", [28, 29, 29])), "2026-04-01");
    expect(up.averageLength).toBe(28.7);
    expect(up.cycleLength).toBe(29);
  });

  test("an average above 45 or below 21 is clamped", () => {
    expect(predict(active(startsFrom("2025-01-01", [55, 58, 56])), "2025-06-25")).toMatchObject({ averageLength: 45, cycleLength: 45 });
    expect(predict(active(startsFrom("2026-01-01", [16, 17, 18])), "2026-03-01")).toMatchObject({ averageLength: 21, cycleLength: 21 });
  });

  test("the average uses only the unbroken run of cycles that ends at the latest start", () => {
    const periods = startsFrom("2026-01-01", [28, 90, 28, 10, 30]);
    const result = predict(active(periods), "2026-07-10");
    expect(result.cycleCount).toBe(1);
    expect(result.averageLength).toBe(30);
    const broken = startsFrom("2025-01-01", [40, 40, 90, 26, 28, 30]);
    const withBreak = predict(active(broken), addDays(lastOf(broken), 2));
    expect(withBreak.cycleCount).toBe(3);
    expect(withBreak.averageLength).toBe(28);
  });

  test("crosses a year boundary and a leap day", () => {
    expect(predict(active([{ start: "2023-12-20" }]), "2023-12-25").nextStart).toBe("2024-01-17");
    expect(predict(active([{ start: "2024-02-10" }]), "2024-02-12").nextStart).toBe("2024-03-09");
    expect(predict(active([{ start: "2026-02-10" }]), "2026-02-12").nextStart).toBe("2026-03-10");
  });

  test("crosses daylight-saving changes without shifting a day", () => {
    expect(predict(active([{ start: "2026-03-01" }]), "2026-03-02").nextStart).toBe("2026-03-29");
    expect(predict(active([{ start: "2026-10-10" }]), "2026-10-11").nextStart).toBe("2026-11-07");
    expect(predict(active([{ start: "2026-03-05" }]), "2026-03-06").daysUntilNext).toBe(27);
    expect(predict(active([{ start: "2026-10-20" }]), "2026-11-03").daysUntilNext).toBe(14);
  });
});

describe("predict: range", () => {
  test("no known cycle or one cycle is plus or minus 3 days", () => {
    const none = predict(active([{ start: "2026-06-01" }]), "2026-06-02");
    expect([none.nextRangeEarliest, none.nextRangeLatest]).toEqual(["2026-06-26", "2026-07-02"]);
    const one = predict(active(startsFrom("2026-05-01", [28])), "2026-06-02");
    expect(one.nextStart).toBe("2026-06-26");
    expect([one.nextRangeEarliest, one.nextRangeLatest]).toEqual(["2026-06-23", "2026-06-29"]);
  });

  test("with several cycles it is half the range of the recent ones, at least 1 and at most 7", () => {
    const steady = predict(active(startsFrom("2026-01-01", [28, 28, 28])), "2026-04-01");
    expect(steady.nextStart).toBe("2026-04-23");
    expect([steady.nextRangeEarliest, steady.nextRangeLatest]).toEqual(["2026-04-22", "2026-04-24"]);
    const varied = predict(active(startsFrom("2026-01-01", [26, 30])), "2026-03-15");
    expect(varied.nextStart).toBe("2026-03-26");
    expect([varied.nextRangeEarliest, varied.nextRangeLatest]).toEqual(["2026-03-24", "2026-03-28"]);
    const wild = predict(active(startsFrom("2026-01-01", [21, 45])), "2026-03-10");
    expect(wild.nextStart).toBe("2026-04-10");
    expect([wild.nextRangeEarliest, wild.nextRangeLatest]).toEqual(["2026-04-03", "2026-04-17"]);
  });
});

describe("predict: ovulation and fertile window", () => {
  test("ovulation is 14 days before the next start, the window runs 5 days before to 1 day after", () => {
    const result = predict(active([{ start: "2026-06-01" }]), "2026-06-03");
    expect(result.nextStart).toBe("2026-06-29");
    expect(result.ovulation).toBe("2026-06-15");
    expect(result.fertileWindow).toEqual({ start: "2026-06-10", end: "2026-06-16" });
  });

  test("follows the average cycle length", () => {
    const result = predict(active(startsFrom("2026-01-01", [32, 32])), "2026-03-10");
    expect(result.nextStart).toBe("2026-04-07");
    expect(result.ovulation).toBe("2026-03-24");
    expect(result.fertileWindow).toEqual({ start: "2026-03-19", end: "2026-03-25" });
  });
});

describe("predict: lateness", () => {
  const periods = [{ start: "2026-06-01" }];

  test("on the predicted day and before it the period is not late", () => {
    expect(predict(active(periods), "2026-06-29")).toMatchObject({ late: false, daysLate: 0, daysUntilNext: 0 });
    expect(predict(active(periods), "2026-06-28")).toMatchObject({ late: false, daysUntilNext: 1 });
  });

  test("the day after it is late, and the count grows", () => {
    expect(predict(active(periods), "2026-06-30")).toMatchObject({ late: true, daysLate: 1, daysUntilNext: -1, nextStart: "2026-06-29" });
    expect(predict(active(periods), "2026-07-09")).toMatchObject({ late: true, daysLate: 10 });
  });

  test("while late there is no ovulation, fertile window or safe-days estimate", () => {
    const late = predict(active(startsFrom("2026-01-01", [28, 28, 28])), "2026-04-30");
    expect(late.late).toBe(true);
    expect(late.ovulation).toBeNull();
    expect(late.fertileWindow).toBeNull();
    expect(late.safeDays).toEqual({ kind: null, fertile: null, cycleDays: null, reason: "late" });
  });

  test("a new period resets it", () => {
    const logged = [...periods, { start: "2026-07-03" }];
    expect(predict(active(logged), "2026-07-04")).toMatchObject({ late: false, lastStart: "2026-07-03", nextStart: "2026-08-04" });
  });

  test("more than 60 days late the data is stale: no prediction and not late", () => {
    const stale = predict(active(startsFrom("2026-01-01", [28, 28])), "2026-08-01");
    expect(stale).toMatchObject({
      nextStart: null, nextRangeEarliest: null, nextRangeLatest: null, daysUntilNext: null, late: false, daysLate: 0,
      ovulation: null, fertileWindow: null, lastStart: "2026-02-26", cycleCount: 2, averageLength: 28, cycleLength: 28,
      safeDays: { kind: null, fertile: null, cycleDays: null, reason: "no-data" },
    });
    const edge = predict(active([{ start: "2026-01-01" }]), addDays("2026-01-29", 60));
    expect(edge.late).toBe(true);
    expect(predict(active([{ start: "2026-01-01" }]), addDays("2026-01-29", 61)).late).toBe(false);
  });
});

describe("predict: safe days", () => {
  const safe = (gaps: number[], today?: string) => {
    const periods = startsFrom("2025-06-01", gaps);
    return predict(active(periods), today ?? addDays(lastOf(periods), 3)).safeDays;
  };

  test("fewer than 3 cycles is not enough", () => {
    expect(safe([])).toEqual({ kind: null, fertile: null, cycleDays: null, reason: "not-enough-cycles" });
    expect(safe([28, 28]).reason).toBe("not-enough-cycles");
  });

  test("3 steady cycles in 26..32 use the Standard Days method: cycle days 8 to 19 of the last start", () => {
    const periods = startsFrom("2026-01-01", [28, 28, 28]);
    const result = predict(active(periods), "2026-04-02").safeDays;
    expect(periods.at(-1)!.start).toBe("2026-03-26");
    expect(result).toEqual({
      kind: "standard-days", reason: "ok", cycleDays: { first: 8, last: 19 },
      fertile: { start: "2026-04-02", end: "2026-04-13" },
    });
  });

  test("the Standard Days range edges 26 and 32 qualify, 25 and 33 do not", () => {
    expect(safe([26, 32, 29]).kind).toBe("standard-days");
    expect(safe([26, 26, 26, 26, 26]).kind).toBe("standard-days");
    expect(safe([25, 28, 28])).toMatchObject({ kind: null, reason: "not-enough-cycles" });
    expect(safe([28, 28, 33])).toMatchObject({ kind: null, reason: "not-enough-cycles" });
  });

  test("a regular but non-standard set of 3 to 5 cycles waits for 6 cycles", () => {
    expect(safe([24, 24, 24, 24, 24])).toMatchObject({ kind: null, reason: "not-enough-cycles" });
  });

  test("6 or more cycles use Ogino-Knaus: first day shortest-18, last day longest-11", () => {
    const periods = startsFrom("2025-06-01", [27, 28, 29, 30, 28, 28]);
    const last = lastOf(periods);
    const result = predict(active(periods), addDays(last, 3)).safeDays;
    expect(result.kind).toBe("ogino");
    expect(result.reason).toBe("ok");
    expect(result.cycleDays).toEqual({ first: 9, last: 19 });
    expect(result.fertile).toEqual({ start: addDays(last, 8), end: addDays(last, 18) });
  });

  test("Ogino uses only the last 12 cycles", () => {
    const old = [17];
    const recent = [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
    const result = safe([...old, ...recent]);
    expect(result.kind).toBe("ogino");
    expect(result.cycleDays).toEqual({ first: 10, last: 17 });
    expect(safe([...old, ...recent.slice(1)]).reason).toBe("irregular");
  });

  test("a spread of 9 days is allowed, 10 is irregular", () => {
    const ok = safe([22, 31, 26, 26, 26, 26]);
    expect(ok).toMatchObject({ kind: "ogino", cycleDays: { first: 4, last: 20 } });
    expect(safe([22, 32, 26, 26, 26, 26])).toEqual({ kind: null, fertile: null, cycleDays: null, reason: "irregular" });
  });

  test("any cycle outside 21..45 is irregular, with 3 cycles or with many", () => {
    expect(safe([28, 28, 17]).reason).toBe("irregular");
    expect(safe([20, 20, 20]).reason).toBe("irregular");
    expect(safe([46, 46, 46]).reason).toBe("irregular");
    expect(safe([28, 28, 28, 28, 28, 50]).reason).toBe("irregular");
    expect(safe([21, 21, 21]).reason).toBe("not-enough-cycles");
    expect(safe([45, 45, 45]).reason).toBe("not-enough-cycles");
  });

  test("irregular beats not-enough only once there are 3 cycles", () => {
    expect(safe([17, 28]).reason).toBe("not-enough-cycles");
  });

  test("paused and disabled never produce safe days", () => {
    const periods = startsFrom("2026-01-01", [28, 28, 28]);
    expect(predict(active(periods, { paused: true }), "2026-04-02").safeDays.reason).toBe("paused");
    expect(predict(active(periods, { enabled: false }), "2026-04-02").safeDays.reason).toBe("disabled");
  });

  test("no periods at all is no-data", () => {
    expect(predict(active([]), "2026-04-02").safeDays.reason).toBe("no-data");
  });
});

describe("recentCycleEntries", () => {
  test("is the run of usable gaps that ends at the latest start, oldest first", () => {
    expect(recentCycleEntries(startsFrom("2026-01-01", [28, 30, 27]))).toEqual(cycleEntries(startsFrom("2026-01-01", [28, 30, 27])));
    expect(recentCycleEntries(startsFrom("2026-01-01", [28, 28, 80, 26, 27])).map(entry => entry.length)).toEqual([26, 27]);
  });

  test("stops at a gap under 15 or over 60 days, the edges 15 and 60 are kept", () => {
    expect(recentCycleEntries(startsFrom("2026-01-01", [28, 14, 28, 29])).map(entry => entry.length)).toEqual([28, 29]);
    expect(recentCycleEntries(startsFrom("2026-01-01", [28, 61, 15, 60])).map(entry => entry.length)).toEqual([15, 60]);
  });

  test("is empty when the latest gap is unusable, and for none or one period", () => {
    expect(recentCycleEntries(startsFrom("2026-01-01", [28, 28, 28, 90]))).toEqual([]);
    expect(recentCycleEntries([])).toEqual([]);
    expect(recentCycleEntries([{ start: "2026-01-01" }])).toEqual([]);
  });

  test("does not change its input", () => {
    const periods = [{ start: "2026-02-01" }, { start: "2026-01-01" }];
    expect(recentCycleEntries(periods)).toEqual([{ start: "2026-01-01", length: 31 }]);
    expect(periods[0].start).toBe("2026-02-01");
  });
});

describe("predict: a break in the history resets the safe days", () => {
  test("six regular cycles long ago and one new start today give no safe days", () => {
    const old = startsFrom("2021-03-01", [28, 28, 28, 28, 28, 28]);
    const result = predict(active([...old, { start: "2026-06-10" }]), "2026-06-10");
    expect(result.safeDays).toEqual({ kind: null, fertile: null, cycleDays: null, reason: "not-enough-cycles" });
    expect(result.cycleCount).toBe(0);
    expect(result.cycleLength).toBe(28);
    expect(result.nextStart).toBe("2026-07-08");
  });

  test("a gap of 80 days after six regular cycles starts the history again", () => {
    const old = startsFrom("2025-01-01", [28, 28, 28, 28, 28, 28]);
    const afterBreak = [{ start: addDays(lastOf(old), 80) }];
    const today = addDays(afterBreak[0].start, 3);
    expect(predict(active([...old, ...afterBreak]), today).safeDays.reason).toBe("not-enough-cycles");
    const three = startsFrom(afterBreak[0].start, [28, 28, 28]);
    const resumed = predict(active([...old, ...three]), addDays(lastOf(three), 3));
    expect(resumed.cycleCount).toBe(3);
    expect(resumed.safeDays.kind).toBe("standard-days");
    const two = startsFrom(afterBreak[0].start, [28, 28]);
    expect(predict(active([...old, ...two]), addDays(lastOf(two), 3)).safeDays.reason).toBe("not-enough-cycles");
  });

  test("an unusable short gap (under 15 days) also breaks the run", () => {
    const periods = startsFrom("2025-01-01", [28, 28, 28, 28, 28, 28, 10, 28, 28]);
    const result = predict(active(periods), addDays(lastOf(periods), 3));
    expect(result.cycleCount).toBe(2);
    expect(result.safeDays.reason).toBe("not-enough-cycles");
  });

  test("3 to 5 and 6 or more consecutive recent cycles still work", () => {
    const three = startsFrom("2026-01-01", [28, 28, 28]);
    expect(predict(active(three), addDays(lastOf(three), 3)).safeDays).toMatchObject({ kind: "standard-days", cycleDays: { first: 8, last: 19 } });
    const six = startsFrom("2025-06-01", [27, 28, 29, 30, 28, 28]);
    expect(predict(active(six), addDays(lastOf(six), 3)).safeDays).toMatchObject({ kind: "ogino", cycleDays: { first: 9, last: 19 } });
    const brokenThenSix = [{ start: "2020-01-01" }, ...startsFrom("2025-06-01", [27, 28, 29, 30, 28, 28])];
    expect(predict(active(brokenThenSix), addDays(lastOf(six), 3)).safeDays).toMatchObject({ kind: "ogino", cycleDays: { first: 9, last: 19 } });
  });

  test("an old regular history that is now stale or late gives no safe days", () => {
    const periods = startsFrom("2025-01-01", [28, 28, 28, 28, 28, 28]);
    expect(predict(active(periods), addDays(lastOf(periods), 40)).safeDays.reason).toBe("late");
    expect(predict(active(periods), addDays(lastOf(periods), 200)).safeDays.reason).toBe("no-data");
  });
});

describe("predict in other time zones", () => {
  const zones = ["America/New_York", "Europe/London", "Australia/Sydney", "Pacific/Auckland", "Asia/Ho_Chi_Minh", "America/Sao_Paulo"];

  test("dates and counts are identical across daylight-saving changes", () => {
    const original = process.env.TZ;
    try {
      for (const zone of zones) {
        process.env.TZ = zone;
        // Spans the March, April and October/November clock changes of both hemispheres.
        for (const last of ["2026-03-01", "2026-03-20", "2026-04-01", "2026-09-25", "2026-10-20"]) {
          const periods = startsFrom(addDays(last, -84), [28, 28, 28]);
          const result = predict(active(periods), addDays(last, 2));
          expect(result.lastStart).toBe(last);
          expect(result.nextStart).toBe(addDays(last, 28));
          expect(result.daysUntilNext).toBe(26);
          expect(result.safeDays.fertile).toEqual({ start: addDays(last, 7), end: addDays(last, 18) });
        }
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
