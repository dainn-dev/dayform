/**
 * The design theme: one object with every visual token a screen needs (colours, text roles, font weights, corners,
 * spacing, depth). Pure and memoised; `hooks/use-theme.ts` feeds it the user's style, scheme, accent and whether the
 * fonts have loaded.
 *
 * Rules for screens:
 * - colours: `theme.colors.*` (same keys as before, so `useColors()` keeps working);
 * - text: spread a role, `...t.type.body`, then override the weight with `...t.font.bold` if needed, never a raw
 *   `fontSize` / `fontWeight`; a serif role (Paper headings) must not get a `t.font.*` override (that is the sans);
 * - corners: `t.radius.sm | md | lg | xl | pill`; spacing: `t.space.*` and `t.gutter`;
 * - cards and panels: spread `t.elevation.card` (a shadow or a 1px border, depending on the style).
 */
import { applyAccent } from "../constants/accents";
import { Colors, type ColorScheme, type ThemeColors } from "../constants/palettes";
import {
  FONT_FAMILY_WEIGHTS, FONT_WEIGHTS, SPACE, STYLES, TEXT_ROLES,
  type FontFamilyId, type FontWeightName, type PaletteSeed, type Radii, type StyleSpec, type TextRole, type TypeSpec,
} from "../constants/styles";
import { mix } from "./color-tint";
import { STYLE_IDS, type AccentId, type StyleId } from "./settings";

export type FontFace = { fontFamily?: string; fontWeight?: "400" | "500" | "600" | "700" | "800" };
export type TextToken = FontFace & {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: "uppercase";
};

/** React Native view style fragment for depth (shadow or border). */
export type ElevationToken = {
  borderWidth?: number;
  borderColor?: string;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffset?: { width: number; height: number };
  elevation?: number;
};

export type Theme = {
  style: StyleId;
  scheme: ColorScheme;
  colors: ThemeColors;
  type: Record<TextRole, TextToken>;
  /** Weights of the style's body family; spread after a text role to change only the weight. */
  font: Record<FontWeightName, FontFace>;
  radius: Radii;
  space: typeof SPACE;
  gutter: number;
  elevation: { none: ElevationToken; card: ElevationToken; raised: ElevationToken; overlay: ElevationToken };
  /** Corner radius of a primary button. */
  buttonRadius: number;
  titlePunctuation: boolean;
  /** True when this style lets the accent sets recolour it (only "dayform"). */
  accentable: boolean;
};

/** Font family name registered with expo-font for a shipped file (hooks/use-app-fonts.ts uses the same names). */
export function fontFileName(family: FontFamilyId, weight: FontWeightName): string {
  return `${family}-${FONT_WEIGHTS[weight]}`;
}

/** The face for a family and weight: the shipped file when fonts are ready, else the system font at that weight. */
export function fontFace(family: FontFamilyId, weight: FontWeightName, fontsReady: boolean): FontFace {
  // Without the files the system font stands in; the mono family must still be monospaced (terminal output, codes).
  // "monospace" is Android's generic name, which is the platform this app ships on.
  if (!fontsReady) return family === "JetBrainsMono" ? { fontFamily: "monospace", fontWeight: FONT_WEIGHTS[weight] } : { fontWeight: FONT_WEIGHTS[weight] };
  const available = FONT_FAMILY_WEIGHTS[family];
  const order: FontWeightName[] = ["regular", "medium", "semibold", "bold", "heavy"];
  let pick = weight;
  for (let i = order.indexOf(weight); i >= 0; i--) {
    if (available.includes(order[i])) { pick = order[i]; break; }
  }
  // A custom family must not also carry a fontWeight: Android would then fall back to a synthesised face.
  return { fontFamily: fontFileName(family, pick) };
}

function textToken(spec: TypeSpec, fontsReady: boolean): TextToken {
  return {
    ...fontFace(spec.family, spec.weight, fontsReady),
    fontSize: spec.size,
    lineHeight: spec.line,
    letterSpacing: spec.tracking,
    ...(spec.upper ? { textTransform: "uppercase" as const } : {}),
  };
}

// --- Palettes ---------------------------------------------------------------------------------------------------

/** The full palette of a seeded style, derived by mixing; contrast is pinned by lib/design-theme.test.ts. */
export function derivePalette(seed: PaletteSeed, scheme: ColorScheme): ThemeColors {
  const { background: bg, card, foreground: fg, mutedForeground: muted, primary, onPrimary } = seed;
  const dark = scheme === "dark";
  const tint = (color: string, amount = seed.tintAmount) => ({ bg: mix(card, color, amount), accent: color });
  const primaryText = dark ? mix(primary, fg, 0.25) : mix(primary, fg, 0.2);
  const base = Colors[scheme];
  const category = Object.fromEntries(
    Object.keys(base.category).map(id => [id, tint(seed.categoryAccents[id] ?? base.category[id as keyof typeof base.category].accent)]),
  ) as ThemeColors["category"];
  const cycle = Object.fromEntries(
    (Object.keys(seed.cycleAccents) as Array<keyof PaletteSeed["cycleAccents"]>).map(kind => [kind, tint(seed.cycleAccents[kind], seed.tintAmount * 0.9)]),
  ) as ThemeColors["cycle"];
  return {
    background: bg,
    foreground: fg,
    card,
    cardForeground: fg,
    primary,
    primaryForeground: onPrimary,
    secondary: mix(card, primary, 0.08),
    secondaryForeground: primaryText,
    muted: mix(card, fg, dark ? 0.06 : 0.04),
    mutedForeground: muted,
    accent: mix(card, primary, 0.1),
    accentForeground: primaryText,
    border: seed.border,
    destructive: seed.destructive,
    success: seed.success,
    warning: seed.warning,

    onPrimary,
    sun: seed.sun,
    punctuation: mix(muted, card, 0.3),
    primarySoft: mix(card, primary, 0.07),
    primaryTint: mix(card, primary, 0.1),
    primaryTintStrong: mix(card, primary, 0.15),
    primaryBorder: mix(card, primary, 0.3),
    titleDot: mix(card, primary, 0.5),
    countText: primaryText,
    emptyIcon: mix(card, primary, 0.45),
    emptyBg: mix(card, primary, 0.04),
    track: mix(card, fg, dark ? 0.1 : 0.07),
    hairline: seed.hairline,
    statDivider: seed.hairline,
    inputBorder: seed.border,
    shadowSoft: seed.shadow,
    scrim: seed.scrim,
    shadowPanel: seed.shadow,
    fabShadow: dark ? "#000000" : primary,
    live: seed.live,
    nowLine: seed.live,
    hourLabel: mix(muted, card, 0.2),
    eventMeta: mix(muted, fg, 0.25),
    cardMeta: mix(muted, fg, 0.3),
    statLabel: muted,
    dateLabel: muted,
    emptyText: muted,
    labelText: muted,
    placeholder: mix(muted, card, 0.3),
    checkBorder: mix(muted, card, 0.25),
    overlapText: mix(seed.warning, fg, dark ? 0.2 : 0.45),
    conflictText: mix(seed.warning, fg, dark ? 0.2 : 0.45),
    errorBg: mix(card, seed.destructive, dark ? 0.16 : 0.09),
    errorIcon: seed.destructive,
    errorBannerText: mix(seed.destructive, fg, dark ? 0.35 : 0.4),
    errorMessage: mix(seed.destructive, fg, dark ? 0.35 : 0.4),
    errorLabel: seed.destructive,
    deleteText: seed.destructive,
    warningBg: mix(card, seed.warning, dark ? 0.16 : 0.1),
    warningIcon: seed.warning,
    warningText: mix(seed.warning, fg, dark ? 0.3 : 0.5),
    tealTint: mix(card, seed.success, dark ? 0.16 : 0.1),
    tealAccent: dark ? seed.success : mix(seed.success, fg, 0.15),
    segmentBg: mix(card, fg, dark ? 0.08 : 0.05),
    segmentText: muted,
    switchTrackOff: mix(card, fg, dark ? 0.2 : 0.14),
    switchTrackOn: mix(card, primary, 0.55),
    category,
    cycle,
  };
}

const paletteCache = new Map<string, ThemeColors>();

/** The palette of a style and scheme; the accent only applies to the original style. Memoised. */
export function stylePalette(style: StyleId, scheme: ColorScheme, accent: AccentId = "violet"): ThemeColors {
  const spec = STYLES[style] ?? STYLES.dayform;
  if (!spec.seeds) return applyAccent(Colors[scheme], accent);
  const key = `${spec.id}|${scheme}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const palette = derivePalette(spec.seeds[scheme], scheme);
  paletteCache.set(key, palette);
  return palette;
}

// --- Theme ------------------------------------------------------------------------------------------------------

function elevations(spec: StyleSpec, colors: ThemeColors, scheme: ColorScheme): Theme["elevation"] {
  const dark = scheme === "dark";
  if (spec.depth === "border") {
    const line = { borderWidth: 1, borderColor: colors.border };
    return {
      none: {},
      card: line,
      raised: { ...line, shadowColor: colors.shadowPanel, shadowOpacity: dark ? 0.4 : 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
      overlay: { ...line, shadowColor: colors.shadowPanel, shadowOpacity: dark ? 0.5 : 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
    };
  }
  return {
    none: {},
    card: { shadowColor: colors.shadowSoft, shadowOpacity: dark ? 0.35 : 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
    raised: { shadowColor: colors.shadowPanel, shadowOpacity: dark ? 0.45 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
    overlay: { shadowColor: colors.shadowPanel, shadowOpacity: dark ? 0.55 : 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  };
}

const themeCache = new Map<string, Theme>();

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && (STYLE_IDS as readonly string[]).includes(value);
}

/** The whole theme. Memoised, so the same inputs always return the same object (safe as a `useMemo` dependency). */
export function buildTheme(style: StyleId, scheme: ColorScheme, accent: AccentId, fontsReady: boolean): Theme {
  const id: StyleId = isStyleId(style) ? style : "dayform";
  const spec = STYLES[id];
  const accentKey = spec.seeds ? "-" : accent;
  const key = `${id}|${scheme}|${accentKey}|${fontsReady ? 1 : 0}`;
  const cached = themeCache.get(key);
  if (cached) return cached;
  const colors = stylePalette(id, scheme, accent);
  const bodyFamily = spec.type.body.family;
  const theme: Theme = {
    style: id,
    scheme,
    colors,
    type: Object.fromEntries(TEXT_ROLES.map(role => [role, textToken(spec.type[role], fontsReady)])) as Record<TextRole, TextToken>,
    font: {
      regular: fontFace(bodyFamily, "regular", fontsReady),
      medium: fontFace(bodyFamily, "medium", fontsReady),
      semibold: fontFace(bodyFamily, "semibold", fontsReady),
      bold: fontFace(bodyFamily, "bold", fontsReady),
      heavy: fontFace(bodyFamily, "heavy", fontsReady),
    },
    radius: spec.radius,
    space: SPACE,
    gutter: spec.gutter,
    elevation: elevations(spec, colors, scheme),
    buttonRadius: spec.buttonShape === "pill" ? spec.radius.pill : spec.radius.md,
    titlePunctuation: spec.titlePunctuation,
    accentable: spec.seeds === null,
  };
  themeCache.set(key, theme);
  return theme;
}

/** Every font file name any style uses (hooks/use-app-fonts.ts must register exactly these). */
export function usedFontFiles(): string[] {
  const names = new Set<string>();
  for (const id of STYLE_IDS) {
    const spec = STYLES[id];
    for (const role of TEXT_ROLES) {
      const face = fontFace(spec.type[role].family, spec.type[role].weight, true);
      if (face.fontFamily) names.add(face.fontFamily);
    }
    for (const weight of Object.keys(FONT_WEIGHTS) as FontWeightName[]) {
      const face = fontFace(spec.type.body.family, weight, true);
      if (face.fontFamily) names.add(face.fontFamily);
    }
  }
  return [...names].sort();
}
