import { describe, expect, test } from "bun:test";
import { DAYS_PER_PAGE, INITIAL_DAYS, NEAR_END_PX, daysBetween, initialDays, nextDays, pageScheduled, pagingStep, shownScheduled } from "./explore-paging";
import type { Task } from "./planner";

let counter = 0;
function task(date: string | null, patch: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `t${counter}`, title: `Task ${counter}`, date, start: date ? "09:00" : null, duration: 30,
    status: "todo", category: "Focus", notes: "", createdAt: "2026-01-01T00:00:00.000Z", ...patch,
  };
}
const dates = (tasks: readonly Task[]) => tasks.map(item => item.date);

describe("pagingStep", () => {
  test("arriving near the bottom while armed loads one page and disarms", () => {
    expect(pagingStep(NEAR_END_PX, true)).toEqual({ load: true, armed: false });
    expect(pagingStep(0, true)).toEqual({ load: true, armed: false });
    expect(pagingStep(-5, true)).toEqual({ load: true, armed: false });
  });

  test("staying near the bottom afterwards loads nothing more (no chaining)", () => {
    expect(pagingStep(10, false)).toEqual({ load: false, armed: false });
    expect(pagingStep(NEAR_END_PX, false)).toEqual({ load: false, armed: false });
  });

  test("scrolling well away from the bottom arms it again, a little away does not", () => {
    expect(pagingStep(NEAR_END_PX * 2 + 1, false)).toEqual({ load: false, armed: true });
    expect(pagingStep(NEAR_END_PX + 40, false)).toEqual({ load: false, armed: false });
    expect(pagingStep(NEAR_END_PX * 3, true)).toEqual({ load: false, armed: true });
  });
});

describe("daysBetween", () => {
  test("counts calendar days, 0 for the same day", () => {
    expect(daysBetween("2026-05-04", "2026-05-04")).toBe(0);
    expect(daysBetween("2026-05-04", "2026-05-06")).toBe(2);
  });

  test("handles month and year boundaries and leap days", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  test("is exact across daylight saving changes", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  test("is negative when the second day is earlier", () => {
    expect(daysBetween("2026-05-04", "2026-05-01")).toBe(-3);
  });
});

describe("pageScheduled", () => {
  const today = "2026-05-04";

  test("returns empty pages for an empty list", () => {
    expect(pageScheduled([], today, 2)).toEqual({ upcoming: [], earlier: [], earlierCount: 0, hasMore: false, windowEnd: "2026-05-05" });
  });

  test("shows today and tomorrow only, with the rest reported as more", () => {
    const list = [task("2026-05-04"), task("2026-05-05"), task("2026-05-06"), task("2026-05-09")];
    const page = pageScheduled(list, today, 2);
    expect(dates(page.upcoming)).toEqual(["2026-05-04", "2026-05-05"]);
    expect(page.hasMore).toBe(true);
    expect(page.windowEnd).toBe("2026-05-05");
  });

  test("includes a task exactly on the window edge and excludes the next day", () => {
    const edge = task("2026-05-05");
    const beyond = task("2026-05-06");
    const page = pageScheduled([edge, beyond], today, 2);
    expect(page.upcoming).toEqual([edge]);
    expect(page.hasMore).toBe(true);
    expect(pageScheduled([edge, beyond], today, 3).upcoming).toEqual([edge, beyond]);
    expect(pageScheduled([edge, beyond], today, 3).hasMore).toBe(false);
  });

  test("keeps every task of a busy day in the window", () => {
    const busy = Array.from({ length: 40 }, () => task("2026-05-04"));
    const page = pageScheduled([...busy, task("2026-05-10")], today, 2);
    expect(page.upcoming).toHaveLength(40);
    expect(page.hasMore).toBe(true);
  });

  test("separates tasks before today into earlier and counts them", () => {
    const old1 = task("2026-04-30");
    const old2 = task("2026-05-03");
    const now = task("2026-05-04");
    const page = pageScheduled([old1, old2, now], today, 2);
    expect(page.earlier).toEqual([old1, old2]);
    expect(page.earlierCount).toBe(2);
    expect(page.upcoming).toEqual([now]);
    expect(page.hasMore).toBe(false);
  });

  test("ignores backlog tasks without a date", () => {
    const page = pageScheduled([task(null), task("2026-05-04")], today, 2);
    expect(page.upcoming).toHaveLength(1);
    expect(page.earlierCount).toBe(0);
  });

  test("windows span month and year boundaries", () => {
    const page = pageScheduled([task("2026-12-31"), task("2027-01-01"), task("2027-01-02")], "2026-12-31", 2);
    expect(dates(page.upcoming)).toEqual(["2026-12-31", "2027-01-01"]);
    expect(page.windowEnd).toBe("2027-01-01");
    expect(page.hasMore).toBe(true);
  });

  test("treats a days count below one as one day", () => {
    const page = pageScheduled([task("2026-05-04"), task("2026-05-05")], today, 0);
    expect(dates(page.upcoming)).toEqual(["2026-05-04"]);
    expect(page.windowEnd).toBe(today);
  });

  test("does not change its input", () => {
    const list = [task("2026-04-01"), task("2026-05-04")];
    const copy = [...list];
    pageScheduled(list, today, 2);
    expect(list).toEqual(copy);
  });
});

describe("shownScheduled", () => {
  const old = task("2026-05-01");
  const now = task("2026-05-04");
  const page = pageScheduled([old, now], "2026-05-04", 2);

  test("hides earlier tasks by default", () => {
    expect(shownScheduled(page, false)).toEqual([now]);
  });

  test("puts earlier tasks first when expanded", () => {
    expect(shownScheduled(page, true)).toEqual([old, now]);
  });
});

describe("initialDays", () => {
  const today = "2026-05-04";

  test("is two days for an empty list or when nothing is upcoming", () => {
    expect(initialDays([], today)).toBe(INITIAL_DAYS);
    expect(initialDays([task("2026-05-01")], today)).toBe(INITIAL_DAYS);
    expect(initialDays([task(null)], today)).toBe(INITIAL_DAYS);
  });

  test("stays at two days when a task is today or tomorrow", () => {
    expect(initialDays([task("2026-05-04")], today)).toBe(2);
    expect(initialDays([task("2026-05-05")], today)).toBe(2);
  });

  test("grows in steps of two until the first upcoming task day is shown", () => {
    expect(initialDays([task("2026-05-06")], today)).toBe(4);
    expect(initialDays([task("2026-05-07")], today)).toBe(4);
    expect(initialDays([task("2026-05-08")], today)).toBe(6);
  });

  test("uses the first upcoming day, ignoring earlier tasks and later ones", () => {
    expect(initialDays([task("2026-05-01"), task("2026-05-20"), task("2026-05-06")], today)).toBe(4);
  });

  test("reaches a task months away", () => {
    const list = [task("2026-08-04")];
    const days = initialDays(list, today);
    expect(days % DAYS_PER_PAGE).toBe(0);
    expect(pageScheduled(list, today, days).upcoming).toHaveLength(1);
    expect(pageScheduled(list, today, days - DAYS_PER_PAGE).upcoming).toHaveLength(0);
  });
});

describe("nextDays", () => {
  const today = "2026-05-04";

  test("adds two days when the next day has a task", () => {
    expect(nextDays([task("2026-05-04"), task("2026-05-06")], today, 2)).toBe(4);
  });

  test("skips empty stretches so a page always gains a task", () => {
    const list = [task("2026-05-04"), task("2026-05-14")];
    const next = nextDays(list, today, 2);
    expect(next).toBe(12);
    expect(pageScheduled(list, today, next).upcoming).toHaveLength(2);
    expect(pageScheduled(list, today, next - 2).upcoming).toHaveLength(1);
  });

  test("stays put when there is nothing later", () => {
    expect(nextDays([task("2026-05-04")], today, 2)).toBe(2);
    expect(nextDays([], today, 6)).toBe(6);
  });

  test("a task right after the window edge adds a single page", () => {
    expect(nextDays([task("2026-05-08")], today, 4)).toBe(6);
  });
});
