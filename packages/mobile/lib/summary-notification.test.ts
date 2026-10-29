import { describe, test, expect } from "bun:test";
import { planSummary, SUMMARY_DAYS } from "./summary-notification";
import { SUMMARY_ID_PREFIX } from "./reminders";
import type { Task } from "./planner";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Deep work",
    date: "2026-10-30",
    start: "09:30",
    duration: 60,
    status: "todo",
    category: "Focus",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    remind: null,
    ...overrides,
  };
}

const NOW = new Date(2026, 9, 29, 10, 0);
const OPTIONS = { time: "08:00", language: "en" as const, hideTitles: false };

describe("planSummary content", () => {
  test("one task: singular title and the first task as the body", () => {
    const [summary] = planSummary([makeTask()], NOW, OPTIONS);
    expect(summary!.title).toBe("Today you have 1 task");
    expect(summary!.body).toBe("First: Deep work · 09:30");
    expect(summary!.fireAt).toEqual(new Date(2026, 9, 30, 8, 0));
    expect(summary!.kind).toBe("summary");
    expect(summary!.taskId).toBe("");
    expect(summary!.id).toMatch(/^dayform:summary:2026-10-30:[0-9a-f]+$/);
    expect(summary!.id.startsWith(SUMMARY_ID_PREFIX)).toBe(true);
  });
  test("several tasks: plural title and the earliest task first", () => {
    const tasks = [
      makeTask({ id: "b", title: "Lunch", start: "12:00" }),
      makeTask({ id: "a", title: "Gym", start: "07:15" }),
      makeTask({ id: "c", title: "Email", start: "12:00" }),
    ];
    const [summary] = planSummary(tasks, NOW, OPTIONS);
    expect(summary!.title).toBe("Today you have 3 tasks");
    expect(summary!.body).toBe("First: Gym · 07:15");
  });
  test("ties on the start time are broken by id so the result is stable", () => {
    const tasks = [makeTask({ id: "z", title: "Zed" }), makeTask({ id: "a", title: "Ay" })];
    expect(planSummary(tasks, NOW, OPTIONS)[0]!.body).toBe("First: Ay · 09:30");
    expect(planSummary([...tasks].reverse(), NOW, OPTIONS)[0]!.body).toBe("First: Ay · 09:30");
  });
  test("vietnamese text", () => {
    const [one] = planSummary([makeTask()], NOW, { ...OPTIONS, language: "vi" });
    expect(one!.title).toBe("Hôm nay bạn có 1 việc");
    expect(one!.body).toBe("Đầu tiên: Deep work · 09:30");
    const [many] = planSummary([makeTask(), makeTask({ id: "x" })], NOW, { ...OPTIONS, language: "vi" });
    expect(many!.title).toBe("Hôm nay bạn có 2 việc");
  });
  test("a title with placeholder-like text is kept literally", () => {
    const [summary] = planSummary([makeTask({ title: "{n} {time}" })], NOW, OPTIONS);
    expect(summary!.body).toBe("First: {n} {time} · 09:30");
  });
  test("hideTitles keeps the title out of the text entirely", () => {
    const [summary] = planSummary([makeTask()], NOW, { ...OPTIONS, hideTitles: true });
    expect(`${summary!.title} ${summary!.body}`).not.toContain("Deep work");
    expect(summary!.body).toBe("First task at 09:30");
    const [vi] = planSummary([makeTask()], NOW, { ...OPTIONS, hideTitles: true, language: "vi" });
    expect(vi!.body).toBe("Việc đầu tiên lúc 09:30");
  });
  test("hideTitles defaults to false", () => {
    const [summary] = planSummary([makeTask()], NOW, { time: "08:00", language: "en" });
    expect(summary!.body).toContain("Deep work");
  });
  test("the id changes with the content and the hideTitles toggle", () => {
    const [a] = planSummary([makeTask()], NOW, OPTIONS);
    const [b] = planSummary([makeTask(), makeTask({ id: "x" })], NOW, OPTIONS);
    const [c] = planSummary([makeTask()], NOW, { ...OPTIONS, hideTitles: true });
    expect(new Set([a!.id, b!.id, c!.id]).size).toBe(3);
  });
});

describe("planSummary counting", () => {
  test("only scheduled, not-done tasks of that day are counted", () => {
    const tasks = [
      makeTask({ id: "done", status: "done" }),
      makeTask({ id: "backlog", date: null, start: null }),
      makeTask({ id: "nostart", start: null }),
      makeTask({ id: "other-day", date: "2026-10-31", title: "Other" }),
      makeTask({ id: "live", title: "Live", status: "in_progress" }),
    ];
    const plan = planSummary(tasks, NOW, OPTIONS);
    expect(plan.find((s) => s.id.includes("2026-10-30"))!.title).toBe("Today you have 1 task");
    expect(plan.find((s) => s.id.includes("2026-10-31"))!.title).toBe("Today you have 1 task");
  });
  test("a day without tasks gets no summary", () => {
    const plan = planSummary([makeTask({ date: "2026-11-01" })], NOW, OPTIONS);
    expect(plan.map((s) => s.fireAt)).toEqual([new Date(2026, 10, 1, 8, 0)]);
  });
  test("nothing at all yields an empty plan", () => {
    expect(planSummary([], NOW, OPTIONS)).toEqual([]);
  });
});

describe("planSummary schedule window", () => {
  const everyDay = (from: string) => Array.from({ length: 12 }, (_, i) => {
    const day = new Date(2026, 9, 29 + i);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return makeTask({ id: `${from}-${i}`, date });
  });
  test("a time still ahead today includes today and covers 7 days", () => {
    const plan = planSummary(everyDay("a"), NOW, { ...OPTIONS, time: "18:00" });
    expect(plan).toHaveLength(SUMMARY_DAYS);
    expect(plan[0]!.fireAt).toEqual(new Date(2026, 9, 29, 18, 0));
    expect(plan[6]!.fireAt).toEqual(new Date(2026, 10, 4, 18, 0));
  });
  test("a time already past today starts tomorrow and still covers 7 days", () => {
    const plan = planSummary(everyDay("a"), NOW, OPTIONS);
    expect(plan).toHaveLength(SUMMARY_DAYS);
    expect(plan[0]!.fireAt).toEqual(new Date(2026, 9, 30, 8, 0));
    expect(plan[6]!.fireAt).toEqual(new Date(2026, 10, 5, 8, 0));
  });
  test("a fire time equal to now is not scheduled", () => {
    const plan = planSummary(everyDay("a"), new Date(2026, 9, 29, 8, 0), OPTIONS);
    expect(plan[0]!.fireAt).toEqual(new Date(2026, 9, 30, 8, 0));
  });
  test("results are sorted by fire time", () => {
    const plan = planSummary(everyDay("a"), NOW, OPTIONS);
    const times = plan.map((s) => s.fireAt.getTime());
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });
  test.each(["", "8:00", "24:00", "08:60", "nope"])("an invalid time %p yields nothing", (time) => {
    expect(planSummary(everyDay("a"), NOW, { ...OPTIONS, time })).toEqual([]);
  });
  test("does not mutate its inputs", () => {
    const tasks = [makeTask({ id: "b", start: "10:00" }), makeTask({ id: "a", start: "09:00" })];
    const snapshot = JSON.stringify(tasks);
    planSummary(tasks, NOW, OPTIONS);
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });
});
