import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Colors } from "../constants/palettes";
import { extraTranslations } from "./i18n";
import { DEFAULT_SETTINGS, mergeSettings, type DeepPartial, type Settings } from "./settings";
import {
  MENU_GROUPS, MENU_ROWS, PAGE_SLUGS, findPage, menuGroups, rowHref, summaryFor,
  type MenuInputs, type MenuRowId,
} from "./settings-menu";

const identity = (text: string) => text;
const strict = (text: string): string => {
  const value = extraTranslations[text];
  if (value === undefined) throw new Error(`missing translation: ${text}`);
  return value;
};

function inputs(patch: DeepPartial<Settings> = {}, extra: Partial<MenuInputs> = {}): MenuInputs {
  return {
    settings: mergeSettings(DEFAULT_SETTINGS, patch),
    themePreference: "system",
    language: "en",
    categoryCount: 4,
    categoryName: id => id,
    version: "1.2.1",
    updateLine: null,
    cycle: { ready: true, enabled: false, lockEnabled: false },
    timeFormat: "24h",
    duration: minutes => `${minutes} min`,
    time: value => value,
    t: identity,
    ...extra,
  };
}
const say = (id: MenuRowId, patch: DeepPartial<Settings> = {}, extra: Partial<MenuInputs> = {}) => summaryFor(id, inputs(patch, extra));

describe("registry", () => {
  test("every row has a unique id, a known group, a title and a one-word-ish slug", () => {
    expect(new Set(MENU_ROWS.map(row => row.id)).size).toBe(MENU_ROWS.length);
    const groups = new Set(MENU_GROUPS.map(group => group.id));
    for (const row of MENU_ROWS) {
      expect(groups.has(row.group)).toBe(true);
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  test("groups appear in the designed order and none is empty", () => {
    expect(MENU_GROUPS.map(group => group.id)).toEqual(["personalise", "tasks", "reminders", "health", "data", "app"]);
    for (const group of MENU_GROUPS) expect(group.rows.length).toBeGreaterThan(0);
    expect(MENU_GROUPS.flatMap(group => group.rows)).toHaveLength(MENU_ROWS.length);
  });

  test("lists the pages of the design in order", () => {
    expect(MENU_GROUPS.map(group => group.rows.map(row => row.id))).toEqual([
      ["appearance", "language", "greeting"],
      ["new-tasks", "calendar", "categories", "habits"],
      ["notifications", "widget", "pet"],
      ["cycle", "cycle-tracking"],
      ["backup", "archive", "recovery"],
      ["updates", "about"],
    ]);
  });

  test("PAGE_SLUGS holds each page once", () => {
    expect(new Set(PAGE_SLUGS).size).toBe(PAGE_SLUGS.length);
    for (const row of MENU_ROWS) expect(PAGE_SLUGS).toContain(row.slug);
  });

  test("icons are real Ionicons glyphs and tints are palette tints in both schemes", () => {
    const glyphs = JSON.parse(readFileSync(
      join(import.meta.dir, "../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json"), "utf8",
    )) as Record<string, number>;
    for (const row of MENU_ROWS) {
      expect(glyphs[row.icon]).toBeDefined();
      expect(row.icon.endsWith("-outline")).toBe(true);
      expect(Colors.light.category[row.tint]).toBeDefined();
      expect(Colors.dark.category[row.tint]).toBeDefined();
    }
  });
});

describe("findPage", () => {
  test("returns the first row of a slug", () => {
    expect(findPage("calendar")?.id).toBe("calendar");
    expect(findPage("cycle")?.id).toBe("cycle");
  });

  test("is null for anything that is not a page", () => {
    for (const slug of ["", "nope", "constructor", "__proto__", "toString", "Calendar", "calendar/"]) expect(findPage(slug)).toBeNull();
    expect(findPage(undefined)).toBeNull();
    expect(findPage(["calendar"])).toBeNull();
  });
});

describe("menuGroups", () => {
  test("hides the cycle-tracking row until tracking is on", () => {
    const off = menuGroups(inputs()).find(group => group.id === "health")!;
    expect(off.rows.map(row => row.id)).toEqual(["cycle"]);
    const on = menuGroups(inputs({}, { cycle: { ready: true, enabled: true, lockEnabled: false } })).find(group => group.id === "health")!;
    expect(on.rows.map(row => row.id)).toEqual(["cycle", "cycle-tracking"]);
  });

  test("hides it while the cycle state is still loading", () => {
    const loading = menuGroups(inputs({}, { cycle: { ready: false, enabled: true, lockEnabled: true } })).find(group => group.id === "health")!;
    expect(loading.rows.map(row => row.id)).toEqual(["cycle"]);
  });
});

describe("rowHref", () => {
  test("pages open /settings/<slug>", () => {
    expect(rowHref("calendar", inputs())).toBe("/settings/calendar");
    expect(rowHref("about", inputs())).toBe("/settings/about");
  });

  test("the cycle row opens the tracker only when it is on and loaded", () => {
    expect(rowHref("cycle", inputs())).toBe("/settings/cycle");
    expect(rowHref("cycle", inputs({}, { cycle: { ready: false, enabled: true, lockEnabled: false } }))).toBe("/settings/cycle");
    expect(rowHref("cycle", inputs({}, { cycle: { ready: true, enabled: true, lockEnabled: false } }))).toBe("/cycle");
  });

  test("cycle-tracking always opens its settings page", () => {
    expect(rowHref("cycle-tracking", inputs({}, { cycle: { ready: true, enabled: true, lockEnabled: true } }))).toBe("/settings/cycle");
  });
});

describe("summaries", () => {
  test("appearance joins the theme and the accent", () => {
    expect(say("appearance")).toBe("System · Violet");
    expect(say("appearance", { accent: "forest" }, { themePreference: "dark" })).toBe("Dark · Forest");
    expect(say("appearance", { accent: "blossom" }, { themePreference: "light" })).toBe("Light · Blossom");
  });

  test("language names the current language in itself, whatever the translator does", () => {
    expect(say("language")).toBe("English");
    expect(say("language", {}, { language: "vi", t: () => "never used" })).toBe("Tiếng Việt");
  });

  test("greeting says whether the name shows and which slogan style is on", () => {
    expect(say("greeting")).toBe("Name shown · Rotating slogan");
    expect(say("greeting", { greeting: { showName: false, sloganStyle: "custom" } })).toBe("Name hidden · Custom slogan");
    expect(say("greeting", { greeting: { sloganStyle: "off" } })).toBe("Name shown · No slogan");
  });

  test("new tasks shows the default duration and category", () => {
    expect(say("new-tasks", { defaults: { duration: 45, category: "Work" } }, { categoryName: id => id.toUpperCase() })).toBe("45 min · WORK");
  });

  test("calendar shows the visible window and the week start", () => {
    expect(say("calendar")).toBe("06:00 – 22:00 · Monday");
    expect(say("calendar", { calendar: { dayStart: 480, dayEnd: 1440, weekStart: "sun" } })).toBe("08:00 – 24:00 · Sunday");
    expect(say("calendar", { calendar: { weekStart: "sat" } })).toBe("06:00 – 22:00 · Saturday");
    expect(say("calendar", {}, { timeFormat: "12h" })).toBe("6 AM – 10 PM · Monday");
  });

  test("categories counts with a singular form", () => {
    expect(say("categories", {}, { categoryCount: 6 })).toBe("6 categories");
    expect(say("categories", {}, { categoryCount: 1 })).toBe("1 category");
    expect(say("categories", {}, { categoryCount: 0 })).toBe("0 categories");
  });

  test("habit hints are on or off", () => {
    expect(say("habits")).toBe("On");
    expect(say("habits", { habits: { hints: false } })).toBe("Off");
  });

  test("notifications list quiet hours and the morning summary", () => {
    expect(say("notifications")).toBe("Standard reminders");
    expect(say("notifications", { notifications: { quietEnabled: true } })).toBe("Quiet 22:00 – 07:00");
    expect(say("notifications", { notifications: { summaryEnabled: true, summaryTime: "08:30" } })).toBe("Morning summary 08:30");
    expect(say("notifications", { notifications: { quietEnabled: true, summaryEnabled: true } })).toBe("Quiet 22:00 – 07:00 · Morning summary 08:00");
  });

  test("widget says whether titles show", () => {
    expect(say("widget")).toBe("Titles shown");
    expect(say("widget", { widget: { showTitles: false } })).toBe("Titles hidden");
  });

  test("pet names the animal and whether it strolls", () => {
    expect(say("pet")).toBe("Round cat · Strolling");
    expect(say("pet", { pet: { kind: "dog", walks: false } })).toBe("Dog · Resting");
    expect(say("pet", { pet: { kind: "off" } })).toBe("No pet");
  });

  test("backup, archive and recovery have a fixed hint", () => {
    expect(say("backup")).toBe("Export or import your data");
    expect(say("archive")).toBe("Old completed tasks");
    expect(say("recovery")).toBe("Restore a saved copy");
  });

  test("updates show the merged status line or the version", () => {
    expect(say("updates")).toBe("Version 1.2.1");
    expect(say("updates", {}, { updateLine: "Version 1.3.0 is available" })).toBe("Version 1.3.0 is available");
  });

  test("about hints at privacy", () => {
    expect(say("about")).toBe("Your data stays with you");
  });
});

describe("cycle summary never shows dates", () => {
  const cycle = (state: MenuInputs["cycle"]) => say("cycle", {}, { cycle: state });

  test("off", () => {
    expect(cycle({ ready: true, enabled: false, lockEnabled: false })).toBe("Off");
    expect(cycle({ ready: true, enabled: false, lockEnabled: true })).toBe("Off");
  });

  test("on, with and without the lock", () => {
    expect(cycle({ ready: true, enabled: true, lockEnabled: false })).toBe("On");
    expect(cycle({ ready: true, enabled: true, lockEnabled: true })).toBe("On · Locked");
  });

  test("a state that is still loading says nothing about the tracker", () => {
    for (const lockEnabled of [true, false]) {
      for (const enabled of [true, false]) expect(cycle({ ready: false, enabled, lockEnabled })).toBe("Private tracker");
    }
  });

  test("no combination of inputs produces a digit", () => {
    for (const ready of [true, false]) for (const enabled of [true, false]) for (const lockEnabled of [true, false]) {
      for (const id of ["cycle", "cycle-tracking"] as const) {
        expect(say(id, {}, { cycle: { ready, enabled, lockEnabled } })).not.toMatch(/\d/);
      }
    }
  });

  test("cycle-tracking explains what the page is for", () => {
    expect(say("cycle-tracking")).toBe("Turn tracking off");
  });
});

describe("translations", () => {
  test("every title, group label and summary has a Vietnamese string", () => {
    const strictInputs = (patch: DeepPartial<Settings>, extra: Partial<MenuInputs> = {}) => inputs(patch, { t: strict, ...extra });
    const variants: Array<[DeepPartial<Settings>, Partial<MenuInputs>]> = [
      [{}, {}],
      [{ greeting: { showName: false, sloganStyle: "custom" } }, {}],
      [{ greeting: { sloganStyle: "off" } }, {}],
      [{ calendar: { weekStart: "sun" } }, {}],
      [{ calendar: { weekStart: "sat" } }, {}],
      [{ notifications: { quietEnabled: true, summaryEnabled: true } }, {}],
      [{ widget: { showTitles: false }, habits: { hints: false } }, {}],
      [{}, { categoryCount: 1 }],
      [{}, { cycle: { ready: true, enabled: true, lockEnabled: true } }],
      [{}, { cycle: { ready: true, enabled: true, lockEnabled: false } }],
      [{}, { cycle: { ready: false, enabled: false, lockEnabled: false } }],
      [{ accent: "ocean" }, { themePreference: "dark" }],
      [{ accent: "lagoon" }, { themePreference: "light" }],
      [{ accent: "sunset" }, {}],
    ];
    for (const [patch, extra] of variants) {
      const all = strictInputs(patch, extra);
      for (const row of MENU_ROWS) expect(() => summaryFor(row.id, all)).not.toThrow();
    }
    for (const row of MENU_ROWS) expect(extraTranslations[row.title]).toBeTruthy();
    for (const group of MENU_GROUPS) expect(extraTranslations[group.title]).toBeTruthy();
  });
});
