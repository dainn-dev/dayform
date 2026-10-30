import { describe, expect, test } from "bun:test";
import { parseBackup, serializeBackup } from "./backup";
import { SPECIAL_DAYS_NOT_RESTORED, runImport, withSpecialDaysNote, type ImportMutate } from "./backup-flow";
import { previewRecoveryItem, restoreRecoveryItem } from "./recovery";
import { snapshotKey, takeSnapshot, type SnapshotStorage } from "./snapshots";
import { seedTasks } from "./planner";
import type { SpecialDay, SpecialDaysState } from "./special-days";

const [oneTask] = seedTasks();

const NOW = new Date(2026, 9, 30, 12, 0);
const linh: SpecialDay = { id: "s_aaaaaaaa", title: "Linh", kind: "birthday", calendar: "solar", month: 3, day: 15, startYear: 1995, remind: "same-day" };
const state: SpecialDaysState = { items: [linh] };

describe("backup file", () => {
  test("a backup carries the special days and reads them back", () => {
    const parsed = parseBackup(serializeBackup([], NOW, { specialDays: state }));
    expect(parsed.ok && parsed.specialDays).toEqual(state);
  });

  test("no special days means no field in the file", () => {
    expect(JSON.parse(serializeBackup([], NOW, { specialDays: { items: [] } })).specialDays).toBeUndefined();
    expect(JSON.parse(serializeBackup([], NOW)).specialDays).toBeUndefined();
  });

  test("a file from before special days existed has none", () => {
    const parsed = parseBackup(serializeBackup([], NOW));
    expect(parsed.ok && parsed.specialDays).toBeUndefined();
  });

  test("bad records in the file are dropped, good ones kept", () => {
    const text = JSON.stringify({ format: "dayform-backup", version: 1, tasks: [], specialDays: { items: [linh, { id: "x" }] } });
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.specialDays).toEqual(state);
  });
});

describe("import", () => {
  const mutate: ImportMutate = async update => { update([]); return true; };
  const target = (apply: (incoming: SpecialDaysState, mode: "merge" | "replace") => Promise<{ ok: boolean }>) => ({
    storage: { setItem: async () => undefined }, now: NOW, importSpecialDays: apply,
  });

  test("applies the file's special days after the tasks, in the same mode", async () => {
    const seen: Array<[SpecialDaysState, string]> = [];
    const outcome = await runImport(mutate, { tasks: [oneTask], rejected: 0, specialDays: state }, "merge", target(async (incoming, mode) => { seen.push([incoming, mode]); return { ok: true }; }));
    expect(outcome.ok && outcome.specialDays).toBe("applied");
    expect(seen).toEqual([[state, "merge"]]);
  });

  test("says when they could not be applied, and the tasks stay imported", async () => {
    const outcome = await runImport(mutate, { tasks: [oneTask], rejected: 0, specialDays: state }, "merge", target(async () => ({ ok: false })));
    expect(outcome.ok && outcome.specialDays).toBe("failed");
  });

  test("a throwing apply counts as failed", async () => {
    const outcome = await runImport(mutate, { tasks: [oneTask], rejected: 0, specialDays: state }, "merge", target(async () => { throw new Error("boom"); }));
    expect(outcome.ok && outcome.specialDays).toBe("failed");
  });

  test("a file without special days leaves them alone", async () => {
    let called = false;
    const outcome = await runImport(mutate, { tasks: [oneTask], rejected: 0 }, "merge", target(async () => { called = true; return { ok: true }; }));
    expect(called).toBe(false);
    expect(outcome.ok && outcome.specialDays).toBeUndefined();
  });

  test("a file with special days and no task applies them alone", async () => {
    const seen: SpecialDaysState[] = [];
    const outcome = await runImport(mutate, { tasks: [], rejected: 0, specialDays: state }, "merge", target(async incoming => { seen.push(incoming); return { ok: true }; }));
    expect(outcome).toMatchObject({ ok: true, specialDays: "applied", specialDaysOnly: true });
    expect(seen).toEqual([state]);
  });

  test("a replace of special days alone first saves the current ones as a safety copy", async () => {
    const writes: string[] = [];
    const outcome = await runImport(mutate, { tasks: [], rejected: 0, specialDays: { items: [] } }, "replace", {
      storage: { setItem: async (_key: string, value: string) => { writes.push(value); } }, now: NOW, specialDays: state,
      importSpecialDays: async () => ({ ok: true }),
    });
    expect(outcome.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]).specialDays).toEqual(state);
  });

  test("a failed safety copy refuses the replace and changes nothing", async () => {
    let applied = false;
    const outcome = await runImport(mutate, { tasks: [], rejected: 0, specialDays: { items: [] } }, "replace", {
      storage: { setItem: async () => { throw new Error("full"); } }, now: NOW, specialDays: state,
      importSpecialDays: async () => { applied = true; return { ok: true }; },
    });
    expect(outcome).toEqual({ ok: false, reason: "safety-copy-failed" });
    expect(applied).toBe(false);
  });

  test("a failed apply of special days alone is a failed save", async () => {
    const outcome = await runImport(mutate, { tasks: [], rejected: 0, specialDays: state }, "merge", target(async () => ({ ok: false })));
    expect(outcome).toEqual({ ok: false, reason: "save-failed" });
  });

  test("the note is added only for a failure", () => {
    const parts = [{ key: "1 task imported" }];
    expect(withSpecialDaysNote(parts, { specialDays: "failed" })).toEqual([...parts, { key: SPECIAL_DAYS_NOT_RESTORED }]);
    expect(withSpecialDaysNote(parts, { specialDays: "applied" })).toEqual(parts);
    expect(withSpecialDaysNote(parts, {})).toEqual(parts);
  });
});

function fakeSnapshots() {
  const data = new Map<string, string>();
  const storage: SnapshotStorage & { getItem(key: string): Promise<string | null> } = {
    getAllKeys: async () => [...data.keys()],
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); },
    getItem: async key => data.get(key) ?? null,
  };
  return { data, storage };
}

describe("snapshots and recovery", () => {
  test("a snapshot keeps the special days, even when there are no tasks", async () => {
    const { data, storage } = fakeSnapshots();
    const result = await takeSnapshot(storage, [], NOW, undefined, undefined, state);
    expect(result.kind).toBe("written");
    const text = data.get(snapshotKey("2026-10-30"));
    expect(text && JSON.parse(text).specialDays).toEqual(state);
  });

  test("with neither tasks nor special days nothing is written", async () => {
    const { storage } = fakeSnapshots();
    expect((await takeSnapshot(storage, [], NOW, undefined, undefined, { items: [] })).kind).toBe("skipped");
  });

  test("a recovery copy previews its special days", async () => {
    const { storage } = fakeSnapshots();
    await takeSnapshot(storage, [], NOW, undefined, undefined, state);
    const preview = await previewRecoveryItem(storage, snapshotKey("2026-10-30"));
    expect(preview.ok && preview.specialDays).toEqual(state);
  });

  test("restoring a copy hands its special days to the importer", async () => {
    const { storage } = fakeSnapshots();
    await takeSnapshot(storage, [], NOW, undefined, undefined, state);
    let received = null as SpecialDaysState | null;
    const outcome = await restoreRecoveryItem(storage, async update => { update([]); return true; }, snapshotKey("2026-10-30"), "merge", NOW, {
      importSpecialDays: async incoming => { received = incoming; return { ok: true }; },
    });
    expect(outcome.ok && outcome.specialDays).toBe("applied");
    expect(received).toEqual(state);
  });
});
