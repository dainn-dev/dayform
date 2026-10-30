import { ACCENT_SETS, type AccentId } from "../constants/accents";

/** The two colours the widget takes from the user's accent: the strong one (progress, times, badge text) and its tint (badge and next-row background). */
export type WidgetAccent = { primary: string; tint: string };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The accent of the Theme page as the widget draws it. The widget card is always light, so it uses the accent's light
 * colours whatever the app's own scheme is, and an unknown accent falls back to violet like the rest of the app.
 */
export function widgetAccent(accent: AccentId): WidgetAccent {
  const colors = (ACCENT_SETS[accent] ?? ACCENT_SETS.violet).light;
  return { primary: colors.primary, tint: colors.primaryTint };
}

/** True for a `#rrggbb` colour; anything else is left out of the snapshot so the widget keeps its own colours. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}
