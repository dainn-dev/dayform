import { Colors, type ColorScheme, type ThemeColors } from "./palettes";
import { ACCENT_IDS, type AccentId } from "../lib/settings";

export { ACCENT_IDS, type AccentId };

/**
 * Palette keys that derive from the primary hue. An accent set overrides exactly these keys; every other token
 * (surfaces, text, status and category colors) is shared by all accents.
 */
export const ACCENT_KEYS = [
  "primary", "primaryForeground", "onPrimary", "secondary", "secondaryForeground", "accent", "accentForeground",
  "primarySoft", "primaryTint", "primaryTintStrong", "primaryBorder", "titleDot", "countText", "emptyIcon", "emptyBg",
  "fabShadow", "segmentBg", "segmentText", "switchTrackOn",
] as const satisfies ReadonlyArray<keyof ThemeColors>;

export type AccentKey = (typeof ACCENT_KEYS)[number];
export type AccentOverrides = Record<AccentKey, string>;
export type AccentSet = Record<ColorScheme, AccentOverrides>;

function pickAccentKeys(palette: ThemeColors): AccentOverrides {
  return Object.fromEntries(ACCENT_KEYS.map(key => [key, palette[key]])) as AccentOverrides;
}

/**
 * Violet is the Dayform/DAINN brand and is read from the base palettes, so it can never drift from them.
 * The other sets are derived from one primary per scheme: tints mix it into the surface, text shades mix it
 * toward ink or white. Contrast of every set is enforced by lib/accents-contrast.test.ts.
 */
export const ACCENT_SETS: Record<AccentId, AccentSet> = {
  violet: { light: pickAccentKeys(Colors.light), dark: pickAccentKeys(Colors.dark) },
  ocean: {
    light: {
      primary: "#2F67D8",
      primaryForeground: "#FFFFFF",
      onPrimary: "#FFFFFF",
      secondary: "#F0F4FC",
      secondaryForeground: "#274383",
      accent: "#EDF2FC",
      accentForeground: "#295BBE",
      primarySoft: "#ECF1FB",
      primaryTint: "#EDF2FC",
      primaryTintStrong: "#EAF0FB",
      primaryBorder: "#CBD9F5",
      titleDot: "#8DABEA",
      countText: "#4476DC",
      emptyIcon: "#9DB8ED",
      emptyBg: "#F7F9FD",
      fabShadow: "#2F67D8",
      segmentBg: "#E2E7F3",
      segmentText: "#284A92",
      switchTrackOn: "#8DABEA",
    },
    dark: {
      primary: "#7AA8FF",
      primaryForeground: "#0D1020",
      onPrimary: "#0E1124",
      secondary: "#1B243D",
      secondaryForeground: "#CCDEFF",
      accent: "#222D4A",
      accentForeground: "#AAC7FF",
      primarySoft: "#222D4A",
      primaryTint: "#222D4A",
      primaryTintStrong: "#283658",
      primaryBorder: "#364A75",
      titleDot: "#6287CE",
      countText: "#8EB5FF",
      emptyIcon: "#6287CE",
      emptyBg: "#192139",
      fabShadow: "#7AA8FF",
      segmentBg: "#1B243D",
      segmentText: "#859ED8",
      switchTrackOn: "#5777B8",
    },
  },
  lagoon: {
    light: {
      primary: "#0E7C86",
      primaryForeground: "#FFFFFF",
      onPrimary: "#FFFFFF",
      secondary: "#EEF6F7",
      secondaryForeground: "#184D5E",
      accent: "#EBF4F5",
      accentForeground: "#0C6D76",
      primarySoft: "#E9F3F4",
      primaryTint: "#EBF4F5",
      primaryTintStrong: "#E7F2F3",
      primaryBorder: "#C3DEE1",
      titleDot: "#7AB7BC",
      countText: "#268992",
      emptyIcon: "#8EC1C6",
      emptyBg: "#F5FAFA",
      fabShadow: "#0E7C86",
      segmentBg: "#E0E9ED",
      segmentText: "#165565",
      switchTrackOn: "#7AB7BC",
    },
    dark: {
      primary: "#4FD1C5",
      primaryForeground: "#0D1020",
      onPrimary: "#0E1124",
      secondary: "#162935",
      secondaryForeground: "#BCEEE9",
      accent: "#1A353F",
      accentForeground: "#8EE2DA",
      primarySoft: "#1A353F",
      primaryTint: "#1A353F",
      primaryTintStrong: "#1E4049",
      primaryBorder: "#26595F",
      titleDot: "#40A7A1",
      countText: "#69D8CE",
      emptyIcon: "#40A7A1",
      emptyBg: "#142532",
      fabShadow: "#4FD1C5",
      segmentBg: "#162935",
      segmentText: "#72B1BE",
      switchTrackOn: "#3A9390",
    },
  },
  forest: {
    light: {
      primary: "#1A7F52",
      primaryForeground: "#FFFFFF",
      onPrimary: "#FFFFFF",
      secondary: "#EFF6F3",
      secondaryForeground: "#1D4E46",
      accent: "#ECF4F0",
      accentForeground: "#177048",
      primarySoft: "#EAF3EF",
      primaryTint: "#ECF4F0",
      primaryTintStrong: "#E8F2EE",
      primaryBorder: "#C6DFD4",
      titleDot: "#81B9A0",
      countText: "#318C63",
      emptyIcon: "#93C3AE",
      emptyBg: "#F6FAF8",
      fabShadow: "#1A7F52",
      segmentBg: "#E1E9EA",
      segmentText: "#1D5749",
      switchTrackOn: "#81B9A0",
    },
    dark: {
      primary: "#5CCB8F",
      primaryForeground: "#0D1020",
      onPrimary: "#0E1124",
      secondary: "#17282E",
      secondaryForeground: "#C1EBD4",
      accent: "#1C3435",
      accentForeground: "#97DEB7",
      primarySoft: "#1C3435",
      primaryTint: "#1C3435",
      primaryTintStrong: "#213F3C",
      primaryBorder: "#2B574A",
      titleDot: "#4BA277",
      countText: "#74D3A0",
      emptyIcon: "#4BA277",
      emptyBg: "#16252C",
      fabShadow: "#5CCB8F",
      segmentBg: "#17282E",
      segmentText: "#78AEA6",
      switchTrackOn: "#438F6B",
    },
  },
  sunset: {
    light: {
      primary: "#BD530A",
      primaryForeground: "#FFFFFF",
      onPrimary: "#FFFFFF",
      secondary: "#FAF3EE",
      secondaryForeground: "#673A26",
      accent: "#F9F0EA",
      accentForeground: "#A64909",
      primarySoft: "#F9F0E9",
      primaryTint: "#F9F0EA",
      primaryTintStrong: "#F8EEE7",
      primaryBorder: "#EFD4C2",
      titleDot: "#DBA078",
      countText: "#C46423",
      emptyIcon: "#E0AE8C",
      emptyBg: "#FCF8F5",
      fabShadow: "#BD530A",
      segmentBg: "#ECE6E5",
      segmentText: "#763F21",
      switchTrackOn: "#DBA078",
    },
    dark: {
      primary: "#F5A25D",
      primaryForeground: "#0D1020",
      onPrimary: "#0E1124",
      secondary: "#2B2328",
      secondaryForeground: "#FBDCC1",
      accent: "#392C2C",
      accentForeground: "#F9C397",
      primarySoft: "#392C2C",
      primaryTint: "#392C2C",
      primaryTintStrong: "#47352F",
      primaryBorder: "#654737",
      titleDot: "#C28250",
      countText: "#F7B075",
      emptyIcon: "#C28250",
      emptyBg: "#272027",
      fabShadow: "#F5A25D",
      segmentBg: "#2B2328",
      segmentText: "#BC9B8F",
      switchTrackOn: "#AB7349",
    },
  },
  blossom: {
    light: {
      primary: "#CB3A6E",
      primaryForeground: "#FFFFFF",
      onPrimary: "#FFFFFF",
      secondary: "#FBF1F5",
      secondaryForeground: "#6D2F53",
      accent: "#FBEEF3",
      accentForeground: "#B33361",
      primarySoft: "#FAEDF2",
      primaryTint: "#FBEEF3",
      primaryTintStrong: "#FAEBF1",
      primaryBorder: "#F2CEDB",
      titleDot: "#E293AF",
      countText: "#D04E7D",
      emptyIcon: "#E7A2BB",
      emptyBg: "#FDF7F9",
      fabShadow: "#CB3A6E",
      segmentBg: "#EDE4EC",
      segmentText: "#7E3158",
      switchTrackOn: "#E293AF",
    },
    dark: {
      primary: "#F58DB0",
      primaryForeground: "#0D1020",
      onPrimary: "#0E1124",
      secondary: "#2B2033",
      secondaryForeground: "#FBD4E1",
      accent: "#39283B",
      accentForeground: "#F9B6CC",
      primarySoft: "#39283B",
      primaryTint: "#39283B",
      primaryTintStrong: "#472F44",
      primaryBorder: "#654057",
      titleDot: "#C27290",
      countText: "#F79EBC",
      emptyIcon: "#C27290",
      emptyBg: "#271E30",
      fabShadow: "#F58DB0",
      segmentBg: "#2B2033",
      segmentText: "#BC92B4",
      switchTrackOn: "#AB6582",
    },
  },
};

export const ACCENT_LABELS: Record<AccentId, string> = {
  violet: "Violet",
  ocean: "Ocean",
  lagoon: "Lagoon",
  forest: "Forest",
  sunset: "Sunset",
  blossom: "Blossom",
};

const cache = new WeakMap<ThemeColors, Map<AccentId, ThemeColors>>();

function schemeOf(palette: ThemeColors): ColorScheme {
  return palette.background === Colors.dark.background ? "dark" : "light";
}

/**
 * Returns a new palette with the accent's overrides applied. Memoised per palette and accent, so the same
 * inputs always give the same reference (safe as a `useMemo` dependency).
 */
export function applyAccent(palette: ThemeColors, accent: AccentId): ThemeColors {
  const perAccent = cache.get(palette) ?? new Map<AccentId, ThemeColors>();
  cache.set(palette, perAccent);
  const cached = perAccent.get(accent);
  if (cached) return cached;
  const set = ACCENT_SETS[accent] ?? ACCENT_SETS.violet;
  const result: ThemeColors = { ...palette, ...set[schemeOf(palette)] };
  perAccent.set(accent, result);
  return result;
}
