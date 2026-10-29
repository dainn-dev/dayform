import { describe, test, expect } from "bun:test";
import { ACCENT_IDS, ACCENT_KEYS, ACCENT_LABELS, ACCENT_SETS, applyAccent } from "../constants/accents";
import { Colors } from "../constants/palettes";

const HEX = /^#[0-9A-F]{6}$/;

describe("applyAccent", () => {
  test("violet keeps every token byte-identical in both schemes", () => {
    expect(applyAccent(Colors.light, "violet")).toEqual(Colors.light);
    expect(applyAccent(Colors.dark, "violet")).toEqual(Colors.dark);
  });

  test("returns a new object and never mutates the base palette", () => {
    const before = JSON.stringify(Colors.light);
    const result = applyAccent(Colors.light, "ocean");
    expect(result).not.toBe(Colors.light);
    expect(JSON.stringify(Colors.light)).toBe(before);
    expect(result.primary).not.toBe(Colors.light.primary);
  });

  test("is memoised per palette and accent", () => {
    expect(applyAccent(Colors.dark, "forest")).toBe(applyAccent(Colors.dark, "forest"));
    expect(applyAccent(Colors.dark, "forest")).not.toBe(applyAccent(Colors.light, "forest"));
    expect(applyAccent(Colors.light, "forest")).not.toBe(applyAccent(Colors.light, "sunset"));
  });

  test("only accent keys change; surfaces, text and categories are shared", () => {
    const changed = new Set<string>();
    for (const accent of ACCENT_IDS) {
      const result = applyAccent(Colors.light, accent);
      for (const key of Object.keys(Colors.light) as Array<keyof typeof Colors.light>) {
        if (result[key] !== Colors.light[key]) changed.add(key);
      }
      expect(result.category).toBe(Colors.light.category);
      expect(result.background).toBe(Colors.light.background);
    }
    for (const key of changed) expect((ACCENT_KEYS as readonly string[]).includes(key)).toBe(true);
  });

  test("uses the dark overrides for the dark palette", () => {
    expect(applyAccent(Colors.dark, "ocean").primary).toBe(ACCENT_SETS.ocean.dark.primary);
    expect(applyAccent(Colors.light, "ocean").primary).toBe(ACCENT_SETS.ocean.light.primary);
  });

  test("an unknown accent falls back to violet", () => {
    expect(applyAccent(Colors.light, "bogus" as never)).toEqual(Colors.light);
  });
});

describe("accent sets", () => {
  test("every set has valid 6-digit hex values and a label", () => {
    for (const accent of ACCENT_IDS) {
      expect(ACCENT_LABELS[accent].length).toBeGreaterThan(0);
      for (const scheme of ["light", "dark"] as const) {
        for (const key of ACCENT_KEYS) expect(ACCENT_SETS[accent][scheme][key]).toMatch(HEX);
      }
    }
  });

  test("the six accents have different primaries in each scheme", () => {
    for (const scheme of ["light", "dark"] as const) {
      const primaries = ACCENT_IDS.map(accent => ACCENT_SETS[accent][scheme].primary);
      expect(new Set(primaries).size).toBe(ACCENT_IDS.length);
    }
  });
});
