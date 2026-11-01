import type { LadderStyle } from "./realm";

/**
 * The badge of a rank, drawn from simple shapes (framework-free, tested). Only the main picture of each rank (the emblem) is an
 * image; everything around it comes from here: the background, the rings that grow with the stage, the glow and rays of the
 * last stage, the nine pips of the layer and the marks of the stage. The geometry follows the generator of the original
 * icons, in a 256 x 256 space with its centre at (128, 128); components scale it to any size and map each shape to a View
 * (components/cultivation/RankBadge.tsx). A shape is only data, so the same list can be drawn as an SVG for a preview.
 */
export const BADGE = 256;
const C = BADGE / 2;

export type Paint = {
  /** A colour; absent means not filled. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};
export type Circle = Paint & { kind: "circle"; cx: number; cy: number; r: number };
/** A rectangle turned `rotate` degrees about its centre; a line is a thin rectangle with round ends. */
export type Rect = Paint & { kind: "rect"; cx: number; cy: number; w: number; h: number; rotate: number; radius: number };
/** A filled hexagon with a vertex at the top. */
export type Hex = { kind: "hex"; cx: number; cy: number; r: number; fill: string; opacity?: number };
/** Where the rank's main picture goes (a square of `size`), or the generic orb when the rank has none. */
export type Emblem = { kind: "emblem"; cx: number; cy: number; size: number };
export type Shape = Circle | Rect | Hex | Emblem;

export type Palette = { light: string; dark: string; accent: string };

const VOID = "#0a0a14";
const WHITE = "#ffffff";

/** Colours of every track. Cultivation realms 6 to 9 have no art yet but are drawn with their own colours and a generic orb. */
export const PALETTES: Readonly<Record<LadderStyle, readonly Palette[]>> = {
  cultivation: [
    { light: "#7fe0c8", dark: "#0f5c4c", accent: "#d6fff4" },
    { light: "#8fb4ff", dark: "#1c2f6b", accent: "#e3ecff" },
    { light: "#ffd36b", dark: "#7a4a00", accent: "#fff4cc" },
    { light: "#f29bff", dark: "#5a1466", accent: "#ffe6ff" },
    { light: "#ff7a6b", dark: "#6e0d12", accent: "#fff0e0" },
    { light: "#dfe6ff", dark: "#363c5c", accent: "#ffffff" },
    { light: "#ffa24a", dark: "#6b2e00", accent: "#fff0dc" },
    { light: "#b6f26b", dark: "#2f5a0b", accent: "#f3ffd9" },
    { light: "#b48cff", dark: "#2a0f5e", accent: "#f0e6ff" },
  ],
  engineer: [
    { light: "#9be37a", dark: "#1f4a17", accent: "#e6ffd9" },
    { light: "#5fe0e6", dark: "#0b4650", accent: "#d8fbff" },
    { light: "#7aa8ff", dark: "#16285e", accent: "#e0eaff" },
    { light: "#c08bff", dark: "#3a1663", accent: "#f1e3ff" },
    { light: "#ffb547", dark: "#6b2a00", accent: "#fff0d6" },
  ],
};

export function paletteFor(style: LadderStyle, track: number): Palette {
  const list = PALETTES[style];
  return list[Math.min(Math.max(0, track), list.length - 1)];
}

/** The emblem grows a little with the layer, like in the original icons; 1 is the size of the extracted picture (layer 5). */
export function emblemFactor(style: LadderStyle, layer: number): number {
  return style === "engineer" ? (0.86 + layer * 0.022) / (0.86 + 5 * 0.022) : (0.9 + layer * 0.025) / (0.9 + 5 * 0.025);
}
/** The side of the square the extracted emblem picture covers, in badge units. */
export const EMBLEM_SPAN = 176;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const polar = (radius: number, degrees: number) => ({ x: C + radius * Math.cos(rad(degrees)), y: C + radius * Math.sin(rad(degrees)) });

function line(x1: number, y1: number, x2: number, y2: number, paint: { stroke: string; width: number; opacity?: number }): Rect {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return {
    kind: "rect", cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: length + paint.width, h: paint.width, rotate: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
    radius: paint.width / 2, fill: paint.stroke, opacity: paint.opacity,
  };
}

/** The six vertices of a hexagon with a vertex at the top. */
export function hexagonPoints(radius: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => polar(radius, 60 * i - 90));
}

/** Rings, glow and rays of the stage: `stage` 0..3. */
function circleFrame(stage: number, p: Palette): Shape[] {
  const out: Shape[] = [];
  if (stage === 3) {
    out.push({ kind: "circle", cx: C, cy: C, r: 127, fill: p.light, opacity: 0.2 }, { kind: "circle", cx: C, cy: C, r: 121, fill: p.light, opacity: 0.22 });
  }
  return out;
}

function circleOverlay(stage: number, p: Palette): Shape[] {
  const out: Shape[] = [];
  const radii = (stage < 3 ? [112, 104, 96].slice(0, stage + 1) : [112, 104, 96]);
  radii.forEach((r, k) => out.push({ kind: "circle", cx: C, cy: C, r, stroke: p.light, strokeWidth: k === 0 ? 3 : 2, opacity: 0.9 - k * 0.2 }));
  if (stage >= 2) {
    for (let d = 0; d < 4; d++) {
      const at = polar(112, d * 90 + 45);
      out.push({ kind: "rect", cx: at.x, cy: at.y, w: 12, h: 12, rotate: 45, radius: 0, fill: p.accent });
    }
  }
  if (stage === 3) {
    for (let d = 0; d < 8; d++) {
      const a = polar(114, d * 45);
      const b = polar(126, d * 45);
      out.push(line(a.x, a.y, b.x, b.y, { stroke: WHITE, width: 3 }));
    }
  }
  return out;
}

/** Nine pips on an arc above the emblem, lit up to the layer. */
function circlePips(layer: number, p: Palette): Shape[] {
  return Array.from({ length: 9 }, (_, i) => {
    const at = polar(92, -90 - 64 + i * 16);
    const on = i < layer;
    return { kind: "circle", cx: at.x, cy: at.y, r: on ? 6.5 : 5, fill: on ? p.accent : p.dark, stroke: on ? p.light : WHITE, strokeWidth: 2, opacity: on ? 1 : 0.9 } satisfies Circle;
  });
}

/** One to three bars under the emblem, or the full disc of perfection. */
function circleMarks(stage: number, p: Palette): Shape[] {
  const y = C + 72;
  if (stage === 3) return [{ kind: "circle", cx: C, cy: y, r: 9, fill: p.accent, stroke: WHITE, strokeWidth: 2 }];
  return bars(stage + 1, y, p);
}

function bars(count: number, y: number, p: Palette): Shape[] {
  const gap = 14;
  const x0 = C - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, i) => ({ kind: "rect", cx: x0 + i * gap, cy: y, w: 8, h: 18, rotate: 0, radius: 2, fill: p.accent, stroke: p.light, strokeWidth: 1 } satisfies Rect));
}

/** The emblem, or a generic glowing orb for a rank that has no picture yet. */
function emblemShapes(style: LadderStyle, layer: number, p: Palette, hasEmblem: boolean): Shape[] {
  const factor = emblemFactor(style, layer);
  if (hasEmblem) return [{ kind: "emblem", cx: C, cy: C, size: EMBLEM_SPAN * factor }];
  const r = 34 * factor;
  return [
    { kind: "circle", cx: C, cy: C + 6, r: r + 10, stroke: p.light, strokeWidth: 2, opacity: 0.55 },
    { kind: "circle", cx: C, cy: C + 6, r, fill: p.light },
    { kind: "circle", cx: C - r * 0.08, cy: C + 6 - r * 0.1, r: r * 0.78, fill: p.accent, opacity: 0.85 },
    { kind: "circle", cx: C - r * 0.3, cy: C + 6 - r * 0.35, r: r * 0.22, fill: WHITE, opacity: 0.85 },
  ];
}

function hexagonOutline(radius: number, width: number, color: string, opacity: number): Shape[] {
  const points = hexagonPoints(radius);
  return points.map((from, i) => {
    const to = points[(i + 1) % 6];
    return line(from.x, from.y, to.x, to.y, { stroke: color, width, opacity });
  });
}

function engineerShapes(layer: number, stage: number, p: Palette, hasEmblem: boolean): Shape[] {
  const out: Shape[] = [];
  if (stage === 3) out.push({ kind: "circle", cx: C, cy: C, r: 127, fill: p.light, opacity: 0.2 }, { kind: "circle", cx: C, cy: C, r: 121, fill: p.light, opacity: 0.2 });
  out.push({ kind: "hex", cx: C, cy: C, r: 116, fill: "#07090f" }, { kind: "hex", cx: C, cy: C, r: 112, fill: p.dark, opacity: 0.85 });
  const radii = stage < 3 ? [118, 109, 101].slice(0, stage + 1) : [118, 109, 101];
  radii.forEach((r, k) => {
    // The very first stage is a dashed frame in the original: drawn here a little fainter.
    const opacity = stage === 0 && k === 0 ? 0.6 : 0.95 - k * 0.2;
    out.push(...hexagonOutline(r, k === 0 ? 3 : 2, p.light, opacity));
  });
  if (stage >= 2) {
    for (let i = 0; i < 6; i++) {
      const at = polar(118, 60 * i - 90);
      out.push({ kind: "circle", cx: at.x, cy: at.y, r: 5.5, fill: p.accent, stroke: p.light, strokeWidth: 2 });
    }
  }
  if (stage === 3) {
    for (let i = 0; i < 6; i++) {
      const a = polar(104, 60 * i - 60);
      const b = polar(125, 60 * i - 60);
      out.push(line(a.x, a.y, b.x, b.y, { stroke: WHITE, width: 3 }), { kind: "circle", cx: b.x, cy: b.y, r: 3, fill: WHITE });
    }
  }
  // Nine square bits on an arc, lit up to the level.
  for (let i = 0; i < 9; i++) {
    const a = -90 - 60 + i * 15;
    const at = polar(88, a);
    const on = i < layer;
    const size = on ? 11 : 8;
    out.push({ kind: "rect", cx: at.x, cy: at.y, w: size, h: size, rotate: a + 90, radius: 2, fill: on ? p.accent : p.dark, stroke: on ? p.light : WHITE, strokeWidth: 1.5, opacity: on ? 1 : 0.8 });
  }
  out.push(...emblemShapes("engineer", layer, p, hasEmblem));
  const y = C + 70;
  if (stage === 3) {
    out.push(
      { kind: "rect", cx: C, cy: y, w: 26, h: 24, rotate: 0, radius: 6, fill: p.accent, stroke: WHITE, strokeWidth: 2 },
      line(C - 7, y, C - 2, y + 5, { stroke: p.dark, width: 3.5 }),
      line(C - 2, y + 5, C + 7, y - 5, { stroke: p.dark, width: 3.5 }),
    );
  } else {
    out.push(...bars(stage + 1, y, p));
  }
  return out;
}

function cultivationShapes(layer: number, stage: number, p: Palette, hasEmblem: boolean): Shape[] {
  return [
    ...circleFrame(stage, p),
    // The round background: dark at the edge, the realm's colour glowing from the upper middle.
    { kind: "circle", cx: C, cy: C, r: 114, fill: VOID },
    { kind: "circle", cx: C, cy: C, r: 100, fill: p.dark },
    { kind: "circle", cx: C, cy: C - 16, r: 64, fill: p.light, opacity: 0.16 },
    { kind: "circle", cx: C, cy: C - 20, r: 34, fill: p.light, opacity: 0.16 },
    ...circleOverlay(stage, p),
    ...circlePips(layer, p),
    ...emblemShapes("cultivation", layer, p, hasEmblem),
    ...circleMarks(stage, p),
  ];
}

/** Every shape of a rank's badge, back to front. `layer` 1..9, `stage` 0..3; `hasEmblem` is whether the track has its picture. */
export function badgeShapes(style: LadderStyle, track: number, layer: number, stage: number, hasEmblem: boolean): Shape[] {
  const palette = paletteFor(style, track);
  const clampedLayer = Math.min(9, Math.max(1, Math.round(layer)));
  const clampedStage = Math.min(3, Math.max(0, Math.round(stage)));
  return style === "engineer"
    ? engineerShapes(clampedLayer, clampedStage, palette, hasEmblem)
    : cultivationShapes(clampedLayer, clampedStage, palette, hasEmblem);
}

/** A colour with an opacity, for the places a shape needs a see-through colour (`#rrggbb` only; anything else is returned as is). */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.min(1, Math.max(0, alpha))})`;
}
