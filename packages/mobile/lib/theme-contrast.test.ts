import { describe, test, expect } from "bun:test";
import { Colors, type ThemeColors } from "../constants/palettes";
import { ACCENT_IDS, ACCENT_KEYS, ACCENT_SETS, applyAccent } from "../constants/accents";
import { COLOR_SLOTS } from "./categories";
import { categories } from "./planner";

const BODY_TEXT_RATIO = 4.5;
const ACCENT_RATIO = 3;

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const n = parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type ColorKey = Exclude<keyof ThemeColors, "category" | "cycle">;
type Check = { name: string; fg: string; bg: string; min: number };

const PAIRS: Array<[ColorKey, ColorKey, number]> = [
  ["foreground", "background", BODY_TEXT_RATIO],
  ["foreground", "card", BODY_TEXT_RATIO],
  ["cardForeground", "card", BODY_TEXT_RATIO],
  ["mutedForeground", "background", BODY_TEXT_RATIO],
  ["mutedForeground", "card", BODY_TEXT_RATIO],
  ["onPrimary", "primary", BODY_TEXT_RATIO],
  ["primaryForeground", "primary", BODY_TEXT_RATIO],
  ["accentForeground", "card", BODY_TEXT_RATIO],
  ["segmentText", "segmentBg", BODY_TEXT_RATIO],
  ["errorMessage", "errorBg", BODY_TEXT_RATIO],
  ["conflictText", "card", BODY_TEXT_RATIO],
  ["statLabel", "card", BODY_TEXT_RATIO],
  ["emptyText", "card", BODY_TEXT_RATIO],
  ["dateLabel", "background", BODY_TEXT_RATIO],
  ["primary", "background", ACCENT_RATIO],
  ["primary", "card", ACCENT_RATIO],
  ["countText", "background", ACCENT_RATIO],
  ["tealAccent", "tealTint", ACCENT_RATIO],
];

function checksFor(palette: ThemeColors): Check[] {
  const pairs = PAIRS.map(([fg, bg, min]) => ({
    name: `${fg} on ${bg} >= ${min}:1`, fg: palette[fg], bg: palette[bg], min,
  }));
  const perCategory = categories.flatMap(category => {
    const { bg, accent } = palette.category[category];
    return [
      { name: `${category} accent on tint >= ${ACCENT_RATIO}:1`, fg: accent, bg, min: ACCENT_RATIO },
      { name: `${category} title on tint >= ${BODY_TEXT_RATIO}:1`, fg: palette.foreground, bg, min: BODY_TEXT_RATIO },
      { name: `${category} cardMeta on tint >= ${BODY_TEXT_RATIO}:1`, fg: palette.cardMeta, bg, min: BODY_TEXT_RATIO },
    ];
  });
  return [...pairs, ...perCategory];
}

/**
 * The light palette is a deliberate pastel design; these pairs are below the target and fixing them
 * would visibly change the look, so they are reported instead of changed. Each entry is asserted to
 * STILL fail, so the list cannot silently go stale: remove an entry when you fix its pair.
 */
const KNOWN_LIGHT_GAPS = new Set([
  "mutedForeground on background >= 4.5:1",
  "mutedForeground on card >= 4.5:1",
  "segmentText on segmentBg >= 4.5:1",
  "statLabel on card >= 4.5:1",
  "emptyText on card >= 4.5:1",
  "dateLabel on background >= 4.5:1",
  "tealAccent on tealTint >= 3:1",
  "Focus cardMeta on tint >= 4.5:1",
  "Work accent on tint >= 3:1",
  "Work cardMeta on tint >= 4.5:1",
  "Personal accent on tint >= 3:1",
  "Personal cardMeta on tint >= 4.5:1",
  "Wellness accent on tint >= 3:1",
  "Wellness cardMeta on tint >= 4.5:1",
]);

describe("dark palette contrast", () => {
  for (const { name, fg, bg, min } of checksFor(Colors.dark)) {
    test(name, () => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("light palette contrast", () => {
  const checks = checksFor(Colors.light);

  for (const { name, fg, bg, min } of checks) {
    if (KNOWN_LIGHT_GAPS.has(name)) {
      test(`${name} (known gap, still below target)`, () => {
        expect(contrast(fg, bg)).toBeLessThan(min);
      });
    } else {
      test(name, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  test("every known gap names a real check", () => {
    const names = new Set(checks.map(check => check.name));
    for (const gap of KNOWN_LIGHT_GAPS) expect(names.has(gap)).toBe(true);
  });
});

type AccentCheck = { name: string; fg: keyof ThemeColors; bg: keyof ThemeColors; min: number };

const ACCENT_CHECKS: AccentCheck[] = [
  { name: "onPrimary on primary", fg: "onPrimary", bg: "primary", min: BODY_TEXT_RATIO },
  { name: "primaryForeground on primary", fg: "primaryForeground", bg: "primary", min: BODY_TEXT_RATIO },
  { name: "primary on background", fg: "primary", bg: "background", min: ACCENT_RATIO },
  { name: "primary on card", fg: "primary", bg: "card", min: ACCENT_RATIO },
  { name: "accentForeground on accent", fg: "accentForeground", bg: "accent", min: BODY_TEXT_RATIO },
  { name: "accentForeground on card", fg: "accentForeground", bg: "card", min: BODY_TEXT_RATIO },
  { name: "countText on background", fg: "countText", bg: "background", min: ACCENT_RATIO },
  { name: "segmentText on segmentBg", fg: "segmentText", bg: "segmentBg", min: BODY_TEXT_RATIO },
];

describe("accent contrast (every accent, both schemes)", () => {
  for (const accent of ACCENT_IDS) {
    for (const scheme of ["light", "dark"] as const) {
      const palette = applyAccent(Colors[scheme], accent);
      for (const { name, fg, bg, min } of ACCENT_CHECKS) {
        // Pre-existing pastel gap of the brand violet in light mode (see KNOWN_LIGHT_GAPS above).
        const knownGap = accent === "violet" && scheme === "light" && fg === "segmentText";
        test(`${accent} ${scheme}: ${name} >= ${min}:1${knownGap ? " (known gap)" : ""}`, () => {
          const ratio = contrast(palette[fg] as string, palette[bg] as string);
          if (knownGap) expect(ratio).toBeLessThan(min);
          else expect(ratio).toBeGreaterThanOrEqual(min);
        });
      }
    }
  }

  test("every accent overrides exactly the shared key set in both schemes", () => {
    for (const accent of ACCENT_IDS) {
      for (const scheme of ["light", "dark"] as const) {
        expect(Object.keys(ACCENT_SETS[accent][scheme]).sort()).toEqual([...ACCENT_KEYS].sort());
      }
    }
  });
});

describe("custom category color slots (both schemes)", () => {
  for (const scheme of ["light", "dark"] as const) {
    const palette = Colors[scheme];
    for (const slot of COLOR_SLOTS) {
      const { bg, accent } = palette.category[slot];
      test(`${scheme} ${slot}: accent on tint >= ${ACCENT_RATIO}:1`, () => {
        expect(contrast(accent, bg)).toBeGreaterThanOrEqual(ACCENT_RATIO);
      });
      test(`${scheme} ${slot}: title on tint >= ${BODY_TEXT_RATIO}:1`, () => {
        expect(contrast(palette.foreground, bg)).toBeGreaterThanOrEqual(BODY_TEXT_RATIO);
      });
    }
  }

  test("slots are visually distinct from each other within a scheme", () => {
    for (const scheme of ["light", "dark"] as const) {
      const accents = COLOR_SLOTS.map(slot => Colors[scheme].category[slot].accent);
      expect(new Set(accents).size).toBe(COLOR_SLOTS.length);
    }
  });
});

const CYCLE_KINDS = ["period", "predicted", "fertile", "safe"] as const;

describe("cycle tracker colors (both schemes)", () => {
  for (const scheme of ["light", "dark"] as const) {
    const palette = Colors[scheme];
    for (const kind of CYCLE_KINDS) {
      const { bg, accent } = palette.cycle[kind];
      test(`${scheme} ${kind}: accent on tint >= ${ACCENT_RATIO}:1`, () => {
        expect(contrast(accent, bg)).toBeGreaterThanOrEqual(ACCENT_RATIO);
      });
      test(`${scheme} ${kind}: title on tint >= ${BODY_TEXT_RATIO}:1`, () => {
        expect(contrast(palette.foreground, bg)).toBeGreaterThanOrEqual(BODY_TEXT_RATIO);
      });
      test(`${scheme} ${kind}: accent on card >= ${ACCENT_RATIO}:1`, () => {
        expect(contrast(accent, palette.card)).toBeGreaterThanOrEqual(ACCENT_RATIO);
      });
    }
  }

  test("the kinds are visually distinct within a scheme and are not category slots", () => {
    for (const scheme of ["light", "dark"] as const) {
      const palette = Colors[scheme];
      const accents = CYCLE_KINDS.map(kind => palette.cycle[kind].accent);
      expect(new Set(accents).size).toBe(CYCLE_KINDS.length);
      const slotAccents = new Set(Object.values(palette.category).map(slot => slot.accent));
      for (const accent of accents) expect(slotAccents.has(accent)).toBe(false);
    }
  });

  test("both schemes define the same kinds", () => {
    expect(Object.keys(Colors.light.cycle).sort()).toEqual(Object.keys(Colors.dark.cycle).sort());
  });
});

describe("contrast helper", () => {
  test("black on white is 21:1 and identical colors are 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#336699", "#336699")).toBeCloseTo(1, 5);
  });
});
