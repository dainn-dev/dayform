
/**
 * App color tokens. Recolor these to brand the app — every screen and component
 * reads from here via `useColors()` (see `hooks/use-colors.ts`), so changing a
 * value here updates the whole app in both light and dark mode.
 *
 * The token names mirror the web app's design tokens (`packages/web/src/web/styles.css`)
 * so the two platforms share one vocabulary: `background`, `foreground`, `card`,
 * `primary`, `muted`, `border`, etc. Values are plain hex/rgba strings — React
 * Native's StyleSheet does not support CSS color functions like `oklch()`.
 */
const light = {
  background: "#F8F9FC",
  foreground: "#20263D",
  card: "#FFFFFF",
  cardForeground: "#20263D",
  primary: "#6565E8",
  primaryForeground: "#FFFFFF",
  secondary: "#F0F1FF",
  secondaryForeground: "#494E85",
  muted: "#F1F3F8",
  mutedForeground: "#8B94A8",
  accent: "#EDEEFF",
  accentForeground: "#5959D5",
  border: "#E9ECF3",
  destructive: "#D95E65",
  success: "#56B698",
  warning: "#D98357",

  // --- Dayform tokens ---
  /** Text/icons drawn on top of `primary` (or an accent fill). */
  onPrimary: "#FFFFFF",
  sun: "#E9B75D",
  /** Trailing "." after big titles. */
  punctuation: "#A5A9B7",
  /** Violet tints, lightest to strongest. */
  primarySoft: "#F0F0FF",
  primaryTint: "#EEEEFF",
  primaryTintStrong: "#ECECFF",
  primaryBorder: "#D8D8FF",
  titleDot: "#AAAFF6",
  countText: "#7777E7",
  emptyIcon: "#B2B2F8",
  emptyBg: "#F8F8FF",
  /** Progress track, tab bar border. */
  track: "#F0F1F6",
  hairline: "#F0F1F5",
  statDivider: "#EFF0F5",
  inputBorder: "#EDF0F5",
  /** Card / panel / button shadows. */
  shadowSoft: "#515B83",
  scrim: "rgba(14, 17, 36, 0.45)",
  shadowPanel: "#59627E",
  fabShadow: "#6868EC",
  /** "Live" indicators: the dot beside DAILY TIMELINE and the now line. */
  live: "#69C5A9",
  nowLine: "#6DC5A8",
  /** Secondary text shades. */
  hourLabel: "#A4ABBA",
  eventMeta: "#74809A",
  cardMeta: "#758096",
  statLabel: "#9CA4B5",
  dateLabel: "#A0A8B8",
  emptyText: "#9098A9",
  labelText: "#8992A5",
  placeholder: "#A5ADBC",
  checkBorder: "#AEB7C8",
  /** Overlap / conflict hints. */
  overlapText: "#AD6E48",
  conflictText: "#A86440",
  /** Error and warning tints. */
  errorBg: "#FFF0E9",
  errorIcon: "#BD614F",
  errorBannerText: "#9C5547",
  errorMessage: "#A45847",
  errorLabel: "#C4555B",
  deleteText: "#CF6570",
  warningBg: "#FFF0E8",
  warningIcon: "#B5663F",
  warningText: "#945837",
  /** Teal group badge on the Tasks tab. */
  tealTint: "#E9F7F3",
  tealAccent: "#4CAE9B",
  /** Language switch segmented control. */
  segmentBg: "#EEEEFA",
  segmentText: "#8589A8",
  /** Switch component. */
  switchTrackOff: "#DFE2EB",
  switchTrackOn: "#AAAAF6",
  /** Category tints (icons come from `categoryStyle` in lib/planner.ts). */
  category: {
    Focus: { bg: "#E9EEFF", accent: "#5A78DD" },
    Work: { bg: "#EBF7F5", accent: "#4BB3A4" },
    Personal: { bg: "#FFF3E8", accent: "#EDAA6A" },
    Wellness: { bg: "#FCECF0", accent: "#E38AA5" },
    // Custom category color slots (lib/categories.ts COLOR_SLOTS). Accent on tint is >= 3:1; see lib/theme-contrast.test.ts.
    violet: { bg: "#EEEBFF", accent: "#6A4FD6" },
    sky: { bg: "#E6F3FC", accent: "#1E78B4" },
    mint: { bg: "#E7F7EE", accent: "#1F8A5B" },
    lime: { bg: "#F1F7DF", accent: "#5F7F12" },
    amber: { bg: "#FFF4D9", accent: "#A66A00" },
    coral: { bg: "#FFEDE8", accent: "#CC4B32" },
    magenta: { bg: "#FBE9F7", accent: "#B8329A" },
    slate: { bg: "#EDF0F5", accent: "#5A6783" },
  },
};

/** Every palette has exactly the keys of `light`. */
export type ThemeColors = typeof light;

/** Dayform night palette: deep ink/navy surfaces, lighter violet primary. Contrast is enforced by lib/theme-contrast.test.ts. */
const dark: ThemeColors = {
  background: "#0D1020",
  foreground: "#E8EAF6",
  card: "#161A2E",
  cardForeground: "#E8EAF6",
  primary: "#8A8AF4",
  primaryForeground: "#0D1020",
  secondary: "#1D2140",
  secondaryForeground: "#C9CCF0",
  muted: "#1B1F36",
  mutedForeground: "#9AA2BF",
  accent: "#23284A",
  accentForeground: "#B4B4FA",
  border: "#262B48",
  destructive: "#F07178",
  success: "#5FCFAE",
  warning: "#F0A070",

  onPrimary: "#0E1124",
  sun: "#F0C674",
  punctuation: "#5C6280",
  primarySoft: "#23274A",
  primaryTint: "#232748",
  primaryTintStrong: "#2B2F58",
  primaryBorder: "#3A3F74",
  titleDot: "#6E70D8",
  countText: "#A0A0F5",
  emptyIcon: "#6E70D8",
  emptyBg: "#1B1F38",
  track: "#242841",
  hairline: "#20243C",
  statDivider: "#242841",
  inputBorder: "#2A2F4C",
  shadowSoft: "#000000",
  scrim: "rgba(0, 0, 0, 0.6)",
  shadowPanel: "#000000",
  fabShadow: "#8A8AF4",
  live: "#5FD3B3",
  nowLine: "#62D0B0",
  hourLabel: "#6D7592",
  eventMeta: "#A3ACC6",
  cardMeta: "#A0A8C2",
  statLabel: "#8088A6",
  dateLabel: "#7B83A1",
  emptyText: "#8A92AF",
  labelText: "#98A0BC",
  placeholder: "#6A7290",
  checkBorder: "#4A5273",
  overlapText: "#F0A878",
  conflictText: "#EDA37A",
  errorBg: "#3A2220",
  errorIcon: "#F08A78",
  errorBannerText: "#F4B3A5",
  errorMessage: "#F4B3A5",
  errorLabel: "#F27C84",
  deleteText: "#F2858E",
  warningBg: "#382619",
  warningIcon: "#F0A070",
  warningText: "#F2BE9A",
  tealTint: "#17302C",
  tealAccent: "#5FCFB5",
  segmentBg: "#1D2140",
  segmentText: "#8E96B8",
  switchTrackOff: "#2E3352",
  switchTrackOn: "#5A5AC0",
  category: {
    Focus: { bg: "#1B2347", accent: "#8CA4F5" },
    Work: { bg: "#15302E", accent: "#5FCFC0" },
    Personal: { bg: "#3A2A1B", accent: "#F2BB82" },
    Wellness: { bg: "#3A1F2A", accent: "#F29AB5" },
    violet: { bg: "#231F45", accent: "#A594F7" },
    sky: { bg: "#14283A", accent: "#6DB8EE" },
    mint: { bg: "#14302A", accent: "#5AD3A0" },
    lime: { bg: "#26300F", accent: "#B5D34E" },
    amber: { bg: "#35290E", accent: "#F0C04A" },
    coral: { bg: "#3A2019", accent: "#F59A80" },
    magenta: { bg: "#36193A", accent: "#E78AD6" },
    slate: { bg: "#222834", accent: "#9AA8C4" },
  },
};

export const Colors = { light, dark } as const;

export type ColorScheme = keyof typeof Colors;
