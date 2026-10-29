import { describe, expect, test } from "bun:test";
import { suggestRepeat } from "./habits-repeat";
import type { Task } from "./planner";

const NOW = new Date(2026, 9, 29, 10, 0); // Thursday 2026-10-29

let counter = 0;
const done = (date: string | null, extra: Partial<Task> = {}, title = "Gym session"): Task => {
  counter += 1;
  return {
    id: `t${counter}`, title, date, start: date ? "07:00" : null, duration: 45, status: "done", category: "Wellness",
    notes: "", createdAt: "2026-09-01T00:00:00.000Z", ...extra,
  };
};
const on = (dates: string[], extra: Partial<Task> = {}, title = "Gym session") => dates.map(d => done(d, extra, title));

describe("suggestRepeat weekly", () => {
  test("suggests weekly when done on the same weekday in 3 of the last 4 weeks", () => {
    const history = on(["2026-10-29", "2026-10-22", "2026-10-08"]);
    expect(suggestRepeat("Gym session", history, NOW)).toEqual({ repeat: "weekly", weekday: 4, occurrences: 3, window: 4 });
  });

  test("does not suggest it for only 2 of 4 weeks", () => {
    expect(suggestRepeat("Gym session", on(["2026-10-29", "2026-10-15"]), NOW)).toBeNull();
  });

  test("ignores completions older than 28 days and in the future", () => {
    const history = on(["2026-10-29", "2026-10-22", "2026-10-01", "2026-11-05"]);
    expect(suggestRepeat("Gym session", history, NOW)).toBeNull();
  });

  test("counts a day once even when it holds duplicate tasks", () => {
    const history = on(["2026-10-29", "2026-10-29", "2026-10-29", "2026-10-22", "2026-10-22"]);
    expect(suggestRepeat("Gym session", history, NOW)).toBeNull();
  });

  test("works across a month and year boundary", () => {
    const now = new Date(2027, 0, 2, 9, 0); // Saturday
    const history = on(["2027-01-02", "2026-12-26", "2026-12-12"]);
    expect(suggestRepeat("Gym session", history, now)).toEqual({ repeat: "weekly", weekday: 6, occurrences: 3, window: 4 });
  });

  test("works across the March clock change using local dates", () => {
    const now = new Date(2026, 2, 12, 9, 0); // Thursday
    const history = on(["2026-03-12", "2026-03-05", "2026-02-19"]);
    expect(suggestRepeat("Gym session", history, now)).toEqual({ repeat: "weekly", weekday: 4, occurrences: 3, window: 4 });
  });

  test("picks the weekday with the most completions", () => {
    const history = on(["2026-10-29", "2026-10-22", "2026-10-15", "2026-10-08", "2026-10-28", "2026-10-21", "2026-10-14"]);
    expect(suggestRepeat("Gym session", history, NOW)).toEqual({ repeat: "weekly", weekday: 4, occurrences: 4, window: 4 });
  });
});

describe("suggestRepeat weekdays", () => {
  test("suggests weekdays when done on 4 of the last 5 weekdays", () => {
    // Thu 29, Wed 28, Tue 27, Mon 26, Fri 23 are the last five weekdays.
    const history = on(["2026-10-29", "2026-10-28", "2026-10-27", "2026-10-23"]);
    expect(suggestRepeat("Gym session", history, NOW)).toEqual({ repeat: "weekdays", weekday: null, occurrences: 4, window: 5 });
  });

  test("does not suggest weekdays for 3 of 5", () => {
    expect(suggestRepeat("Gym session", on(["2026-10-29", "2026-10-28", "2026-10-27"]), NOW)).toBeNull();
  });

  test("weekend completions do not count toward the weekday window", () => {
    const history = on(["2026-10-29", "2026-10-28", "2026-10-27", "2026-10-25"]);
    expect(suggestRepeat("Gym session", history, NOW)).toBeNull();
  });

  test("skips weekends when walking back across a month boundary", () => {
    const now = new Date(2026, 10, 3, 9, 0); // Tuesday 2026-11-03
    // Last five weekdays: Nov 3, Nov 2, Oct 30, Oct 29, Oct 28.
    const history = on(["2026-11-03", "2026-11-02", "2026-10-30", "2026-10-28"]);
    expect(suggestRepeat("Gym session", history, now)?.repeat).toBe("weekdays");
  });
});

describe("suggestRepeat daily", () => {
  test("suggests daily when done on 6 of the last 7 days", () => {
    const history = on(["2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26", "2026-10-24", "2026-10-23"]);
    expect(suggestRepeat("Gym session", history, NOW)).toEqual({ repeat: "daily", weekday: null, occurrences: 6, window: 7 });
  });

  test("works across a year boundary", () => {
    const now = new Date(2027, 0, 3, 9, 0);
    const history = on(["2027-01-03", "2027-01-02", "2027-01-01", "2026-12-31", "2026-12-30", "2026-12-28"]);
    expect(suggestRepeat("Gym session", history, now)?.repeat).toBe("daily");
  });

  test("5 of 7 days on weekdays-only habits stays a weekdays suggestion", () => {
    const history = on(["2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26", "2026-10-23"]);
    expect(suggestRepeat("Gym session", history, NOW)?.repeat).toBe("weekdays");
  });
});

describe("suggestRepeat exclusions", () => {
  const dates = ["2026-10-29", "2026-10-22", "2026-10-08"];

  test("returns null when a matching task already belongs to a series", () => {
    expect(suggestRepeat("Gym session", [...on(dates), done("2026-10-15", { seriesId: "s1" })], NOW)).toBeNull();
  });

  test("returns null when a matching task carries a repeat rule", () => {
    expect(suggestRepeat("Gym session", [...on(dates), done("2026-10-15", { repeat: "weekly" })], NOW)).toBeNull();
  });

  test("a series task outside the window does not block the suggestion", () => {
    const history = [...on(dates), done("2026-08-01", { seriesId: "old" })];
    expect(suggestRepeat("Gym session", history, NOW)?.repeat).toBe("weekly");
  });

  test("ignores tasks that are not done, have no date, or have another title", () => {
    const history = [
      ...on(dates, { status: "todo" }), done(null), ...on(dates, {}, "Gym"), ...on(dates, {}, "Gym session extra"),
    ];
    expect(suggestRepeat("Gym session", history, NOW)).toBeNull();
  });

  test("matches the exact normalized title, ignoring case, accents and edge punctuation", () => {
    expect(suggestRepeat("  GYM SESSION!! ", on(dates), NOW)?.repeat).toBe("weekly");
    expect(suggestRepeat("Đi chợ", on(dates, {}, "di cho"), NOW)?.repeat).toBe("weekly");
  });

  test("returns null for short titles and empty history", () => {
    expect(suggestRepeat("gy", on(dates, {}, "gy"), NOW)).toBeNull();
    expect(suggestRepeat("", [], NOW)).toBeNull();
    expect(suggestRepeat("Gym session", [], NOW)).toBeNull();
  });
});
