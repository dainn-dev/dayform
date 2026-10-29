import { describe, expect, test } from "bun:test";
import { MIN_TYPED_LENGTH, normalizeTitle, similarTitles, taskTitleKey } from "./habits-title";
import type { Task } from "./planner";

const task = (title: string, extra: Partial<Task> = {}): Task => ({
  id: title, title, date: "2026-10-20", start: "09:00", duration: 30, status: "done", category: "Work",
  notes: "", createdAt: "2026-10-01T00:00:00.000Z", ...extra,
});

describe("normalizeTitle", () => {
  test("lowercases, folds accents and the Vietnamese d-stroke", () => {
    expect(normalizeTitle("Đi CHỢ")).toBe("di cho");
    expect(normalizeTitle("Công việc")).toBe("cong viec");
  });

  test("collapses whitespace and trims", () => {
    expect(normalizeTitle("  Morning \t  run \n")).toBe("morning run");
  });

  test("strips punctuation and emoji at the edges but keeps inner characters", () => {
    expect(normalizeTitle("🏃 Run 5k!! 🏃")).toBe("run 5k");
    expect(normalizeTitle("--Read: chapter 1.--")).toBe("read: chapter 1");
  });

  test("returns an empty string for empty or symbol-only titles", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle("  !!! ")).toBe("");
    expect(normalizeTitle("🏃🏃")).toBe("");
  });
});

describe("taskTitleKey", () => {
  test("is the normalized title and is stable for the same task object", () => {
    const t = task("  Đi Bộ! ");
    expect(taskTitleKey(t)).toBe("di bo");
    expect(taskTitleKey(t)).toBe("di bo");
  });
});

describe("similarTitles", () => {
  const history = [
    task("Morning run"), task("Run errands"), task("Công việc"), task("Weekly report"),
    task("Gym"), task("Gym session"), task(""), task("Reading"),
  ];
  const titles = (typed: string) => similarTitles(typed, history).map(t => t.title);

  test("needs at least the minimum number of characters", () => {
    expect(MIN_TYPED_LENGTH).toBe(3);
    expect(titles("")).toEqual([]);
    expect(titles("gy")).toEqual([]);
    expect(titles("!!!")).toEqual([]);
    expect(titles("  g ")).toEqual([]);
  });

  test("matches the exact normalized title and titles starting with the typed text", () => {
    expect(titles("GYM")).toEqual(["Gym", "Gym session"]);
    expect(titles("read")).toEqual(["Reading"]);
    expect(titles("gym!")).toEqual(["Gym", "Gym session"]);
  });

  test("is accent-insensitive in both directions", () => {
    expect(titles("cong")).toEqual(["Công việc"]);
    expect(similarTitles("Đi chợ", [task("di cho"), task("Đi chợ sáng")]).map(t => t.title)).toEqual(["di cho", "Đi chợ sáng"]);
  });

  test("a single word only matches the start of the title", () => {
    expect(titles("port")).toEqual([]);
    expect(titles("run")).toEqual(["Run errands"]);
  });

  test("several typed words match as word prefixes in any order", () => {
    expect(titles("rep week")).toEqual(["Weekly report"]);
    expect(titles("run morn")).toEqual(["Morning run"]);
    expect(titles("run xyz")).toEqual([]);
  });

  test("never matches an empty history title", () => {
    expect(similarTitles("abc", [task("")])).toEqual([]);
  });
});
