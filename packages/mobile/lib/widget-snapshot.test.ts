import { describe, test, expect } from "bun:test";
import {
  MAX_SNAPSHOT_BYTES,
  buildWidgetSnapshot,
  snapshotsEqual,
  utf8ByteLength,
  type BuildOptions,
} from "./widget-snapshot";
import { vi } from "./i18n/widget";
import type { Task } from "./planner";

const NOW = new Date(2026, 9, 29, 8, 15); // Thu 29 Oct 2026, local
const OPTIONS: BuildOptions = { now: NOW, showTitles: true, locale: "en" };

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Deep work",
    date: "2026-10-29",
    start: "09:30",
    duration: 45,
    status: "todo",
    category: "Focus",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildWidgetSnapshot filtering", () => {
  test("ignores backlog tasks (no date or no start)", () => {
    const { snapshot } = buildWidgetSnapshot(
      [makeTask({ id: "a", date: null }), makeTask({ id: "b", start: null }), makeTask({ id: "c", date: null, start: null })],
      OPTIONS,
    );
    expect(snapshot.days).toEqual({});
  });

  test("keeps today through today+days-1 and drops the past and later days", () => {
    const tasks = [
      makeTask({ id: "past", date: "2026-10-28" }),
      makeTask({ id: "today", date: "2026-10-29" }),
      makeTask({ id: "last", date: "2026-11-11" }), // today + 13
      makeTask({ id: "beyond", date: "2026-11-12" }), // today + 14
    ];
    const { snapshot } = buildWidgetSnapshot(tasks, OPTIONS);
    expect(Object.keys(snapshot.days)).toEqual(["2026-10-29", "2026-11-11"]);
  });

  test("honours a custom day window", () => {
    const tasks = [makeTask({ id: "a", date: "2026-10-30" }), makeTask({ id: "b", date: "2026-10-31" })];
    const { snapshot } = buildWidgetSnapshot(tasks, { ...OPTIONS, days: 2 });
    expect(Object.keys(snapshot.days)).toEqual(["2026-10-30"]);
  });

  test("skips tasks whose start is not HH:mm", () => {
    const { snapshot } = buildWidgetSnapshot([makeTask({ start: "9:30" })], OPTIONS);
    expect(snapshot.days).toEqual({});
  });

  test("uses local dates, never UTC", () => {
    const lateNight = new Date(2026, 9, 29, 23, 59);
    const { snapshot } = buildWidgetSnapshot([makeTask({ date: "2026-10-29" })], { ...OPTIONS, now: lateNight });
    expect(Object.keys(snapshot.days)).toEqual(["2026-10-29"]);
  });
});

describe("buildWidgetSnapshot content", () => {
  test("sorts items by start time and maps fields", () => {
    const tasks = [
      makeTask({ id: "b", title: "Later", start: "13:00", duration: 60, status: "done" }),
      makeTask({ id: "a", title: "Early", start: "08:00", duration: 20 }),
    ];
    const { snapshot } = buildWidgetSnapshot(tasks, OPTIONS);
    expect(snapshot.days["2026-10-29"]).toEqual({
      n: 2,
      done: 1,
      items: [
        { t: "Early", s: "08:00", d: 20, x: 0 },
        { t: "Later", s: "13:00", d: 60, x: 1 },
      ],
    });
  });

  test("breaks start-time ties by id so the order is stable", () => {
    const tasks = [makeTask({ id: "z", title: "Z" }), makeTask({ id: "a", title: "A" })];
    const { snapshot } = buildWidgetSnapshot(tasks, OPTIONS);
    expect(snapshot.days["2026-10-29"].items.map((i) => i.t)).toEqual(["A", "Z"]);
  });

  test("does not mutate or reorder the input", () => {
    const tasks = [makeTask({ id: "b", start: "13:00" }), makeTask({ id: "a", start: "08:00" })];
    const copy = tasks.map((t) => ({ ...t }));
    buildWidgetSnapshot(tasks, OPTIONS);
    expect(tasks).toEqual(copy);
  });

  test("hides titles when showTitles is false", () => {
    const { snapshot, json } = buildWidgetSnapshot([makeTask({ title: "Secret" })], { ...OPTIONS, showTitles: false });
    expect(snapshot.days["2026-10-29"].items[0].t).toBeNull();
    expect(json).not.toContain("Secret");
  });

  test("normalises whitespace and truncates titles to 60 characters", () => {
    const long = "x".repeat(100);
    const { snapshot } = buildWidgetSnapshot(
      [makeTask({ id: "a", title: long }), makeTask({ id: "b", title: "  two\nlines\t here  ", start: "10:00" })],
      OPTIONS,
    );
    const [first, second] = snapshot.days["2026-10-29"].items;
    expect(first.t).toBe(`${"x".repeat(59)}…`);
    expect(Array.from(first.t ?? "").length).toBe(60);
    expect(second.t).toBe("two lines here");
  });

  test("does not split a surrogate pair when truncating", () => {
    const title = "😀".repeat(70);
    const { snapshot } = buildWidgetSnapshot([makeTask({ title })], OPTIONS);
    expect(snapshot.days["2026-10-29"].items[0].t).toBe(`${"😀".repeat(59)}…`);
  });

  test("keeps a title of exactly 60 characters", () => {
    const title = "y".repeat(60);
    const { snapshot } = buildWidgetSnapshot([makeTask({ title })], OPTIONS);
    expect(snapshot.days["2026-10-29"].items[0].t).toBe(title);
  });

  test("caps items per day but keeps the scheduled and done totals", () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: `t${i}`, start: `0${i + 1}:00`, status: i < 2 ? "done" : "todo" }),
    );
    const { snapshot } = buildWidgetSnapshot(tasks, { ...OPTIONS, maxPerDay: 3 });
    const day = snapshot.days["2026-10-29"];
    expect(day.n).toBe(5);
    expect(day.done).toBe(2);
    expect(day.items.map((i) => i.s)).toEqual(["01:00", "02:00", "03:00"]);
  });

  test("sets version, generatedAt and locale", () => {
    const { snapshot } = buildWidgetSnapshot([], OPTIONS);
    expect(snapshot.version).toBe(1);
    expect(snapshot.generatedAt).toBe(NOW.getTime());
    expect(snapshot.locale).toBe("en");
    expect(snapshot.days).toEqual({});
  });

  test("json is the serialised snapshot", () => {
    const result = buildWidgetSnapshot([makeTask()], OPTIONS);
    expect(JSON.parse(result.json)).toEqual(result.snapshot);
  });
});

describe("buildWidgetSnapshot labels", () => {
  test("english labels", () => {
    const { snapshot } = buildWidgetSnapshot([], OPTIONS);
    expect(snapshot.labels).toEqual({
      empty: "Nothing planned today",
      more: "more",
      today: "Today",
      tasks: "tasks",
      task: "task",
    });
  });

  test("vietnamese labels come from the i18n dictionary", () => {
    const { snapshot } = buildWidgetSnapshot([], { ...OPTIONS, locale: "vi" });
    expect(snapshot.locale).toBe("vi");
    expect(snapshot.labels.today).toBe(vi["Today"]);
    expect(snapshot.labels.empty).toBe(vi["Nothing planned today"]);
    expect(snapshot.labels.more).toBe(vi["more"]);
    expect(snapshot.labels.tasks).toBe(vi["tasks"]);
    expect(snapshot.labels.task).toBe(vi["task"]);
  });

  test("every english label has a vietnamese translation", () => {
    for (const key of ["Nothing planned today", "more", "Today", "tasks", "task"]) {
      expect(typeof vi[key]).toBe("string");
      expect(vi[key].length).toBeGreaterThan(0);
    }
  });
});

describe("buildWidgetSnapshot size limit", () => {
  function manyTasks(days: number, perDay: number): Task[] {
    const out: Task[] = [];
    for (let d = 0; d < days; d++) {
      const date = `2026-${d < 3 ? "10-" + (29 + d) : "11-" + String(d - 2).padStart(2, "0")}`;
      for (let i = 0; i < perDay; i++) {
        out.push(makeTask({ id: `t${d}-${i}`, date, start: `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, title: "あ".repeat(60) }));
      }
    }
    return out;
  }

  test("is not truncated when small", () => {
    const result = buildWidgetSnapshot([makeTask()], OPTIONS);
    expect(result.truncated).toBe(false);
    expect(utf8ByteLength(result.json)).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
  });

  test("drops the farthest days first and keeps today", () => {
    const result = buildWidgetSnapshot(manyTasks(14, 40), { ...OPTIONS, maxPerDay: 40 });
    expect(result.truncated).toBe(true);
    expect(utf8ByteLength(result.json)).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
    const keys = Object.keys(result.snapshot.days);
    expect(keys[0]).toBe("2026-10-29");
    expect(keys.length).toBeLessThan(14);
    // Dropped days are the far ones: what remains is a prefix of the window.
    const expected = Array.from({ length: keys.length }, (_, i) => keys[i]);
    expect(keys).toEqual(expected);
    expect(keys[keys.length - 1] < "2026-11-11").toBe(true);
  });

  test("trims items of today when even one day is too big", () => {
    const tasks = Array.from({ length: 600 }, (_, i) =>
      makeTask({ id: `t${i}`, start: `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`, title: "あ".repeat(60) }),
    );
    const result = buildWidgetSnapshot(tasks, { ...OPTIONS, maxPerDay: 600 });
    expect(result.truncated).toBe(true);
    expect(utf8ByteLength(result.json)).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
    const day = result.snapshot.days["2026-10-29"];
    expect(day.n).toBe(600);
    expect(day.items.length).toBeGreaterThan(0);
    expect(day.items.length).toBeLessThan(600);
    expect(day.items[0].s).toBe("00:00");
  });
});

describe("utf8ByteLength", () => {
  test("counts ascii, two, three and four byte characters", () => {
    expect(utf8ByteLength("a")).toBe(1);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("あ")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("")).toBe(0);
  });
});

describe("snapshotsEqual", () => {
  test("ignores generatedAt", () => {
    const a = buildWidgetSnapshot([makeTask()], OPTIONS).snapshot;
    const b = buildWidgetSnapshot([makeTask()], { ...OPTIONS, now: new Date(2026, 9, 29, 9, 0) }).snapshot;
    expect(a.generatedAt).not.toBe(b.generatedAt);
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  test("detects a changed task, language or title visibility", () => {
    const base = buildWidgetSnapshot([makeTask()], OPTIONS).snapshot;
    expect(snapshotsEqual(base, buildWidgetSnapshot([makeTask({ status: "done" })], OPTIONS).snapshot)).toBe(false);
    expect(snapshotsEqual(base, buildWidgetSnapshot([makeTask()], { ...OPTIONS, locale: "vi" }).snapshot)).toBe(false);
    expect(snapshotsEqual(base, buildWidgetSnapshot([makeTask()], { ...OPTIONS, showTitles: false }).snapshot)).toBe(false);
  });

  test("carries the chosen pet, defaulting to the round cat that strolls", () => {
    const defaults = buildWidgetSnapshot([makeTask()], OPTIONS).snapshot;
    expect(defaults.pet).toBe("round-cat");
    expect(defaults.petWalks).toBe(true);
    const chosen = buildWidgetSnapshot([makeTask()], { ...OPTIONS, pet: "dog", petWalks: false }).snapshot;
    expect(chosen.pet).toBe("dog");
    expect(chosen.petWalks).toBe(false);
    expect(snapshotsEqual(defaults, chosen)).toBe(false);
    expect(snapshotsEqual(chosen, buildWidgetSnapshot([makeTask()], { ...OPTIONS, pet: "dog", petWalks: false }).snapshot)).toBe(true);
  });

  test("detects the day rolling over", () => {
    const today = buildWidgetSnapshot([makeTask()], OPTIONS).snapshot;
    const tomorrow = buildWidgetSnapshot([makeTask({ date: "2026-10-30" })], OPTIONS).snapshot;
    expect(snapshotsEqual(today, tomorrow)).toBe(false);
  });

  test("a missing previous snapshot is never equal", () => {
    const a = buildWidgetSnapshot([], OPTIONS).snapshot;
    expect(snapshotsEqual(null, a)).toBe(false);
    expect(snapshotsEqual(a, null)).toBe(false);
  });
});
