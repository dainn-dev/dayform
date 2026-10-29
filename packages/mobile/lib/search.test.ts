import { describe, expect, test } from "bun:test";
import { filterTasks, highlightRanges, matchesQuery, normalizeText, splitHighlight } from "./search";
import type { Task } from "./planner";

let counter = 0;
function task(patch: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `s${counter}`, title: `Task ${counter}`, date: null, start: null, duration: 30,
    status: "todo", category: "Focus", notes: "", createdAt: "2026-01-01T00:00:00.000Z", ...patch,
  };
}
const slice = (text: string, range: { start: number; end: number }) => text.slice(range.start, range.end);

describe("normalizeText", () => {
  test("lowercases and strips Vietnamese diacritics", () => {
    expect(normalizeText("Công Việc")).toBe("cong viec");
    expect(normalizeText("Thứ Hai, Ngày Tốt")).toBe("thu hai, ngay tot");
  });

  test("handles the letter d with stroke in both cases", () => {
    expect(normalizeText("Đi chợ")).toBe("di cho");
    expect(normalizeText("đường")).toBe("duong");
  });

  test("treats precomposed and decomposed input the same", () => {
    const decomposed = "Cô̂ng";
    expect(normalizeText(decomposed)).toBe("cong");
    expect(normalizeText("Công")).toBe("cong");
  });

  test("collapses and trims whitespace", () => {
    expect(normalizeText("  a \t\n  b   ")).toBe("a b");
    expect(normalizeText("   ")).toBe("");
    expect(normalizeText("")).toBe("");
  });

  test("lowercases characters whose lowercase form is longer", () => {
    expect(normalizeText("İstanbul")).toBe("istanbul");
  });

  test("keeps astral characters intact", () => {
    expect(normalizeText("Run 🏃 fast")).toBe("run 🏃 fast");
  });
});

describe("matchesQuery", () => {
  test("an empty or blank query matches everything", () => {
    expect(matchesQuery(task(), "")).toBe(true);
    expect(matchesQuery(task(), "   ")).toBe(true);
  });

  test("matches title or notes, ignoring case and accents in either direction", () => {
    const t = task({ title: "Họp công ty", notes: "Chuẩn bị báo cáo" });
    expect(matchesQuery(t, "cong")).toBe(true);
    expect(matchesQuery(t, "CÔNG")).toBe(true);
    expect(matchesQuery(t, "bao cao")).toBe(true);
    expect(matchesQuery(task({ title: "Cong viec" }), "công")).toBe(true);
    expect(matchesQuery(task({ title: "Di cho" }), "Đi")).toBe(true);
  });

  test("every term must be present (AND), in any order, across title and notes", () => {
    const t = task({ title: "Write report", notes: "for the Monday meeting" });
    expect(matchesQuery(t, "report monday")).toBe(true);
    expect(matchesQuery(t, "monday report")).toBe(true);
    expect(matchesQuery(t, "report friday")).toBe(false);
  });

  test("a term cannot span the boundary between title and notes", () => {
    expect(matchesQuery(task({ title: "alpha", notes: "beta" }), "alphabeta")).toBe(false);
  });

  test("tasks without matches are rejected", () => {
    expect(matchesQuery(task({ title: "Gym", notes: "" }), "dentist")).toBe(false);
  });
});

describe("filterTasks", () => {
  const tasks = [
    task({ title: "Gym", category: "Wellness", status: "todo" }),
    task({ title: "Họp nhóm", category: "Work", status: "done" }),
    task({ title: "Plan trip", category: "Personal", status: "in_progress" }),
    task({ title: "Deep work", category: "Focus", status: "todo", notes: "công trình" }),
  ];
  const all = { query: "", categories: [] as never[], status: "all" as const };

  test("no constraints returns every task in order", () => {
    expect(filterTasks(tasks, all)).toEqual(tasks);
  });

  test("onlyIds keeps just those tasks, in list order", () => {
    const ids = [tasks[3].id, tasks[0].id];
    expect(filterTasks(tasks, { ...all, onlyIds: ids })).toEqual([tasks[0], tasks[3]]);
  });

  test("an empty onlyIds matches nothing, an absent one matches everything", () => {
    expect(filterTasks(tasks, { ...all, onlyIds: [] })).toEqual([]);
    expect(filterTasks(tasks, { ...all, onlyIds: undefined })).toEqual(tasks);
  });

  test("onlyIds combines with the other constraints", () => {
    const ids = tasks.map(item => item.id);
    expect(filterTasks(tasks, { query: "work", categories: [], status: "all", onlyIds: ids })).toEqual([tasks[3]]);
    expect(filterTasks(tasks, { query: "work", categories: [], status: "done", onlyIds: [tasks[0].id] })).toEqual([]);
  });

  test("status filter keeps the explore semantics: active means not done", () => {
    expect(filterTasks(tasks, { ...all, status: "active" }).map(t => t.title)).toEqual(["Gym", "Plan trip", "Deep work"]);
    expect(filterTasks(tasks, { ...all, status: "done" }).map(t => t.title)).toEqual(["Họp nhóm"]);
  });

  test("categories are a multi-select; empty means all", () => {
    expect(filterTasks(tasks, { ...all, categories: ["Work", "Wellness"] }).map(t => t.title)).toEqual(["Gym", "Họp nhóm"]);
    expect(filterTasks(tasks, { ...all, categories: ["Personal"] }).map(t => t.title)).toEqual(["Plan trip"]);
  });

  test("query matches diacritic-insensitively and combines with the other filters", () => {
    expect(filterTasks(tasks, { ...all, query: "hop" }).map(t => t.title)).toEqual(["Họp nhóm"]);
    expect(filterTasks(tasks, { ...all, query: "cong" }).map(t => t.title)).toEqual(["Deep work"]);
    expect(filterTasks(tasks, { query: "work", categories: ["Focus"], status: "active" }).map(t => t.title)).toEqual(["Deep work"]);
    expect(filterTasks(tasks, { query: "work", categories: ["Focus"], status: "done" })).toEqual([]);
  });

  test("does not mutate its input", () => {
    const copy = [...tasks];
    filterTasks(tasks, { ...all, query: "gym" });
    expect(tasks).toEqual(copy);
  });

  test("filters 5,000 tasks correctly, also on a repeated query", () => {
    const many = Array.from({ length: 5000 }, (_, i) => task({ id: `m${i}`, title: `Công việc số ${i}`, notes: "ghi chú dài ".repeat(5) }));
    const options = { query: "viec 4999", categories: [], status: "all" } as const;
    expect(filterTasks(many, options).map(t => t.id)).toEqual(["m4999"]);
    expect(filterTasks(many, options).map(t => t.id)).toEqual(["m4999"]);
    const expected = many.filter((_, i) => String(i).includes("12")).length;
    expect(filterTasks(many, { ...options, query: "viec 12" })).toHaveLength(expected);
  });

  test("an edited task (a new object) is matched on its new text, not a cached old one", () => {
    const original = task({ id: "e1", title: "Gym", notes: "" });
    const edited = { ...original, title: "Đọc sách" };
    const options = { categories: [], status: "all" } as const;
    expect(filterTasks([original], { ...options, query: "gym" })).toEqual([original]);
    expect(filterTasks([edited], { ...options, query: "gym" })).toEqual([]);
    expect(filterTasks([edited], { ...options, query: "doc sach" })).toEqual([edited]);
    expect(filterTasks([original], { ...options, query: "gym" })).toEqual([original]);
  });
});

describe("highlightRanges", () => {
  test("returns nothing for an empty query or no match", () => {
    expect(highlightRanges("Hello", "")).toEqual([]);
    expect(highlightRanges("Hello", "   ")).toEqual([]);
    expect(highlightRanges("Hello", "zzz")).toEqual([]);
    expect(highlightRanges("", "a")).toEqual([]);
  });

  test("maps matches back to original indices, case-insensitively", () => {
    const ranges = highlightRanges("Write the Report", "report");
    expect(ranges).toEqual([{ start: 10, end: 16 }]);
  });

  test("finds every occurrence of a term", () => {
    const text = "aba bab aba";
    expect(highlightRanges(text, "ab").map(r => slice(text, r))).toEqual(["ab", "ab", "ab"]);
  });

  test("an unaccented query highlights the accented original text", () => {
    const text = "Họp công ty";
    const ranges = highlightRanges(text, "cong");
    expect(ranges).toHaveLength(1);
    expect(slice(text, ranges[0])).toBe("công");
  });

  test("an accented query highlights unaccented text", () => {
    const text = "cong viec";
    expect(highlightRanges(text, "CÔNG").map(r => slice(text, r))).toEqual(["cong"]);
  });

  test("handles d with stroke", () => {
    const text = "Đi chợ đường";
    expect(highlightRanges(text, "di").map(r => slice(text, r))).toEqual(["Đi"]);
    expect(highlightRanges(text, "duong").map(r => slice(text, r))).toEqual(["đường"]);
    expect(highlightRanges(text, "Đ").map(r => slice(text, r))).toEqual(["Đ", "đ"]);
  });

  test("covers combining marks of a decomposed original", () => {
    const text = "x Cô̂ng y";
    const ranges = highlightRanges(text, "cong");
    expect(ranges).toHaveLength(1);
    expect(slice(text, ranges[0])).toBe("Cô̂ng");
    const trailing = "Cô";
    expect(highlightRanges(trailing, "co").map(r => slice(trailing, r))).toEqual(["Cô"]);
  });

  test("offsets stay correct after decomposed characters, extra spaces and astral characters", () => {
    const text = "  🏃  Tập   gym";
    const ranges = highlightRanges(text, "gym");
    expect(ranges).toEqual([{ start: text.indexOf("gym"), end: text.indexOf("gym") + 3 }]);
  });

  test("multiple terms are highlighted and overlapping ranges are merged", () => {
    const text = "Công việc quan trọng";
    expect(highlightRanges(text, "viec cong").map(r => slice(text, r))).toEqual(["Công", "việc"]);
    expect(highlightRanges("abcdef", "abc cde").map(r => slice("abcdef", r))).toEqual(["abcde"]);
    expect(highlightRanges("abcd", "ab bc cd")).toEqual([{ start: 0, end: 4 }]);
  });

  test("a mark at the very start of the text is ignored", () => {
    const text = "̂ab";
    expect(highlightRanges(text, "ab").map(r => slice(text, r))).toEqual(["ab"]);
  });

  test("a match can start inside a character that lowercases to two code units", () => {
    const text = "İstanbul";
    expect(highlightRanges(text, "i").map(r => slice(text, r))).toEqual(["İ"]);
  });
});

describe("splitHighlight", () => {
  test("returns the whole text unhighlighted when nothing matches", () => {
    expect(splitHighlight("Hello", "zzz")).toEqual([{ text: "Hello", highlighted: false }]);
    expect(splitHighlight("Hello", "")).toEqual([{ text: "Hello", highlighted: false }]);
    expect(splitHighlight("", "a")).toEqual([{ text: "", highlighted: false }]);
  });

  test("alternates plain and highlighted segments that rebuild the original text", () => {
    const segments = splitHighlight("Họp công ty", "cong");
    expect(segments).toEqual([
      { text: "Họp ", highlighted: false },
      { text: "công", highlighted: true },
      { text: " ty", highlighted: false },
    ]);
  });

  test("handles matches at the start and end without empty segments", () => {
    expect(splitHighlight("gym", "gym")).toEqual([{ text: "gym", highlighted: true }]);
    expect(splitHighlight("a gym", "gym")).toEqual([{ text: "a ", highlighted: false }, { text: "gym", highlighted: true }]);
  });
});
