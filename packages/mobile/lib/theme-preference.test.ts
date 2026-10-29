import { describe, test, expect } from "bun:test";
import {
  THEME_STORAGE_KEY,
  loadThemePreference,
  parseThemePreference,
  resolveScheme,
  saveThemePreference,
} from "./theme-preference";
import type { KeyValueStorage } from "./task-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const storage: KeyValueStorage = {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { writes.push([key, value]); data.set(key, value); },
  };
  return { storage, data, writes };
}

describe("parseThemePreference", () => {
  test("accepts the three known values", () => {
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  test("falls back to system for anything else", () => {
    for (const bad of [null, undefined, "", "Dark", "auto", 1, {}, "\"dark\""]) {
      expect(parseThemePreference(bad)).toBe("system");
    }
  });
});

describe("loadThemePreference", () => {
  test("reads the stored preference", async () => {
    const { storage } = memoryStorage({ [THEME_STORAGE_KEY]: "dark" });
    expect(await loadThemePreference(storage)).toBe("dark");
  });

  test("uses system when nothing is stored, without writing", async () => {
    const { storage, writes } = memoryStorage();
    expect(await loadThemePreference(storage)).toBe("system");
    expect(writes).toEqual([]);
  });

  test("uses system for an invalid stored value, without writing", async () => {
    const { storage, writes } = memoryStorage({ [THEME_STORAGE_KEY]: "purple" });
    expect(await loadThemePreference(storage)).toBe("system");
    expect(writes).toEqual([]);
  });

  test("uses system when the read throws, without writing", async () => {
    const writes: string[] = [];
    const storage: KeyValueStorage = {
      getItem: async () => { throw new Error("disk"); },
      setItem: async key => { writes.push(key); },
    };
    expect(await loadThemePreference(storage)).toBe("system");
    expect(writes).toEqual([]);
  });
});

describe("saveThemePreference", () => {
  test("stores the preference under the versioned key", async () => {
    const { storage, data } = memoryStorage();
    expect(await saveThemePreference(storage, "light")).toEqual({ ok: true });
    expect(data.get("dayform.theme.v1")).toBe("light");
  });

  test("returns a typed failure instead of throwing", async () => {
    const storage: KeyValueStorage = {
      getItem: async () => null,
      setItem: async () => { throw new Error("full"); },
    };
    expect(await saveThemePreference(storage, "dark")).toEqual({ ok: false, reason: "write-failed" });
  });
});

describe("resolveScheme", () => {
  test("explicit preferences win over the system scheme", () => {
    expect(resolveScheme("dark", "light")).toBe("dark");
    expect(resolveScheme("light", "dark")).toBe("light");
  });

  test("system follows the device and defaults to light", () => {
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
    expect(resolveScheme("system", null)).toBe("light");
    expect(resolveScheme("system", undefined)).toBe("light");
    expect(resolveScheme("system", "unspecified")).toBe("light");
  });
});
