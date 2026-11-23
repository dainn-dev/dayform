import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAccent } from "../constants/accents";
import { Colors } from "../constants/palettes";
import { STYLES, TEXT_ROLES } from "../constants/styles";
import { contrastRatio, mix } from "./color-tint";
import { buildTheme, fontFace, stylePalette, usedFontFiles } from "./design-theme";
import { STYLE_IDS } from "./settings";

const BODY = 4.5;
const ACCENT = 3;
const SEEDED = STYLE_IDS.filter(id => STYLES[id].seeds !== null);
const SCHEMES = ["light", "dark"] as const;

// The seeded styles are new, so unlike the original pastel palette they hold every pair to the target (no known gaps).
const PAIRS: Array<[string, string, number]> = [
  ["foreground", "background", BODY], ["foreground", "card", BODY], ["cardForeground", "card", BODY],
  ["mutedForeground", "background", BODY], ["mutedForeground", "card", BODY],
  ["onPrimary", "primary", BODY], ["primaryForeground", "primary", BODY],
  ["accentForeground", "card", BODY], ["accentForeground", "accent", BODY], ["secondaryForeground", "secondary", BODY],
  ["segmentText", "segmentBg", BODY], ["errorMessage", "errorBg", BODY], ["errorBannerText", "errorBg", BODY],
  ["warningText", "warningBg", BODY], ["conflictText", "card", BODY], ["overlapText", "card", BODY],
  ["statLabel", "card", BODY], ["emptyText", "card", BODY], ["dateLabel", "background", BODY], ["labelText", "card", BODY],
  ["eventMeta", "card", BODY], ["cardMeta", "card", BODY],
  ["primary", "background", ACCENT], ["primary", "card", ACCENT], ["countText", "background", ACCENT],
  ["tealAccent", "tealTint", ACCENT], ["destructive", "card", ACCENT], ["deleteText", "card", ACCENT],
];

describe("seeded style palettes", () => {
  for (const style of SEEDED) {
    for (const scheme of SCHEMES) {
      const palette = stylePalette(style, scheme) as unknown as Record<string, string> & typeof Colors.light;
      for (const [fg, bg, min] of PAIRS) {
        test(`${style} ${scheme}: ${fg} on ${bg} >= ${min}:1`, () => {
          expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min);
        });
      }
      for (const [id, { bg, accent }] of Object.entries(palette.category)) {
        test(`${style} ${scheme}: category ${id} accent, title and meta on its tint`, () => {
          expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(ACCENT);
          expect(contrastRatio(palette.foreground, bg)).toBeGreaterThanOrEqual(BODY);
          expect(contrastRatio(palette.cardMeta, bg)).toBeGreaterThanOrEqual(BODY);
        });
      }
      for (const [kind, { bg, accent }] of Object.entries(palette.cycle)) {
        test(`${style} ${scheme}: cycle ${kind} accent on tint and card, title on tint`, () => {
          expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(ACCENT);
          expect(contrastRatio(accent, palette.card)).toBeGreaterThanOrEqual(ACCENT);
          expect(contrastRatio(palette.foreground, bg)).toBeGreaterThanOrEqual(BODY);
        });
      }
    }
  }

  test("every seeded palette has exactly the keys of the original palette", () => {
    for (const style of SEEDED) {
      for (const scheme of SCHEMES) {
        const palette = stylePalette(style, scheme);
        expect(Object.keys(palette).sort()).toEqual(Object.keys(Colors[scheme]).sort());
        expect(Object.keys(palette.category).sort()).toEqual(Object.keys(Colors[scheme].category).sort());
        expect(Object.keys(palette.cycle).sort()).toEqual(Object.keys(Colors[scheme].cycle).sort());
      }
    }
  });

  test("category accents stay distinct and cycle kinds are never a category colour", () => {
    for (const style of SEEDED) {
      for (const scheme of SCHEMES) {
        const palette = stylePalette(style, scheme);
        const categoryAccents = Object.values(palette.category).map(c => c.accent);
        expect(new Set(Object.values(palette.cycle).map(c => c.accent)).size).toBe(4);
        for (const { accent } of Object.values(palette.cycle)) expect(categoryAccents).not.toContain(accent);
      }
    }
  });
});

describe("original style", () => {
  test("keeps the hand-tuned palettes and takes the accent sets", () => {
    for (const scheme of SCHEMES) {
      expect(stylePalette("dayform", scheme)).toEqual(Colors[scheme]);
      expect(stylePalette("dayform", scheme, "ocean")).toBe(applyAccent(Colors[scheme], "ocean"));
    }
    expect(buildTheme("dayform", "light", "forest", false).accentable).toBe(true);
  });

  test("seeded styles ignore the accent", () => {
    for (const style of SEEDED) {
      expect(buildTheme(style, "light", "sunset", true)).toBe(buildTheme(style, "light", "violet", true));
      expect(buildTheme(style, "light", "violet", true).accentable).toBe(false);
    }
  });
});

describe("theme", () => {
  test("is memoised per input", () => {
    expect(buildTheme("paper", "dark", "violet", true)).toBe(buildTheme("paper", "dark", "violet", true));
    expect(buildTheme("paper", "dark", "violet", true)).not.toBe(buildTheme("paper", "dark", "violet", false));
  });

  test("an unknown style falls back to the original", () => {
    expect(buildTheme("bogus" as never, "light", "violet", true).style).toBe("dayform");
  });

  test("every style defines every text role with a line height at least its size", () => {
    for (const id of STYLE_IDS) {
      for (const role of TEXT_ROLES) {
        const spec = STYLES[id].type[role];
        expect(spec.line).toBeGreaterThanOrEqual(spec.size);
        expect(spec.size).toBeGreaterThanOrEqual(10);
      }
    }
  });

  test("roles get decreasing sizes from hero to micro", () => {
    for (const id of STYLE_IDS) {
      const sizes = TEXT_ROLES.filter(role => role !== "mono").map(role => STYLES[id].type[role].size);
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  });

  test("without the fonts, text uses the system font at the role's weight", () => {
    const theme = buildTheme("paper", "light", "violet", false);
    expect(theme.type.display.fontFamily).toBeUndefined();
    expect(theme.type.display.fontWeight).toBe("500");
    expect(theme.font.bold).toEqual({ fontWeight: "700" });
    expect(theme.type.mono.fontFamily).toBe("monospace");
  });

  test("with the fonts, a missing weight uses the nearest lighter file and never also sets fontWeight", () => {
    expect(fontFace("Inter", "heavy", true)).toEqual({ fontFamily: "Inter-700" });
    expect(fontFace("Newsreader", "bold", true)).toEqual({ fontFamily: "Newsreader-600" });
    const theme = buildTheme("precision", "dark", "violet", true);
    for (const role of TEXT_ROLES) expect(theme.type[role].fontWeight).toBeUndefined();
  });

  test("border styles draw a 1px border on cards, shadow styles do not", () => {
    for (const id of STYLE_IDS) {
      const card = buildTheme(id, "light", "violet", true).elevation.card;
      if (STYLES[id].depth === "border") expect(card.borderWidth).toBe(1);
      else expect(card.borderWidth).toBeUndefined();
    }
  });
});

describe("font files", () => {
  const table = readFileSync(join(import.meta.dir, "../constants/fonts.ts"), "utf8");

  test("every font a style uses is registered and shipped", () => {
    for (const name of usedFontFiles()) {
      expect(table).toContain(`"${name}": require("../assets/fonts/${name}.ttf")`);
      expect(existsSync(join(import.meta.dir, "../assets/fonts", `${name}.ttf`))).toBe(true);
    }
  });

  test("the OFL licence of every shipped family sits next to the files", () => {
    for (const family of ["Inter", "BeVietnamPro", "Newsreader", "JetBrainsMono"]) {
      expect(existsSync(join(import.meta.dir, "../assets/fonts", `OFL-${family}.txt`))).toBe(true);
    }
  });
});

describe("mix", () => {
  test("goes from one colour to the other", () => {
    expect(mix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mix("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  test("throws on an unreadable colour", () => {
    expect(() => mix("transparent", "#FFFFFF", 0.5)).toThrow();
  });
});
