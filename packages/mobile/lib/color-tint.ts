type Rgb = { r: number; g: number; b: number };

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i;

function parseHex(color: string): Rgb | null {
  const match = HEX.exec(color.trim());
  if (!match) return null;
  const digits = match[1];
  const full = digits.length <= 4 ? [...digits].map(d => d + d).join("") : digits;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function parseFunctional(color: string): Rgb | null {
  const match = FUNCTIONAL.exec(color.trim());
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

/**
 * `color` at the given opacity as an `rgba()` string. Handles #RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb() and
 * rgba(); any alpha already in the color is replaced. Unparseable input (e.g. "transparent") is returned unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color) ?? parseFunctional(color);
  if (!rgb) return color;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

const hex2 = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");

/**
 * `#rrggbb` that is `amount` (0..1) of the way from `base` to `toward`, mixed in sRGB. `mix(a, b, 0)` is `a` and
 * `mix(a, b, 1)` is `b`. Used to derive tints and text shades of a style palette from a few seed colours
 * (lib/design-theme.ts). Throws on a colour it cannot read, because a palette must never hold a broken value.
 */
export function mix(base: string, toward: string, amount: number): string {
  const a = parseHex(base) ?? parseFunctional(base);
  const b = parseHex(toward) ?? parseFunctional(toward);
  if (!a || !b) throw new Error(`mix: unreadable colour ${a ? toward : base}`);
  const t = Math.min(1, Math.max(0, amount));
  return `#${hex2(a.r + (b.r - a.r) * t)}${hex2(a.g + (b.g - a.g) * t)}${hex2(a.b + (b.b - a.b) * t)}`.toUpperCase();
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a colour (0 black .. 1 white); 0 for a colour it cannot read. */
export function luminance(color: string): number {
  const rgb = parseHex(color) ?? parseFunctional(color);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio of two colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
