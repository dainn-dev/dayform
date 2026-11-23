import { describe, expect, test } from "bun:test";
import { ACCENT_IDS, ACCENT_SETS } from "../constants/accents";
import { STYLES } from "../constants/styles";
import { stylePalette } from "./design-theme";
import { STYLE_IDS } from "./settings";
import { buildWidgetSnapshot } from "./widget-snapshot";
import { accentJson, isHexColor, widgetAccent, type WidgetAccent } from "./widget-accent";

const NOW = new Date(2026, 9, 30, 12, 0);

describe("widgetAccent", () => {
  test("every accent of the Theme page gives two valid colours, taken from its light set", () => {
    for (const id of ACCENT_IDS) {
      const accent = widgetAccent(id);
      expect(isHexColor(accent.primary)).toBe(true);
      expect(isHexColor(accent.tint)).toBe(true);
      expect(accent).toEqual({ primary: ACCENT_SETS[id].light.primary, tint: ACCENT_SETS[id].light.primaryTint });
    }
  });

  test("different accents look different on the widget", () => {
    const primaries = new Set(ACCENT_IDS.map(id => widgetAccent(id).primary));
    expect(primaries.size).toBe(ACCENT_IDS.length);
  });

  test("an unknown accent falls back to violet", () => {
    expect(widgetAccent("neon" as never)).toEqual(widgetAccent("violet"));
  });

  test("the original style sends no card colours, so the widget keeps its own card", () => {
    for (const id of ACCENT_IDS) expect(widgetAccent(id, "dayform").card).toBeUndefined();
  });

  test("every seeded style sends its light primary and its light card colours, whatever the accent", () => {
    const seeded = STYLE_IDS.filter(style => STYLES[style].seeds !== null);
    expect(seeded.length).toBeGreaterThan(0);
    for (const style of seeded) {
      const light = stylePalette(style, "light");
      const expected = {
        primary: light.primary,
        tint: light.primaryTint,
        card: { background: light.card, foreground: light.foreground, muted: light.mutedForeground, line: light.border },
      };
      for (const id of ACCENT_IDS) expect(widgetAccent(id, style)).toEqual(expected);
      expect(Object.values(expected.card).every(isHexColor)).toBe(true);
      // The card is always light: a light surface under dark text.
      expect(luminance(expected.card.background)).toBeGreaterThan(0.8);
      expect(luminance(expected.card.foreground)).toBeLessThan(0.2);
    }
  });
});

function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255;
}

describe("the accent in the widget snapshot", () => {
  const build = (accent?: WidgetAccent) =>
    buildWidgetSnapshot([], { now: NOW, showTitles: true, locale: "en", accent }).snapshot;

  test("is sent as ac.p / ac.t", () => {
    expect(build({ primary: "#2F67D8", tint: "#EDF2FC" }).ac).toEqual({ p: "#2F67D8", t: "#EDF2FC" });
  });

  test("is left out when missing or not a #rrggbb colour, so the widget keeps its own colours", () => {
    expect(build().ac).toBeUndefined();
    expect(build({ primary: "blue", tint: "#EDF2FC" }).ac).toBeUndefined();
    expect(build({ primary: "#2F67D8", tint: "rgb(1,2,3)" }).ac).toBeUndefined();
    expect("ac" in build()).toBe(false);
  });

  test("a different accent is a different snapshot, so the widget is redrawn", () => {
    expect(JSON.stringify(build({ primary: "#2F67D8", tint: "#EDF2FC" }))).not.toBe(JSON.stringify(build({ primary: "#0E7C86", tint: "#EBF4F5" })));
  });
});

describe("the style's card colours in the widget snapshot", () => {
  const build = (accent?: WidgetAccent) =>
    buildWidgetSnapshot([], { now: NOW, showTitles: true, locale: "en", accent }).snapshot;
  const card = { background: "#FBF9F4", foreground: "#1C1B19", muted: "#66635C", line: "#E2DACD" };

  test("are sent as ac.bg / fg / mu / ln next to the accent", () => {
    expect(build({ primary: "#B5573A", tint: "#F5EAE4", card }).ac).toEqual({
      p: "#B5573A", t: "#F5EAE4", bg: "#FBF9F4", fg: "#1C1B19", mu: "#66635C", ln: "#E2DACD",
    });
  });

  test("the original style's snapshot has exactly the two accent fields, as an older app sent", () => {
    const ac = build(widgetAccent("violet", "dayform")).ac;
    expect(Object.keys(ac ?? {}).sort()).toEqual(["p", "t"]);
  });

  test("each seeded style sends its own light card colours", () => {
    for (const style of STYLE_IDS.filter(id => STYLES[id].seeds !== null)) {
      const light = stylePalette(style, "light");
      expect(build(widgetAccent("violet", style)).ac).toEqual({
        p: light.primary, t: light.primaryTint, bg: light.card, fg: light.foreground, mu: light.mutedForeground, ln: light.border,
      });
    }
  });

  test("one colour that is not #rrggbb drops all four, never the accent", () => {
    for (const key of Object.keys(card) as (keyof typeof card)[]) {
      const ac = build({ primary: "#B5573A", tint: "#F5EAE4", card: { ...card, [key]: "rgba(0,0,0,0.5)" } }).ac;
      expect(ac).toEqual({ p: "#B5573A", t: "#F5EAE4" });
    }
  });

  test("without a valid accent nothing is sent, card colours included", () => {
    expect(accentJson({ primary: "blue", tint: "#F5EAE4", card })).toBeUndefined();
    expect(accentJson(undefined)).toBeUndefined();
  });

  test("a different style is a different snapshot, so the widget is redrawn", () => {
    const styles = STYLE_IDS.map(style => JSON.stringify(build(widgetAccent("violet", style))));
    expect(new Set(styles).size).toBe(STYLE_IDS.length);
  });
});
