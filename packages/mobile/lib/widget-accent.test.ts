import { describe, expect, test } from "bun:test";
import { ACCENT_IDS, ACCENT_SETS } from "../constants/accents";
import { buildWidgetSnapshot } from "./widget-snapshot";
import { isHexColor, widgetAccent } from "./widget-accent";

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
});

describe("the accent in the widget snapshot", () => {
  const build = (accent?: { primary: string; tint: string }) =>
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
