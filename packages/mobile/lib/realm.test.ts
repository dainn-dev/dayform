import { describe, expect, test } from "bun:test";
import { BREAKTHROUGH_FACTOR, LAYERS, MAX_XP, REALM_NAMES, STAGES, breakthroughCost, layerCosts, rankOf, rankParts, realmStart, stageCost, stageCostAt, toNextRealm } from "./realm";

/** Experience to climb every stage of a realm, before its breakthrough. */
const trackStages = (realm: number) => layerCosts(realm).reduce((sum, cost) => sum + cost, 0);
const STEPS_PER_REALM = LAYERS * STAGES;

describe("realm ladder", () => {
  test("a new cultivator is at the early stage of layer 1 of the first realm, whose first stage costs 100", () => {
    const rank = rankOf(0);
    expect(rank).toMatchObject({ realm: 0, layer: 1, stage: 0, step: 0, floor: 0, next: 100, max: false });
    expect(rankParts(rank)).toEqual({ realm: "Qi Refining", layer: 1, stage: "Early stage" });
    expect(stageCost(0)).toBe(100);
  });

  test("the first stage costs more in a higher realm, in multiples of 5", () => {
    for (let realm = 1; realm < REALM_NAMES.length; realm++) {
      expect(stageCost(realm)).toBeGreaterThan(stageCost(realm - 1));
      expect(stageCost(realm) % 5).toBe(0);
    }
  });

  test("stages, layers and realms advance exactly at their thresholds", () => {
    expect(rankOf(99).stage).toBe(0);
    expect(rankOf(100).stage).toBe(1);
    expect(rankOf(399)).toMatchObject({ realm: 0, layer: 1, stage: 3 });
    expect(rankOf(400)).toMatchObject({ realm: 0, layer: 2, stage: 0 });
    const second = realmStart(1);
    expect(rankOf(second - 1)).toMatchObject({ realm: 0, layer: LAYERS, stage: STAGES - 1 });
    expect(rankOf(second)).toMatchObject({ realm: 1, layer: 1, stage: 0, floor: second });
  });

  test("progress runs from 0 to just under 1 inside a stage", () => {
    // Layer 2 begins at 400 and its stages cost 120 each.
    expect(rankOf(400 + 60).progress).toBeCloseTo(0.5, 5);
    expect(rankOf(400 + 119).progress).toBeLessThan(1);
  });

  test("each layer costs about 20% more than the one before it", () => {
    for (let realm = 0; realm < REALM_NAMES.length; realm++) {
      for (let layer = 2; layer <= LAYERS; layer++) {
        const ratio = stageCostAt(realm, layer) / stageCostAt(realm, layer - 1);
        expect(ratio).toBeGreaterThan(1.15);
        expect(ratio).toBeLessThan(1.25);
      }
    }
  });

  test("the first realm's stages cost 100, 120, 145 ... 430 from layer 1 to layer 9", () => {
    expect(Array.from({ length: LAYERS }, (_, i) => stageCostAt(0, i + 1))).toEqual([100, 120, 145, 175, 205, 250, 300, 360, 430]);
    expect(layerCosts(0)).toHaveLength(LAYERS);
    expect(trackStages(0)).toBe(8340);
  });

  test("a stage's width follows its layer", () => {
    const layer5 = layerCosts(0).slice(0, 4).reduce((sum, cost) => sum + cost, 0);
    expect(layer5).toBe(2160);
    expect(rankOf(layer5)).toMatchObject({ layer: 5, stage: 0, floor: layer5, next: layer5 + 205 });
    expect(rankOf(layer5 + 205)).toMatchObject({ layer: 5, stage: 1 });
  });

  test("every realm begins on layer 1, early stage", () => {
    for (let realm = 1; realm < REALM_NAMES.length; realm++) expect(rankOf(realmStart(realm))).toMatchObject({ realm, layer: 1, stage: 0 });
  });

  test("the steps count up to 324 and the top of the ladder stays put", () => {
    expect(rankOf(MAX_XP - 1).step).toBe(REALM_NAMES.length * STEPS_PER_REALM - 1);
    const top = rankOf(MAX_XP);
    expect(top).toMatchObject({ realm: REALM_NAMES.length - 1, layer: LAYERS, stage: STAGES - 1, next: null, progress: 1, max: true });
    expect(rankOf(MAX_XP * 5)).toEqual(top);
  });

  test("a bad total is treated as zero", () => {
    expect(rankOf(-50).step).toBe(0);
    expect(rankOf(Number.NaN).step).toBe(0);
  });

  test("the rank never goes down as the total goes up", () => {
    let last = -1;
    for (let xp = 0; xp <= MAX_XP + 10; xp += 997) {
      const { step } = rankOf(xp);
      expect(step).toBeGreaterThanOrEqual(last);
      last = step;
    }
  });
});

describe("the breakthrough between great realms", () => {
  test("it costs about 15 average stages, far more than a stage", () => {
    for (let realm = 0; realm < REALM_NAMES.length - 1; realm++) {
      expect(Math.abs(breakthroughCost(realm) - (trackStages(realm) * BREAKTHROUGH_FACTOR) / STEPS_PER_REALM)).toBeLessThanOrEqual(2.5);
      expect(breakthroughCost(realm)).toBeGreaterThanOrEqual(stageCost(realm) * 10);
    }
    expect(breakthroughCost(REALM_NAMES.length - 1)).toBe(0);
    expect(breakthroughCost(0)).toBe(3475);
  });

  test("after the last stage of a realm the rank waits at layer 9, perfection, while the breakthrough fills", () => {
    const gate = realmStart(0) + trackStages(0);
    const ready = rankOf(gate);
    expect(ready).toMatchObject({ realm: 0, layer: LAYERS, stage: STAGES - 1, breakthrough: true, floor: gate, next: gate + breakthroughCost(0), progress: 0 });
    const half = rankOf(gate + breakthroughCost(0) / 2);
    expect(half).toMatchObject({ realm: 0, breakthrough: true });
    expect(half.progress).toBeCloseTo(0.5, 2);
    expect(rankOf(gate - 1).breakthrough).toBe(false);
  });

  test("the next realm begins only when the whole breakthrough is gathered", () => {
    const next = realmStart(1);
    expect(next).toBe(trackStages(0) + breakthroughCost(0));
    expect(rankOf(next - 1)).toMatchObject({ realm: 0, breakthrough: true });
    expect(rankOf(next)).toMatchObject({ realm: 1, layer: 1, stage: 0, breakthrough: false });
  });

  test("the step count does not move while gathering, then rises when the realm is entered", () => {
    const gate = trackStages(0);
    expect(rankOf(gate).step).toBe(35);
    expect(rankOf(gate + 100).step).toBe(35);
    expect(rankOf(realmStart(1)).step).toBe(36);
  });

  test("the last realm has no breakthrough", () => {
    const last = REALM_NAMES.length - 1;
    expect(rankOf(realmStart(last) + trackStages(last) - 1).breakthrough).toBe(false);
    expect(rankOf(MAX_XP).max).toBe(true);
  });

  test("toNextRealm counts what is still missing, and is null in the last realm", () => {
    expect(toNextRealm(0, rankOf(0))).toBe(realmStart(1));
    expect(toNextRealm(realmStart(1) - 10, rankOf(realmStart(1) - 10))).toBe(10);
    expect(toNextRealm(MAX_XP, rankOf(MAX_XP))).toBeNull();
  });
});
