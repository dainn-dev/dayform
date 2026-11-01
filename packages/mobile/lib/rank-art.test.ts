import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BADGE, EMBLEM_SPAN, PALETTES, badgeShapes, emblemFactor, hexagonPoints, paletteFor, withAlpha, type Circle, type Rect, type Shape } from "./rank-art";

const circles = (shapes: Shape[]) => shapes.filter((shape): shape is Circle => shape.kind === "circle");
const rects = (shapes: Shape[]) => shapes.filter((shape): shape is Rect => shape.kind === "rect");

/** The box a shape covers, including its stroke and, for a turned rectangle, its corners. */
function box(shape: Shape): { x1: number; y1: number; x2: number; y2: number } {
  if (shape.kind === "circle") {
    const reach = shape.r + (shape.strokeWidth ?? 0) / 2;
    return { x1: shape.cx - reach, y1: shape.cy - reach, x2: shape.cx + reach, y2: shape.cy + reach };
  }
  if (shape.kind === "rect") {
    const sw = shape.stroke ? shape.strokeWidth ?? 0 : 0;
    const angle = (shape.rotate * Math.PI) / 180;
    const halfW = (shape.w + sw) / 2;
    const halfH = (shape.h + sw) / 2;
    const reachX = Math.abs(halfW * Math.cos(angle)) + Math.abs(halfH * Math.sin(angle));
    const reachY = Math.abs(halfW * Math.sin(angle)) + Math.abs(halfH * Math.cos(angle));
    return { x1: shape.cx - reachX, y1: shape.cy - reachY, x2: shape.cx + reachX, y2: shape.cy + reachY };
  }
  if (shape.kind === "hex") return { x1: shape.cx - shape.r, y1: shape.cy - shape.r, x2: shape.cx + shape.r, y2: shape.cy + shape.r };
  return { x1: shape.cx - shape.size / 2, y1: shape.cy - shape.size / 2, x2: shape.cx + shape.size / 2, y2: shape.cy + shape.size / 2 };
}

describe("cultivation badge", () => {
  const frame = (shapes: Shape[]) => circles(shapes).filter(c => c.stroke && !c.fill && [112, 104, 96].includes(c.r));

  test("the rings grow with the stage: one, two, three, then three", () => {
    expect([0, 1, 2, 3].map(stage => frame(badgeShapes("cultivation", 0, 5, stage, true)).length)).toEqual([1, 2, 3, 3]);
  });

  test("hậu kỳ adds four diamonds; đại viên mãn adds the glow and eight rays", () => {
    const diamonds = (stage: number) => rects(badgeShapes("cultivation", 0, 5, stage, true)).filter(r => r.w === 12 && r.rotate === 45);
    expect([0, 1, 2, 3].map(stage => diamonds(stage).length)).toEqual([0, 0, 4, 4]);
    const rays = (stage: number) => rects(badgeShapes("cultivation", 0, 5, stage, true)).filter(r => r.fill === "#ffffff" && r.h === 3);
    expect([0, 1, 2, 3].map(stage => rays(stage).length)).toEqual([0, 0, 0, 8]);
    const aura = (stage: number) => circles(badgeShapes("cultivation", 0, 5, stage, true)).filter(c => c.r >= 121).length;
    expect([0, 1, 2, 3].map(aura)).toEqual([0, 0, 0, 2]);
  });

  test("nine pips on the arc, as many lit as the layer", () => {
    for (let layer = 1; layer <= 9; layer++) {
      const pips = circles(badgeShapes("cultivation", 2, layer, 1, true)).filter(c => c.r === 6.5 || c.r === 5);
      expect(pips).toHaveLength(9);
      expect(pips.filter(c => c.r === 6.5)).toHaveLength(layer);
    }
  });

  test("one, two or three bars under the emblem, then the full disc", () => {
    const bars = (stage: number) => rects(badgeShapes("cultivation", 0, 5, stage, true)).filter(r => r.w === 8 && r.h === 18);
    expect([0, 1, 2, 3].map(stage => bars(stage).length)).toEqual([1, 2, 3, 0]);
    expect(circles(badgeShapes("cultivation", 0, 5, 3, true)).some(c => c.r === 9 && c.cy > 190)).toBe(true);
  });
});

describe("engineer badge", () => {
  const hexLines = (shapes: Shape[]) => rects(shapes).filter(r => r.stroke === undefined && r.h <= 3 && r.fill !== "#ffffff");

  test("the frame is a hexagon outline of six edges per ring: 1, 2, 3, 3 rings", () => {
    expect([0, 1, 2, 3].map(stage => hexLines(badgeShapes("engineer", 0, 5, stage, true)).length)).toEqual([6, 12, 18, 18]);
  });

  test("RC adds six rivets; Stable adds the glow, six circuit lines and the tick", () => {
    const rivets = (stage: number) => circles(badgeShapes("engineer", 1, 5, stage, true)).filter(c => c.r === 5.5).length;
    expect([0, 1, 2, 3].map(rivets)).toEqual([0, 0, 6, 6]);
    const circuits = (stage: number) => rects(badgeShapes("engineer", 1, 5, stage, true)).filter(r => r.fill === "#ffffff").length;
    expect(circuits(2)).toBe(0);
    expect(circuits(3)).toBe(6);
    const tick = rects(badgeShapes("engineer", 1, 5, 3, true)).filter(r => r.w === 26 && r.h === 24);
    expect(tick).toHaveLength(1);
  });

  test("nine bits, as many lit as the level", () => {
    for (let level = 1; level <= 9; level++) {
      const bits = rects(badgeShapes("engineer", 3, level, 0, true)).filter(r => r.w === r.h && (r.w === 11 || r.w === 8) && r.radius === 2);
      expect(bits).toHaveLength(9);
      expect(bits.filter(r => r.w === 11)).toHaveLength(level);
    }
  });

  test("the hexagon has a vertex at the top", () => {
    const points = hexagonPoints(100);
    expect(points).toHaveLength(6);
    expect(points[0].x).toBeCloseTo(128, 5);
    expect(points[0].y).toBeCloseTo(28, 5);
  });
});

describe("shapes in general", () => {
  test("every badge of every track, layer and stage stays inside the 256 space, with no bad number", () => {
    for (const style of ["cultivation", "engineer"] as const) {
      for (let track = 0; track < PALETTES[style].length; track++) {
        for (let layer = 1; layer <= 9; layer++) {
          for (let stage = 0; stage < 4; stage++) {
            for (const shape of badgeShapes(style, track, layer, stage, track < 5)) {
              const { x1, y1, x2, y2 } = box(shape);
              for (const value of [x1, y1, x2, y2]) expect(Number.isFinite(value)).toBe(true);
              expect(x1).toBeGreaterThanOrEqual(-1);
              expect(y1).toBeGreaterThanOrEqual(-1);
              expect(x2).toBeLessThanOrEqual(BADGE + 1);
              expect(y2).toBeLessThanOrEqual(BADGE + 1);
            }
          }
        }
      }
    }
  });

  test("the emblem is one picture centred on the badge, or a generic orb when there is none", () => {
    const withPicture = badgeShapes("cultivation", 0, 5, 0, true).filter(shape => shape.kind === "emblem");
    expect(withPicture).toEqual([{ kind: "emblem", cx: 128, cy: 128, size: EMBLEM_SPAN }]);
    const orb = badgeShapes("cultivation", 6, 5, 0, false);
    expect(orb.some(shape => shape.kind === "emblem")).toBe(false);
    expect(circles(orb).some(c => c.fill === paletteFor("cultivation", 6).light && c.r > 30)).toBe(true);
  });

  test("the emblem grows with the layer and is its extracted size at layer 5", () => {
    expect(emblemFactor("cultivation", 5)).toBeCloseTo(1, 10);
    expect(emblemFactor("engineer", 5)).toBeCloseTo(1, 10);
    for (const style of ["cultivation", "engineer"] as const) expect(emblemFactor(style, 9)).toBeGreaterThan(emblemFactor(style, 1));
  });

  test("out-of-range layer and stage are clamped", () => {
    expect(badgeShapes("cultivation", 0, 99, 9, true)).toEqual(badgeShapes("cultivation", 0, 9, 3, true));
    expect(badgeShapes("engineer", 0, -4, -1, true)).toEqual(badgeShapes("engineer", 0, 1, 0, true));
  });

  test("palettes: nine realms, five ranks, real colours, and a track past the end reuses the last", () => {
    expect(PALETTES.cultivation).toHaveLength(9);
    expect(PALETTES.engineer).toHaveLength(5);
    for (const palette of [...PALETTES.cultivation, ...PALETTES.engineer]) for (const colour of Object.values(palette)) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect(paletteFor("engineer", 99)).toBe(PALETTES.engineer[4]);
    expect(paletteFor("cultivation", -1)).toBe(PALETTES.cultivation[0]);
  });

  test("withAlpha builds a see-through colour and leaves other colours alone", () => {
    expect(withAlpha("#ffffff", 0.2)).toBe("rgba(255, 255, 255, 0.2)");
    expect(withAlpha("#7fe0c8", 2)).toBe("rgba(127, 224, 200, 1)");
    expect(withAlpha("red", 0.5)).toBe("red");
  });
});

describe("emblem pictures", () => {
  // bun cannot load a PNG through `require`, so the table of constants/rank-emblems.ts is read as text.
  const mobile = join(import.meta.dir, "..");
  const table = readFileSync(join(mobile, "constants", "rank-emblems.ts"), "utf8");
  const paths = [...table.matchAll(/require\("\.\.\/([^"]+)"\)/g)].map(match => match[1]);

  test("ten pictures: the first five cultivation realms and the five engineer ranks, every file present and small", () => {
    expect(paths).toHaveLength(10);
    for (const path of paths) {
      expect(existsSync(join(mobile, path))).toBe(true);
      expect(readFileSync(join(mobile, path)).length).toBeLessThan(20_000);
    }
    for (let track = 0; track < 5; track++) {
      expect(paths).toContain(`assets/ranks/emblems/cultivation-${track}.png`);
      expect(paths).toContain(`assets/ranks/emblems/engineer-${track}.png`);
    }
  });
});
