import { describe, test, expect } from "bun:test";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  mergeBackup,
  parseBackup,
  serializeBackup,
} from "./backup";
import { MAX_RECORDS } from "./task-storage";
import type { Task } from "./planner";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    date: "2026-03-02",
    start: "09:00",
    duration: 30,
    status: "todo",
    category: "Work",
    notes: "",
    createdAt: "2026-03-01T08:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date(2026, 2, 5, 23, 30);
const envelope = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, tasks: [], ...extra });

describe("serializeBackup", () => {
  test("writes the envelope with pretty JSON and an ISO exportedAt", () => {
    const text = serializeBackup([task("a")], NOW);
    const value = JSON.parse(text);
    expect(value.format).toBe("dayform-backup");
    expect(value.version).toBe(1);
    expect(value.exportedAt).toBe(NOW.toISOString());
    expect(value.tasks).toEqual([task("a")]);
    expect(text).toContain("\n  ");
  });

  test("does not mutate its input", () => {
    const tasks = [task("a"), task("b")];
    const snapshot = JSON.stringify(tasks);
    serializeBackup(tasks, NOW);
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });
});

describe("parseBackup", () => {
  test("round trips serialize -> parse, including optional fields", () => {
    const tasks = [
      task("a"),
      task("b", { date: null, start: null }),
      task("c", { remind: 15, seriesId: "s1", repeat: "weekly" }),
    ];
    expect(parseBackup(serializeBackup(tasks, NOW))).toEqual({ ok: true, tasks, rejected: 0 });
  });

  test("accepts a bare array of tasks (raw storage format)", () => {
    const tasks = [task("a"), task("b")];
    expect(parseBackup(JSON.stringify(tasks))).toEqual({ ok: true, tasks, rejected: 0 });
  });

  test("accepts an empty backup", () => {
    expect(parseBackup(envelope())).toEqual({ ok: true, tasks: [], rejected: 0 });
    expect(parseBackup("[]")).toEqual({ ok: true, tasks: [], rejected: 0 });
  });

  test.each(["", "{", "not json", "undefined"])("reports invalid-json for %p", text => {
    expect(parseBackup(text)).toEqual({ ok: false, reason: "invalid-json" });
  });

  test.each(["null", "5", '"text"', "true"])("reports wrong-format for JSON primitive %s", text => {
    expect(parseBackup(text)).toEqual({ ok: false, reason: "wrong-format" });
  });

  test("reports wrong-format for an object without or with another format", () => {
    expect(parseBackup("{}")).toEqual({ ok: false, reason: "wrong-format" });
    expect(parseBackup(JSON.stringify({ tasks: [], version: 1 }))).toEqual({ ok: false, reason: "wrong-format" });
    expect(parseBackup(envelope({ format: "other" }))).toEqual({ ok: false, reason: "wrong-format" });
  });

  test("reports wrong-format when tasks is not an array or version is not a positive integer", () => {
    expect(parseBackup(envelope({ tasks: {} }))).toEqual({ ok: false, reason: "wrong-format" });
    expect(parseBackup(envelope({ tasks: "x" }))).toEqual({ ok: false, reason: "wrong-format" });
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(parseBackup(envelope({ version }))).toEqual({ ok: false, reason: "wrong-format" });
    }
  });

  test("reports unsupported-version for a newer version", () => {
    expect(parseBackup(envelope({ version: BACKUP_VERSION + 1 }))).toEqual({
      ok: false,
      reason: "unsupported-version",
    });
  });

  test("reports too-large above MAX_RECORDS, accepts exactly MAX_RECORDS", () => {
    const filler = Array.from({ length: MAX_RECORDS + 1 }, (_, i) => ({ id: String(i) }));
    expect(parseBackup(JSON.stringify(filler))).toEqual({ ok: false, reason: "too-large" });
    expect(parseBackup(envelope({ tasks: filler }))).toEqual({ ok: false, reason: "too-large" });
    const atLimit = parseBackup(JSON.stringify(filler.slice(0, MAX_RECORDS)));
    expect(atLimit).toEqual({ ok: true, tasks: [], rejected: MAX_RECORDS });
  });

  test("counts invalid records as rejected and keeps valid ones", () => {
    const text = serializeBackup([task("a")], NOW).replace(
      '"tasks": [',
      '"tasks": [null, 7, {"id":"x"}, {"id":"bad","title":"t","date":"2026-02-30","start":"09:00","duration":30,"status":"todo","category":"Work","notes":"","createdAt":"z"},',
    );
    expect(parseBackup(text)).toEqual({ ok: true, tasks: [task("a")], rejected: 4 });
  });

  test("keeps the first of duplicate ids and counts the rest as rejected", () => {
    const first = task("a", { title: "first" });
    const second = task("a", { title: "second" });
    expect(parseBackup(JSON.stringify([first, task("b"), second]))).toEqual({
      ok: true,
      tasks: [first, task("b")],
      rejected: 1,
    });
  });

  test("strips unknown fields through the shared schema", () => {
    const result = parseBackup(JSON.stringify([{ ...task("a"), extra: 1 }]));
    expect(result).toEqual({ ok: true, tasks: [task("a")], rejected: 0 });
  });

  test("never throws on hostile input", () => {
    for (const text of ["[[[[", '{"format":"dayform-backup","version":1,"tasks":[[],{},null]}', "\u0000", "💥"]) {
      expect(() => parseBackup(text)).not.toThrow();
    }
  });
});

describe("mergeBackup", () => {
  test("replace returns the incoming tasks only, with counts versus the current ones", () => {
    const current = [task("a"), task("b", { title: "old" })];
    const incoming = [task("b", { title: "new" }), task("a"), task("c")];
    const result = mergeBackup(current, incoming, "replace");
    expect(result.tasks).toEqual(incoming);
    expect(result).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
  });

  test("merge keeps existing order, updates differing records, appends new ones", () => {
    const current = [task("a"), task("b"), task("z")];
    const incoming = [task("c"), task("b", { title: "changed" }), task("a"), task("d")];
    const result = mergeBackup(current, incoming, "merge");
    expect(result.tasks.map(t => t.id)).toEqual(["a", "b", "z", "c", "d"]);
    expect(result.tasks[1].title).toBe("changed");
    expect(result).toMatchObject({ added: 2, updated: 1, unchanged: 1 });
  });

  test("merge into an empty list adds everything", () => {
    const incoming = [task("a"), task("b")];
    expect(mergeBackup([], incoming, "merge")).toEqual({ tasks: incoming, added: 2, updated: 0, unchanged: 0 });
  });

  test("merge with an empty backup keeps everything unchanged", () => {
    const current = [task("a")];
    expect(mergeBackup(current, [], "merge")).toEqual({ tasks: current, added: 0, updated: 0, unchanged: 0 });
  });

  test("replace with an empty backup empties the list", () => {
    expect(mergeBackup([task("a")], [], "replace")).toEqual({ tasks: [], added: 0, updated: 0, unchanged: 0 });
  });

  test("treats missing and null optional fields as identical", () => {
    const current = [task("a")];
    const incoming = [task("a", { remind: null, seriesId: null, repeat: null })];
    expect(mergeBackup(current, incoming, "merge")).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
  });

  test("detects a difference in an optional field", () => {
    const result = mergeBackup([task("a")], [task("a", { remind: 5 })], "merge");
    expect(result).toMatchObject({ updated: 1, unchanged: 0 });
    expect(result.tasks[0].remind).toBe(5);
  });

  test("duplicate ids inside the incoming list keep the first", () => {
    const result = mergeBackup([], [task("a", { title: "one" }), task("a", { title: "two" })], "merge");
    expect(result.tasks.map(t => t.title)).toEqual(["one"]);
    expect(result.added).toBe(1);
  });

  test("is pure: inputs are not mutated", () => {
    const current = [task("a"), task("b")];
    const incoming = [task("a", { title: "x" }), task("c")];
    const before = JSON.stringify([current, incoming]);
    const result = mergeBackup(current, incoming, "merge");
    expect(JSON.stringify([current, incoming])).toBe(before);
    expect(result.tasks).not.toBe(current);
    expect(mergeBackup(current, incoming, "merge")).toEqual(result);
  });
});

describe("backupFileName", () => {
  test("uses the local date parts, zero padded", () => {
    expect(backupFileName(new Date(2026, 0, 5, 0, 5))).toBe("dayform-backup-2026-01-05.json");
    expect(backupFileName(new Date(2026, 11, 31, 23, 59, 59))).toBe("dayform-backup-2026-12-31.json");
  });
});
