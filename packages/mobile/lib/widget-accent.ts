import { ACCENT_SETS, type AccentId } from "../constants/accents";
import { stylePalette } from "./design-theme";
import type { StyleId } from "./settings";

/** The light card colours of a style other than the original: surface, main text, muted text and the card's outline. */
export type WidgetCardColors = { background: string; foreground: string; muted: string; line: string };

/**
 * The colours the widget takes from the Theme page: the strong accent (progress, times, badge text), its tint (badge and
 * next-row background) and, for a style other than the original, that style's light card colours. Without `card` the
 * widget keeps the card colours of its own resources (the original look).
 */
export type WidgetAccent = { primary: string; tint: string; card?: WidgetCardColors };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The accent of the Theme page as the widget draws it. The widget card is always light, so it uses the accent's light
 * colours whatever the app's own scheme is (and, for a style other than the original, that style's light primary and
 * light card colours), and an unknown accent falls back to violet like the rest of the app.
 */
export function widgetAccent(accent: AccentId, style: StyleId = "dayform"): WidgetAccent {
  // Only the original style takes the accent sets and keeps the widget's own card; the other styles carry their own colours.
  if (style === "dayform") {
    const colors = (ACCENT_SETS[accent] ?? ACCENT_SETS.violet).light;
    return { primary: colors.primary, tint: colors.primaryTint };
  }
  const colors = stylePalette(style, "light");
  return {
    primary: colors.primary,
    tint: colors.primaryTint,
    card: { background: colors.card, foreground: colors.foreground, muted: colors.mutedForeground, line: colors.border },
  };
}

/** True for a `#rrggbb` colour; anything else is left out of the snapshot so the widget keeps its own colours. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** The `ac` object of the widget snapshot, or undefined when the accent is missing or not valid hex. */
export type WidgetAccentJson = { p: string; t: string; bg?: string; fg?: string; mu?: string; ln?: string };

/**
 * `p` / `t` are the accent; `bg` / `fg` / `mu` / `ln` the card colours, sent all together or not at all (one invalid
 * colour drops the four, so the widget never mixes a style's text with its own card).
 */
export function accentJson(accent: WidgetAccent | undefined): WidgetAccentJson | undefined {
  if (!accent || !isHexColor(accent.primary) || !isHexColor(accent.tint)) return undefined;
  const card = accent.card;
  const cardOk = card !== undefined && [card.background, card.foreground, card.muted, card.line].every(isHexColor);
  return {
    p: accent.primary,
    t: accent.tint,
    ...(cardOk ? { bg: card.background, fg: card.foreground, mu: card.muted, ln: card.line } : {}),
  };
}
