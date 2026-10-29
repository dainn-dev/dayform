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
