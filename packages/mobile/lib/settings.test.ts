import { describe, test, expect } from "bun:test";
import {
  ACCENT_IDS,
  DEFAULT_SETTINGS,
  MAX_NAME_LENGTH,
  SETTINGS_KEY,
  isValidName,
  loadSettings,
  mergeSettings,
  normalizeName,
  nameInitial,
  normalizeSlogan,
  parseSettings,
  resolveSettings,
  saveSettings,
} from "./settings";
import type { KeyValueStorage } from "./task-storage";

function memoryStorage(initial: Record<string, string> = {}, failSet = false, failGet = false) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const storage: KeyValueStorage = {
    getItem: async key => {
      if (failGet) throw new Error("read failed");
      return data.get(key) ?? null;
    },
    setItem: async (key, value) => {
      if (failSet) throw new Error("write failed");
      writes.push([key, value]);
      data.set(key, value);
    },
  };
  return { storage, data, writes };
}

describe("defaults", () => {
  test("have the documented values", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      profile: { name: "" },
      accent: "violet",
      defaults: { duration: 30, category: "Focus", remind: null, scheduleNew: false, startMode: "fixed", startFixed: "09:00" },
      notifications: { quietEnabled: false, quietFrom: "22:00", quietTo: "07:00", hideTitles: false, snoozeMinutes: 10, summaryEnabled: false, summaryTime: "08:00" },
      greeting: { showName: true, sloganStyle: "rotate", customSlogan: "" },
      calendar: { dayStart: 360, dayEnd: 1320, hourHeight: "normal", weekStart: "mon", timeFormat: "auto", showHolidays: true, holidayGroups: { national: true, traditional: true, occasion: true }, showLunar: false },
      habits: { hints: true },
      assistant: { enabled: true, voice: true },
      widget: { showTitles: true },
      pet: { kind: "gray-cat", walks: true, last: "gray-cat" },
      updates: { autoOta: true },
    });
    expect(ACCENT_IDS).toEqual(["violet", "ocean", "lagoon", "forest", "sunset", "blossom"]);
  });
});

describe("resolveSettings", () => {
  test("returns the defaults for anything that is not an object", () => {
    for (const bad of [null, undefined, 1, "x", [], true, () => 1]) {
      expect(resolveSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });

  test("the same defaults object is not shared with callers' mutations", () => {
    const first = resolveSettings({});
    const second = resolveSettings({});
    expect(first).toEqual(second);
    expect(first).not.toBe(DEFAULT_SETTINGS);
  });

  test("keeps valid values from every group", () => {
    const raw = {
      profile: { name: "Linh" },
      accent: "forest",
      defaults: { duration: 45, category: "Work", remind: 15, scheduleNew: true, startMode: "next-hour", startFixed: "10:30" },
      notifications: { quietEnabled: true, quietFrom: "23:00", quietTo: "06:30", hideTitles: true, snoozeMinutes: 5, summaryEnabled: true, summaryTime: "07:15" },
      greeting: { showName: false, sloganStyle: "custom", customSlogan: "Go go" },
      calendar: { dayStart: 420, dayEnd: 1260, hourHeight: "roomy", weekStart: "sun", timeFormat: "24h", showHolidays: false, holidayGroups: { national: true, traditional: false, occasion: false }, showLunar: true },
      habits: { hints: false },
      assistant: { enabled: false, voice: false },
      widget: { showTitles: false },
      pet: { kind: "off", walks: false, last: "dog" },
      updates: { autoOta: false },
    };
    expect(resolveSettings(raw)).toEqual(raw as never);
  });

  test("a pet that no longer exists (the old round cat) becomes the default pet and keeps the walking choice", () => {
    const result = resolveSettings({ pet: { kind: "round-cat", walks: false } });
    expect(result.pet).toEqual({ kind: "gray-cat", walks: false, last: "gray-cat" });
  });

  test("settings saved before the Pet switch have no remembered pet and get the default one", () => {
    expect(resolveSettings({ pet: { kind: "kitsune", walks: true } }).pet).toEqual({ kind: "kitsune", walks: true, last: "gray-cat" });
  });

  test("invalid fields fall back individually, valid siblings survive", () => {
    const result = resolveSettings({
      accent: "neon",
      profile: { name: 42 },
      defaults: { duration: 50, category: "", remind: 7, scheduleNew: "yes", startMode: "later", startFixed: "25:00" },
      notifications: { quietFrom: "9:00", snoozeMinutes: 20, hideTitles: true },
      greeting: { sloganStyle: "loud", showName: false },
      calendar: { hourHeight: "tiny", weekStart: "fri", timeFormat: "36h", showHolidays: "yes", holidayGroups: "all", showLunar: 1 },
      habits: { hints: "no" },
      widget: { showTitles: 0 },
      pet: { kind: "unicorn", walks: "sometimes" },
      updates: { autoOta: "off" },
    });
    expect(result.accent).toBe("violet");
    expect(result.profile.name).toBe("");
    expect(result.defaults).toEqual(DEFAULT_SETTINGS.defaults);
    expect(result.notifications).toEqual({ ...DEFAULT_SETTINGS.notifications, hideTitles: true });
    expect(result.greeting).toEqual({ ...DEFAULT_SETTINGS.greeting, showName: false });
    expect(result.calendar).toEqual(DEFAULT_SETTINGS.calendar);
    expect(result.habits.hints).toBe(true);
    expect(result.widget.showTitles).toBe(true);
    expect(result.pet).toEqual(DEFAULT_SETTINGS.pet);
    expect(result.updates.autoOta).toBe(true);
  });

  test("a group that is not an object falls back as a whole", () => {
    const result = resolveSettings({ defaults: "bad", calendar: null, notifications: [], accent: "ocean" });
    expect(result.defaults).toEqual(DEFAULT_SETTINGS.defaults);
    expect(result.calendar).toEqual(DEFAULT_SETTINGS.calendar);
    expect(result.notifications).toEqual(DEFAULT_SETTINGS.notifications);
    expect(result.accent).toBe("ocean");
  });

  test("unknown keys are dropped at every level", () => {
    const result = resolveSettings({ extra: 1, habits: { hints: false, other: true }, profile: { name: "A", age: 3 } });
    expect(Object.keys(result)).toEqual(Object.keys(DEFAULT_SETTINGS));
    expect(result.habits).toEqual({ hints: false });
    expect(result.profile).toEqual({ name: "A" });
  });

  test("accepts every duration, accent, remind option and null remind", () => {
    for (const duration of [15, 30, 45, 60, 90, 120] as const) {
      expect(resolveSettings({ defaults: { duration } }).defaults.duration).toBe(duration);
    }
    for (const accent of ACCENT_IDS) expect(resolveSettings({ accent }).accent).toBe(accent);
    for (const remind of [0, 5, 15, 30, 60, null]) {
      expect(resolveSettings({ defaults: { remind } }).defaults.remind).toBe(remind);
    }
    expect(resolveSettings({ defaults: { remind: 10 } }).defaults.remind).toBeNull();
  });

  test("category is a non-empty string of at most 40 characters, not checked against the list", () => {
    expect(resolveSettings({ defaults: { category: "Gym" } }).defaults.category).toBe("Gym");
    expect(resolveSettings({ defaults: { category: "x".repeat(40) } }).defaults.category).toBe("x".repeat(40));
    expect(resolveSettings({ defaults: { category: "x".repeat(41) } }).defaults.category).toBe("Focus");
    expect(resolveSettings({ defaults: { category: "" } }).defaults.category).toBe("Focus");
  });

  test("time fields accept HH:mm only", () => {
    expect(resolveSettings({ defaults: { startFixed: "00:00" } }).defaults.startFixed).toBe("00:00");
    expect(resolveSettings({ defaults: { startFixed: "23:59" } }).defaults.startFixed).toBe("23:59");
    for (const bad of ["24:00", "09:60", "9:00", "0900", "", 900]) {
      expect(resolveSettings({ defaults: { startFixed: bad } }).defaults.startFixed).toBe("09:00");
    }
  });

  test("the stored name and slogan are sanitised on resolve", () => {
    expect(resolveSettings({ profile: { name: "  Linh \n  Tran " } }).profile.name).toBe("Linh Tran");
    expect(resolveSettings({ profile: { name: "a".repeat(80) } }).profile.name).toHaveLength(MAX_NAME_LENGTH);
    expect(resolveSettings({ greeting: { customSlogan: "x".repeat(90) } }).greeting.customSlogan).toHaveLength(60);
  });
});

describe("holiday settings", () => {
  test("each holiday group can be switched off on its own", () => {
    const result = resolveSettings({ calendar: { holidayGroups: { traditional: false } } }).calendar.holidayGroups;
    expect(result).toEqual({ national: true, traditional: false, occasion: true });
  });

  test("a bad holiday group value falls back to all on, and a bad flag to its default", () => {
    expect(resolveSettings({ calendar: { holidayGroups: 5, showLunar: "yes" } }).calendar).toMatchObject({
      holidayGroups: { national: true, traditional: true, occasion: true }, showLunar: false,
    });
  });
});

describe("calendar day range", () => {
  const calendar = (dayStart: unknown, dayEnd: unknown) => resolveSettings({ calendar: { dayStart, dayEnd } }).calendar;

  test("accepts a valid pair", () => {
    expect(calendar(0, 1440)).toMatchObject({ dayStart: 0, dayEnd: 1440 });
    expect(calendar(480, 720)).toMatchObject({ dayStart: 480, dayEnd: 720 });
  });

  test("a span below 4 hours resets both", () => {
    expect(calendar(480, 660)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
    expect(calendar(600, 600)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
    expect(calendar(900, 600)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
  });

  test("a non multiple of 60 or out of range value resets both", () => {
    expect(calendar(390, 1320)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
    expect(calendar(-60, 600)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
    expect(calendar(0, 1500)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
    expect(calendar(0.5, 1320)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
  });

  test("a lone valid value that conflicts with the default pairs back to defaults", () => {
    expect(calendar(1260, undefined)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
    expect(calendar(undefined, 480)).toMatchObject({ dayStart: 360, dayEnd: 1320 });
  });

  test("other calendar fields are kept when the pair resets", () => {
    const result = resolveSettings({ calendar: { dayStart: 1, dayEnd: 2, weekStart: "sat" } }).calendar;
    expect(result).toMatchObject({ dayStart: 360, dayEnd: 1320, weekStart: "sat" });
  });
});

describe("normalizeName", () => {
  test("trims and collapses whitespace including newlines and tabs", () => {
    expect(normalizeName("  Anh   Dũng \t\n Nguyễn ")).toBe("Anh Dũng Nguyễn");
  });

  test("strips control characters", () => {
    expect(normalizeName("Li\u0000n\u0007h\u007F")).toBe("Linh");
    expect(normalizeName("A\u0085B\u009F")).toBe("AB");
  });

  test("strips bidi and invisible formatting characters", () => {
    expect(normalizeName("‮Mai‬")).toBe("Mai");
    expect(normalizeName("⁦Mai⁩‎‏؜﻿​⁠")).toBe("Mai");
  });

  test("limits to 40 code points without cutting an emoji in half", () => {
    expect(normalizeName("a".repeat(41))).toBe("a".repeat(40));
    const emoji = "😀".repeat(41);
    const result = normalizeName(emoji);
    expect(Array.from(result)).toHaveLength(40);
    expect(result).toBe("😀".repeat(40));
  });

  test("keeps emoji and diacritics", () => {
    expect(normalizeName("Ngọc 🌸")).toBe("Ngọc 🌸");
  });

  test("trims again after truncation", () => {
    expect(normalizeName(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });

  test("only spaces or invisible characters give an empty string", () => {
    expect(normalizeName("     ")).toBe("");
    expect(normalizeName("​‮\u0000")).toBe("");
  });

  test("non strings give an empty string", () => {
    expect(normalizeName(undefined as unknown as string)).toBe("");
    expect(normalizeName(5 as unknown as string)).toBe("");
  });
});

describe("isValidName", () => {
  test("true only when something is left after normalising", () => {
    expect(isValidName("Linh")).toBe(true);
    expect(isValidName("😀")).toBe(true);
    expect(isValidName("   ")).toBe(false);
    expect(isValidName("")).toBe(false);
    expect(isValidName("‮")).toBe(false);
    expect(isValidName(null as unknown as string)).toBe(false);
  });
});

describe("nameInitial", () => {
  test("is the upper-cased first character", () => {
    expect(nameInitial("linh")).toBe("L");
    expect(nameInitial("  ơn")).toBe("Ơ");
    expect(nameInitial("🌸 Hoa")).toBe("🌸");
  });

  test("is ? when there is nothing to show", () => {
    expect(nameInitial("")).toBe("?");
    expect(nameInitial("  ‮ ")).toBe("?");
  });
});

describe("normalizeSlogan", () => {
  test("is sanitised like a name but allows 60 characters", () => {
    expect(normalizeSlogan("  Make it\ncount  ")).toBe("Make it count");
    expect(normalizeSlogan("y".repeat(61))).toBe("y".repeat(60));
  });
});

describe("parseSettings", () => {
  test("parses valid JSON", () => {
    const result = parseSettings(JSON.stringify({ accent: "sunset" }));
    expect(result.valid).toBe(true);
    expect(result.settings.accent).toBe("sunset");
  });

  test("invalid JSON or a non object gives the defaults and valid=false", () => {
    for (const text of ["{oops", "", "null", "[1]", "42"]) {
      const result = parseSettings(text);
      expect(result.valid).toBe(false);
      expect(result.settings).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe("mergeSettings", () => {
  test("applies a deep patch and leaves the original untouched", () => {
    const current = resolveSettings({ profile: { name: "A" }, calendar: { weekStart: "sun" } });
    const snapshot = JSON.stringify(current);
    const next = mergeSettings(current, { calendar: { hourHeight: "roomy" }, accent: "ocean" });
    expect(next).not.toBe(current);
    expect(JSON.stringify(current)).toBe(snapshot);
    expect(next.calendar).toEqual({ ...current.calendar, hourHeight: "roomy" });
    expect(next.accent).toBe("ocean");
    expect(next.profile).toBe(next.profile);
    expect(next.profile.name).toBe("A");
  });

  test("shares untouched groups structurally but never mutates them", () => {
    const current = resolveSettings({});
    const next = mergeSettings(current, { habits: { hints: false } });
    expect(next.habits).not.toBe(current.habits);
    expect(current.habits.hints).toBe(true);
  });

  test("returns the same reference when nothing changes", () => {
    const current = resolveSettings({});
    expect(mergeSettings(current, {})).toBe(current);
    expect(mergeSettings(current, { accent: "violet" })).toBe(current);
    expect(mergeSettings(current, { calendar: {} })).toBe(current);
  });

  test("re-validates: an invalid patched field falls back to its default", () => {
    const current = resolveSettings({ accent: "ocean" });
    const next = mergeSettings(current, { accent: "bogus" as never, defaults: { duration: 50 as never } });
    expect(next.accent).toBe("violet");
    expect(next.defaults.duration).toBe(30);
  });

  test("normalises a patched name", () => {
    const next = mergeSettings(resolveSettings({}), { profile: { name: "  Hà   Nội " } });
    expect(next.profile.name).toBe("Hà Nội");
  });

  test("an invalid day range patch resets the pair", () => {
    const next = mergeSettings(resolveSettings({}), { calendar: { dayStart: 1260 } });
    expect(next.calendar).toMatchObject({ dayStart: 360, dayEnd: 1320 });
  });

  test("a valid day range patch of both fields is applied", () => {
    const next = mergeSettings(resolveSettings({}), { calendar: { dayStart: 480, dayEnd: 1200 } });
    expect(next.calendar).toMatchObject({ dayStart: 480, dayEnd: 1200 });
  });

  test("ignores undefined patch values and non object groups", () => {
    const current = resolveSettings({ accent: "forest" });
    expect(mergeSettings(current, { accent: undefined, habits: undefined })).toBe(current);
    expect(mergeSettings(current, { habits: "x" as never })).toBe(current);
  });
});

describe("loadSettings", () => {
  test("missing key gives defaults without writing", async () => {
    const { storage, writes } = memoryStorage();
    const result = await loadSettings(storage);
    expect(result).toEqual({ status: "missing", settings: DEFAULT_SETTINGS });
    expect(writes).toEqual([]);
  });

  test("reads stored settings", async () => {
    const { storage } = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ profile: { name: "Linh" } }) });
    const result = await loadSettings(storage);
    expect(result.status).toBe("loaded");
    expect(result.settings.profile.name).toBe("Linh");
  });

  test("invalid JSON gives defaults, status invalid and no write", async () => {
    const { storage, writes } = memoryStorage({ [SETTINGS_KEY]: "{broken" });
    const result = await loadSettings(storage);
    expect(result).toEqual({ status: "invalid", settings: DEFAULT_SETTINGS });
    expect(writes).toEqual([]);
  });

  test("read error gives defaults, status read-failed and no write", async () => {
    const { storage, writes } = memoryStorage({}, false, true);
    const result = await loadSettings(storage);
    expect(result).toEqual({ status: "read-failed", settings: DEFAULT_SETTINGS });
    expect(writes).toEqual([]);
  });
});

describe("saveSettings", () => {
  test("writes the settings JSON under the key", async () => {
    const { storage, data } = memoryStorage();
    const settings = mergeSettings(DEFAULT_SETTINGS, { profile: { name: "Linh" } });
    expect(await saveSettings(storage, settings)).toEqual({ ok: true });
    expect(JSON.parse(data.get(SETTINGS_KEY) as string)).toEqual(settings);
  });

  test("a failed write is a typed result, not a throw", async () => {
    const { storage } = memoryStorage({}, true);
    expect(await saveSettings(storage, DEFAULT_SETTINGS)).toEqual({ ok: false, reason: "write-failed" });
  });

  test("the key is versioned", () => {
    expect(SETTINGS_KEY).toBe("dayform.settings.v1");
  });
});

describe("updates.autoOta", () => {
  test("defaults to on and an older stored value without the group resolves to on", () => {
    expect(DEFAULT_SETTINGS.updates.autoOta).toBe(true);
    expect(resolveSettings({ accent: "forest" }).updates).toEqual({ autoOta: true });
  });

  test("can be switched off and the choice survives a save and load", async () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { updates: { autoOta: false } });
    expect(next.updates.autoOta).toBe(false);
    expect(DEFAULT_SETTINGS.updates.autoOta).toBe(true);
    const { storage } = memoryStorage();
    expect(await saveSettings(storage, next)).toEqual({ ok: true });
    expect((await loadSettings(storage)).settings.updates.autoOta).toBe(false);
  });
});
