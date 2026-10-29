import { describe, test, expect } from "bun:test";
import { DEFAULT_UPDATE_STATE, UPDATE_STORAGE_KEY, loadUpdateState, saveUpdateState } from "./update-state";
import type { KeyValueStorage } from "./task-storage";

function memoryStorage(initial: Record<string, string> = {}, failRead = false, failWrite = false) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const storage: KeyValueStorage = {
    getItem: async key => { if (failRead) throw new Error("read"); return data.get(key) ?? null; },
    setItem: async (key, value) => { if (failWrite) throw new Error("write"); data.set(key, value); writes.push([key, value]); },
  };
  return { storage, writes, data };
}

describe("loadUpdateState", () => {
  test("uses the documented key and defaults", () => {
    expect(UPDATE_STORAGE_KEY).toBe("dayform.update.v1");
    expect(DEFAULT_UPDATE_STATE).toEqual({ auto: true, lastCheckAt: null, skipped: null, retryAt: null });
  });
  test("missing value gives defaults", async () => {
    expect(await loadUpdateState(memoryStorage().storage)).toEqual(DEFAULT_UPDATE_STATE);
  });
  test("reads a saved state", async () => {
    const { storage } = memoryStorage({ [UPDATE_STORAGE_KEY]: JSON.stringify({ auto: false, lastCheckAt: 123, skipped: "1.0.9", retryAt: 456 }) });
    expect(await loadUpdateState(storage)).toEqual({ auto: false, lastCheckAt: 123, skipped: "1.0.9", retryAt: 456 });
  });
  test("stored state from before retryAt existed loads with retryAt null", async () => {
    const raw = JSON.stringify({ auto: false, lastCheckAt: 123, skipped: "1.0.9" });
    expect(await loadUpdateState(memoryStorage({ [UPDATE_STORAGE_KEY]: raw }).storage)).toEqual({ auto: false, lastCheckAt: 123, skipped: "1.0.9", retryAt: null });
  });
  test.each(["x", -1, true, {}])("an invalid retryAt %p becomes null without losing other fields", async bad => {
    const raw = JSON.stringify({ auto: false, lastCheckAt: 5, skipped: null, retryAt: bad });
    expect(await loadUpdateState(memoryStorage({ [UPDATE_STORAGE_KEY]: raw }).storage)).toEqual({ auto: false, lastCheckAt: 5, skipped: null, retryAt: null });
  });
  test.each(["not json", "null", "[]", "5", '"x"'])("unusable payload %p gives defaults", async raw => {
    expect(await loadUpdateState(memoryStorage({ [UPDATE_STORAGE_KEY]: raw }).storage)).toEqual(DEFAULT_UPDATE_STATE);
  });
  test("recovers each field independently", async () => {
    const raw = JSON.stringify({ auto: "yes", lastCheckAt: -5, skipped: 7 });
    expect(await loadUpdateState(memoryStorage({ [UPDATE_STORAGE_KEY]: raw }).storage)).toEqual(DEFAULT_UPDATE_STATE);
    const mixed = JSON.stringify({ auto: false, lastCheckAt: "x", skipped: "v".repeat(100), retryAt: "y" });
    expect(await loadUpdateState(memoryStorage({ [UPDATE_STORAGE_KEY]: mixed }).storage)).toEqual({ auto: false, lastCheckAt: null, skipped: null, retryAt: null });
  });
  test("a read error gives defaults and never writes", async () => {
    const { storage, writes } = memoryStorage({}, true);
    expect(await loadUpdateState(storage)).toEqual(DEFAULT_UPDATE_STATE);
    expect(writes).toEqual([]);
  });
  test("a defaults load does not write either", async () => {
    const { storage, writes } = memoryStorage();
    await loadUpdateState(storage);
    expect(writes).toEqual([]);
  });
});

describe("saveUpdateState", () => {
  test("round-trips", async () => {
    const { storage, writes } = memoryStorage();
    const state = { auto: false, lastCheckAt: 42, skipped: "1.2.3", retryAt: 99 };
    expect(await saveUpdateState(storage, state)).toEqual({ ok: true });
    expect(writes[0]?.[0]).toBe(UPDATE_STORAGE_KEY);
    expect(await loadUpdateState(storage)).toEqual(state);
  });
  test("a write error is a typed failure", async () => {
    expect(await saveUpdateState(memoryStorage({}, false, true).storage, DEFAULT_UPDATE_STATE)).toEqual({ ok: false, reason: "write-failed" });
  });
});
