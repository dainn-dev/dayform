/**
 * The four looks of the app (settings.style). Pure data, importable from tests; lib/design-theme.ts turns a style and a
 * scheme into the `Theme` the screens read through `useTheme()`.
 *
 * Each look is inspired by a family of public design-system write-ups (design-md/, not in the repo): only the spirit
 * is taken (colour relationships, type rhythm, corners, depth). No brand name, logo or proprietary font is used; every
 * font is an OFL font shipped in assets/fonts with full Vietnamese coverage.
 *
 * - dayform   : the original calm periwinkle planner (design.md), soft shadows, round corners.
 * - paper     : warm editorial: cream paper, serif headings, terracotta, hairlines instead of shadows.
 * - precision : dark-first and dense: near-black surfaces, one lavender-blue accent, 1px borders, small corners.
 * - minimal   : clean white, black pill actions, bold sans headings, light borders.
 */
import type { StyleId } from "../lib/settings";

export type FontWeightName = "regular" | "medium" | "semibold" | "bold" | "heavy";
export const FONT_WEIGHTS: Record<FontWeightName, "400" | "500" | "600" | "700" | "800"> = {
  regular: "400", medium: "500", semibold: "600", bold: "700", heavy: "800",
};

/** A font family shipped in assets/fonts and the weights it has (a missing weight uses the nearest lighter one). */
export type FontFamilyId = "BeVietnamPro" | "Inter" | "Newsreader" | "JetBrainsMono";
export const FONT_FAMILY_WEIGHTS: Record<FontFamilyId, readonly FontWeightName[]> = {
  BeVietnamPro: ["regular", "medium", "semibold", "bold", "heavy"],
  Inter: ["regular", "medium", "semibold", "bold"],
  Newsreader: ["regular", "medium", "semibold"],
  JetBrainsMono: ["regular", "semibold"],
};

/**
 * Text roles, largest to smallest. Map an old size to a role by its use, roughly:
 * hero 36+ (big numbers), display 26..31 (greeting, page hero), headline 20..24 (screen and sheet titles),
 * title 17..19 (card titles), subtitle 15..16 (task titles, row titles), body 14 (running text), label 13 (buttons,
 * chips, field labels), meta 12 (secondary lines), caption 11 (small notes, badges), micro 10 and under (eyebrows,
 * tiny counters; upper case in some styles), mono (terminal, codes).
 */
export const TEXT_ROLES = ["hero", "display", "headline", "title", "subtitle", "body", "label", "meta", "caption", "micro", "mono"] as const;
export type TextRole = (typeof TEXT_ROLES)[number];

export type TypeSpec = {
  family: FontFamilyId;
  weight: FontWeightName;
  size: number;
  /** Line height in px. */
  line: number;
  /** Letter spacing in px. */
  tracking: number;
  upper?: boolean;
};

export type Radii = { xs: number; sm: number; md: number; lg: number; xl: number; pill: number };

export type Depth = "shadow" | "border";

/** The few colours a style is built from; lib/design-theme.ts derives the full `ThemeColors` from them. */
export type PaletteSeed = {
  background: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  onPrimary: string;
  border: string;
  hairline: string;
  destructive: string;
  success: string;
  warning: string;
  live: string;
  sun: string;
  /** Shadow colour of cards and panels (ignored where the style draws borders). */
  shadow: string;
  scrim: string;
  /** Category accents of the four built-in ids and the eight custom slots (bg is mixed from the accent and the card). */
  categoryAccents: Record<string, string>;
  /** How much of the accent goes into a category or cycle tint (0..1). */
  tintAmount: number;
  cycleAccents: Record<"period" | "predicted" | "fertile" | "safe", string>;
};

export type StyleSpec = {
  id: StyleId;
  /** English name (translation key). Our own words, never a brand name. */
  label: string;
  /** One-line English description (translation key) for the style picker. */
  description: string;
  /** Only "dayform" keeps its hand-tuned palettes (constants/palettes.ts) and lets the accent sets apply. */
  seeds: { light: PaletteSeed; dark: PaletteSeed } | null;
  type: Record<TextRole, TypeSpec>;
  radius: Radii;
  /** Horizontal page gutter in px. */
  gutter: number;
  /** "shadow" lifts cards with a soft shadow, "border" draws a 1px line instead. */
  depth: Depth;
  /** Primary buttons: a pill, or the `md` corner. */
  buttonShape: "pill" | "rounded";
  /** Big titles end with a coloured "." (the original Dayform touch). */
  titlePunctuation: boolean;
};

const sans = (family: FontFamilyId) => (weight: FontWeightName, size: number, line: number, tracking = 0, upper = false): TypeSpec =>
  ({ family, weight, size, line, tracking, ...(upper ? { upper } : {}) });
const vn = sans("BeVietnamPro");
const inter = sans("Inter");
const serif = sans("Newsreader");
const mono = sans("JetBrainsMono")("regular", 13, 19);

// Strong category accents for light surfaces (>= 3:1 on their own tint); dark surfaces use lighter ones.
const LIGHT_CATEGORY = {
  Focus: "#4B63C8", Work: "#23806F", Personal: "#B0611C", Wellness: "#BB4A74",
  violet: "#6A4FD6", sky: "#1E78B4", mint: "#1F8A5B", lime: "#5F7F12",
  amber: "#A66A00", coral: "#CC4B32", magenta: "#B8329A", slate: "#5A6783",
};
const DARK_CATEGORY = {
  Focus: "#8CA4F5", Work: "#5FCFC0", Personal: "#F2BB82", Wellness: "#F29AB5",
  violet: "#A594F7", sky: "#6DB8EE", mint: "#5AD3A0", lime: "#B5D34E",
  amber: "#F0C04A", coral: "#F59A80", magenta: "#E78AD6", slate: "#9AA8C4",
};
const LIGHT_CYCLE = { period: "#C0304F", predicted: "#B24A66", fertile: "#0F7391", safe: "#2A7A4B" };
const DARK_CYCLE = { period: "#F28BA2", predicted: "#E48AA3", fertile: "#6CC6E4", safe: "#6FD08F" };

export const STYLES: Record<StyleId, StyleSpec> = {
  dayform: {
    id: "dayform",
    label: "Dayform",
    description: "Calm periwinkle, soft shadows, round corners",
    seeds: null,
    type: {
      hero: vn("heavy", 40, 46, -1),
      display: vn("heavy", 30, 36, -0.6),
      headline: vn("heavy", 22, 28, -0.3),
      title: vn("bold", 18, 24, -0.2),
      subtitle: vn("bold", 15, 21),
      body: vn("regular", 14, 21),
      label: vn("bold", 13, 18),
      meta: vn("semibold", 12, 17),
      caption: vn("semibold", 11, 15),
      micro: vn("heavy", 10, 13, 1.5, true),
      mono,
    },
    radius: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 },
    gutter: 22,
    depth: "shadow",
    buttonShape: "rounded",
    titlePunctuation: true,
  },
  paper: {
    id: "paper",
    label: "Paper",
    description: "Warm cream paper, serif headings, terracotta",
    seeds: {
      light: {
        background: "#F4EFE6", card: "#FBF9F4", foreground: "#1C1B19", mutedForeground: "#66635C",
        primary: "#B5573A", onPrimary: "#FFFFFF", border: "#E2DACD", hairline: "#EAE3D7",
        destructive: "#B23A3A", success: "#3F8A55", warning: "#B7791F", live: "#3F8A55", sun: "#C9912F",
        shadow: "#5A4A3A", scrim: "rgba(28, 24, 20, 0.42)",
        categoryAccents: LIGHT_CATEGORY, tintAmount: 0.13, cycleAccents: LIGHT_CYCLE,
      },
      dark: {
        background: "#181715", card: "#22201D", foreground: "#F5F1EA", mutedForeground: "#A9A49A",
        primary: "#E39575", onPrimary: "#1A1210", border: "#36322C", hairline: "#2C2925",
        destructive: "#EE8277", success: "#7BC890", warning: "#E8B062", live: "#7BC890", sun: "#E8B062",
        shadow: "#000000", scrim: "rgba(0, 0, 0, 0.6)",
        categoryAccents: DARK_CATEGORY, tintAmount: 0.16, cycleAccents: DARK_CYCLE,
      },
    },
    type: {
      hero: serif("medium", 44, 50, -1),
      display: serif("medium", 32, 38, -0.6),
      headline: serif("medium", 25, 31, -0.3),
      title: serif("semibold", 19, 25, -0.1),
      subtitle: inter("semibold", 15, 21, -0.1),
      body: inter("regular", 14, 21),
      label: inter("semibold", 13, 18),
      meta: inter("medium", 12, 17),
      caption: inter("medium", 11, 15),
      micro: inter("semibold", 10, 13, 1.4, true),
      mono,
    },
    radius: { xs: 4, sm: 8, md: 12, lg: 14, xl: 18, pill: 999 },
    gutter: 22,
    depth: "border",
    buttonShape: "rounded",
    titlePunctuation: false,
  },
  precision: {
    id: "precision",
    label: "Precision",
    description: "Dark and dense, one blue accent, thin lines",
    seeds: {
      light: {
        background: "#F7F8F8", card: "#FFFFFF", foreground: "#0B0C0E", mutedForeground: "#5E636B",
        primary: "#5161C9", onPrimary: "#FFFFFF", border: "#E3E4E7", hairline: "#ECEDEF",
        destructive: "#C93F3F", success: "#1F8A3B", warning: "#B26A12", live: "#1F8A3B", sun: "#B8860B",
        shadow: "#000000", scrim: "rgba(8, 9, 10, 0.45)",
        categoryAccents: LIGHT_CATEGORY, tintAmount: 0.1, cycleAccents: LIGHT_CYCLE,
      },
      dark: {
        background: "#08090A", card: "#111214", foreground: "#F7F8F8", mutedForeground: "#8F949C",
        primary: "#7480E6", onPrimary: "#08090A", border: "#24262B", hairline: "#1A1B1E",
        destructive: "#F07A7A", success: "#4CC46A", warning: "#E8A64C", live: "#4CC46A", sun: "#E8B84C",
        shadow: "#000000", scrim: "rgba(0, 0, 0, 0.65)",
        categoryAccents: DARK_CATEGORY, tintAmount: 0.14, cycleAccents: DARK_CYCLE,
      },
    },
    type: {
      hero: inter("semibold", 36, 42, -1.2),
      display: inter("semibold", 26, 32, -0.7),
      headline: inter("semibold", 20, 26, -0.4),
      title: inter("semibold", 16, 22, -0.2),
      subtitle: inter("medium", 14, 20, -0.1),
      body: inter("regular", 14, 20),
      label: inter("medium", 13, 18),
      meta: inter("medium", 12, 16),
      caption: inter("medium", 11, 15),
      micro: inter("semibold", 10, 13, 0.8, true),
      mono,
    },
    radius: { xs: 4, sm: 6, md: 8, lg: 10, xl: 14, pill: 999 },
    gutter: 16,
    depth: "border",
    buttonShape: "rounded",
    titlePunctuation: false,
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Clean white, black pill buttons, bold headings",
    seeds: {
      light: {
        background: "#F8F9FA", card: "#FFFFFF", foreground: "#111111", mutedForeground: "#646B78",
        primary: "#111111", onPrimary: "#FFFFFF", border: "#E5E7EB", hairline: "#F0F1F3",
        destructive: "#D23C3C", success: "#0E8A5F", warning: "#B86E00", live: "#10B981", sun: "#E0A100",
        shadow: "#111111", scrim: "rgba(17, 17, 17, 0.42)",
        categoryAccents: LIGHT_CATEGORY, tintAmount: 0.11, cycleAccents: LIGHT_CYCLE,
      },
      dark: {
        background: "#0B0B0C", card: "#161618", foreground: "#F4F4F5", mutedForeground: "#A1A1AA",
        primary: "#F4F4F5", onPrimary: "#111111", border: "#2A2A2E", hairline: "#1F1F22",
        destructive: "#F87171", success: "#34D399", warning: "#FBBF24", live: "#34D399", sun: "#FBBF24",
        shadow: "#000000", scrim: "rgba(0, 0, 0, 0.6)",
        categoryAccents: DARK_CATEGORY, tintAmount: 0.15, cycleAccents: DARK_CYCLE,
      },
    },
    type: {
      hero: vn("heavy", 40, 46, -1.4),
      display: vn("bold", 28, 34, -0.9),
      headline: vn("bold", 22, 28, -0.5),
      title: vn("bold", 17, 23, -0.2),
      subtitle: vn("semibold", 15, 21, -0.1),
      body: vn("regular", 14, 21),
      label: vn("semibold", 13, 18),
      meta: vn("medium", 12, 17),
      caption: vn("medium", 11, 15),
      micro: vn("bold", 10, 13, 1.2, true),
      mono,
    },
    radius: { xs: 4, sm: 8, md: 10, lg: 12, xl: 16, pill: 999 },
    gutter: 20,
    depth: "border",
    buttonShape: "pill",
    titlePunctuation: false,
  },
};

/** Shared 4-point spacing scale. */
export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
