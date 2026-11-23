# Dayform: design system (v2, four styles)

The app has four looks the user picks on the Appearance page (`settings.style`). Every screen draws from one theme object,
so a screen is written once and follows all four styles, both schemes and the accent.

| Style | Spirit | Surfaces | Type | Corners / depth |
|---|---|---|---|---|
| `dayform` (default) | calm periwinkle planner, the original look | `#F8F9FC` / white cards, ink `#20263D`, violet `#6565E8`; takes the 6 accent sets | Be Vietnam Pro, heavy headings, coloured "." after big titles | 10–24, soft shadows |
| `paper` | warm editorial notebook | cream `#F4EFE6`, paper cards `#FBF9F4`, terracotta `#B5573A` | Newsreader serif for hero/display/headline/title, Inter for the rest | 8–18, 1px warm hairlines, no shadow on cards |
| `precision` | dark-first, dense tool | near-black `#08090A` / `#111214`, lavender-blue `#7480E6` (light: `#5161C9`) | Inter, tight negative tracking, medium weights | 6–14, 1px borders, 16px gutter |
| `minimal` | clean white SaaS | `#F8F9FA` / white, ink `#111111`, black pill buttons | Be Vietnam Pro bold headings | 8–16, light grey borders, pill buttons |

Inspired by public design-system write-ups (the untracked `design-md/` folder: claude, oura, linear.app, raycast, cal,
notion). Only the spirit is taken. No brand names, logos or proprietary fonts. Fonts are OFL files in
`packages/mobile/assets/fonts` (subset to Latin and Vietnamese, licences beside them), loaded at start by
`hooks/use-app-fonts.ts`. Until they load, or if loading fails, the system font is used at the same weights.

## Where things live

- `constants/styles.ts`: the four style specs (palette seeds, type scale, radii, gutter, depth, button shape). Pure data.
- `lib/design-theme.ts`: `buildTheme(style, scheme, accent, fontsReady)` (memoised) and `derivePalette` (the full
  `ThemeColors` mixed from a seed). Contrast of every seeded palette is pinned by `lib/design-theme.test.ts`, with no
  known gaps allowed. `dayform` keeps the hand-tuned `constants/palettes.ts` and its known gaps.
- `hooks/use-theme.ts`: `useTheme()` and `useThemedStyles(makeStyles)`. `useColors()` still works and returns
  `useTheme().colors`.
- `components/ui/`: `AppText`, `Title`, `Button`, `IconButton`, `Chip`, `Surface`, `Divider`, `SectionEyebrow`, `Collapsible`.

## Rules for screen code

1. **Styles come from the theme.** Write `const s = useThemedStyles(makeStyles)` with a module-level
   `const makeStyles = (t: Theme) => StyleSheet.create({...})`. Use `useTheme()` when you also need values in JSX.
   `Theme` is exported from `hooks/use-theme`.
2. **No raw `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing` / `fontFamily`.** Spread a text role:
   `title: { ...t.type.subtitle, color: t.colors.foreground }`. To change only the weight, spread `t.font.<weight>` after
   the role: `{ ...t.type.meta, ...t.font.bold }`. Never put a `t.font.*` on `hero`/`display`/`headline`/`title`, which
   are serif in Paper. Map old sizes by role, not by number:

   | old size | role | typical use |
   |---|---|---|
   | 36+ | `hero` | big numbers, timer |
   | 26–31 | `display` | greeting, page hero title |
   | 20–24 | `headline` | screen / sheet title |
   | 17–19 | `title` | card title, dialog title |
   | 15–16 | `subtitle` | task title, row title, emphasised line |
   | 14 | `body` | running text, inputs |
   | 13 | `label` | buttons, chips, field labels |
   | 12 | `meta` | secondary lines, times, durations |
   | 11 | `caption` | small notes, badges |
   | ≤10 | `micro` | eyebrows, tiny counters (upper case in Dayform/Paper/Precision/Minimal per spec) |
   | monospace | `mono` | SSH terminal, codes, fingerprints |

   An old style that also set a weight different from the role's keeps it with `...t.font.<weight>` (400 regular,
   500 medium, 600 semibold, 700 bold, 800 heavy). Drop `fontWeight` when the role's weight is close enough.
   **Exception:** fixed pixel geometry that something else depends on stays numeric (timeline hour height 64px/hour,
   38px minimum block, widget sizes, touch targets of 44dp). Text inside a measured box may keep a numeric `fontSize`
   only if a comment says why.
3. **Corners:** `t.radius.xs | sm | md | lg | xl | pill`. Rough map: ≤4 → xs, 6–10 → sm, 11–14 → md, 15–18 → lg,
   19–28 → xl, round (= size/2) stays computed. Primary buttons use `t.buttonRadius`.
4. **Depth:** a card or panel spreads `...t.elevation.card`. A floating thing (FAB, popover, mini player) uses
   `...t.elevation.raised`, and a sheet or dialog uses `...t.elevation.overlay`. Delete hand-written `shadow*` /
   `elevation` values. In the border styles the token draws a 1px `border` line. Don't add your own border on top of it.
5. **Spacing:** page side padding is `t.gutter`. Other paddings and gaps use `t.space.*` where the value matches (2, 4, 8,
   12, 16, 20, 24, 32). An odd value like 14 or 18 may stay when changing it would shift a layout. Don't churn spacing
   for its own sake.
6. **Colours:** `t.colors.*` only, never a hex literal (unchanged rule). In the bordered styles, tinted fills such as
   `primaryTint` become very light greys or creams. Use them, and don't special-case a style unless the look clearly
   breaks. `t.style === "dayform"` checks are allowed only for the Dayform-specific touches (title punctuation,
   violet tints behind icons).
7. **Prefer the kit** where a screen hand-draws the same thing: `Button` for text buttons, `Chip` for filter and choice
   chips, `Surface` for cards, `Title` for big page titles, `AppText` for one-off text. Don't rewrite a working
   component's structure just to use the kit. Behaviour, accessibility labels, touch targets and translations must stay
   exactly as they were.
8. **Strings:** every new visible string goes into the `vi` dictionary of the feature's `lib/i18n/*.ts` file. The English
   text is the key.
9. **No behaviour changes.** The redesign touches only how things look. Logic, data, navigation, gestures and
   timings stay as they are.

## Timeline (unchanged spec)

06:00–22:00 by default, 64px per hour, 38px minimum block height, side-by-side lanes for overlapping blocks with an
explicit "⚠ Overlap" label, and an outside-hours list. Blocks are tinted with the category colour (`category[id].bg`)
and have a 4px category accent edge. Tapping an empty hour opens the editor at that time.

## Widget

The card stays light in every style. It takes the style's light `primary` / `primaryTint`, or the accent set in
`dayform` (`lib/widget-accent.ts`). Custom fonts are not used on the widget, because RemoteViews cannot load them
reliably.

## Product rules kept from v1

Local wall-clock dates (`YYYY-MM-DD`), `HH:mm` times, integer-minute durations, weeks start Monday. EN/VI everywhere,
and user-entered titles, notes and category names are never translated. Full touch targets, accessible labels, and
motion that respects reduce-motion.
