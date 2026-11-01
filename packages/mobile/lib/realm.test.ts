import { describe, expect, test } from "bun:test";
import { BREAKTHROUGH_FACTOR, LAYERS, MAX_XP, REALM_NAMES, STAGES, breakthroughCost, rankOf, rankParts, realmStart, stageCost, toNextRealm } from "./realm";

describe("realm ladder", () => {
  test("a new cultivator is at the early stage of layer 1 of the first realm", () => {
    const rank = rankOf(0);
    expect(rank).toMatchObject({ realm: 0, layer: 1, stage: 0, step: 0, floor: 0, next: 40, max: false });
    expect(rankParts(rank)).toEqual({ realm: "Qi Refining", layer: 1, stage: "Early stage" });
  });

  test("each stage costs more in a higher realm, in multiples of 5", () => {
    for (let realm = 1; realm < REALM_NAMES.length; realm++) {
      expect(stageCost(realm)).toBeGreaterThan(stageCost(realm - 1));
      expect(stageCost(realm) % 5).toBe(0);
    }
  });

  test("stages, layers and realms advance exactly at their thresholds", () => {
    expect(rankOf(39).stage).toBe(0);
    expect(rankOf(40).stage).toBe(1);
    expect(rankOf(160)).toMatchObject({ realm: 0, layer: 2, stage: 0 });
    const second = realmStart(1);
    expect(rankOf(second - 1)).toMatchObject({ realm: 0, layer: LAYERS, stage: STAGES - 1 });
    expect(rankOf(second)).toMatchObject({ realm: 1, layer: 1, stage: 0, floor: second });
  });

  test("progress runs from 0 to just under 1 inside a stage", () => {
    expect(rankOf(60).progress).toBeCloseTo(0.5, 5);
    expect(rankOf(79).progress).toBeLessThan(1);
  });

  test("the steps count up to 324 and the top of the ladder stays put", () => {
    expect(rankOf(MAX_XP - 1).step).toBe(REALM_NAMES.length * LAYERS * STAGES - 1);
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
  test("it costs many stages' worth, far more than a stage", () => {
    for (let realm = 0; realm < REALM_NAMES.length - 1; realm++) {
      expect(breakthroughCost(realm)).toBe(stageCost(realm) * BREAKTHROUGH_FACTOR);
      expect(breakthroughCost(realm)).toBeGreaterThanOrEqual(stageCost(realm) * 10);
    }
    expect(breakthroughCost(REALM_NAMES.length - 1)).toBe(0);
  });

  test("after the last stage of a realm the rank waits at layer 9, perfection, while the breakthrough fills", () => {
    const gate = realmStart(0) + stageCost(0) * LAYERS * STAGES;
    const ready = rankOf(gate);
    expect(ready).toMatchObject({ realm: 0, layer: LAYERS, stage: STAGES - 1, breakthrough: true, floor: gate, next: gate + breakthroughCost(0), progress: 0 });
    const half = rankOf(gate + breakthroughCost(0) / 2);
    expect(half).toMatchObject({ realm: 0, breakthrough: true });
    expect(half.progress).toBeCloseTo(0.5, 5);
    expect(rankOf(gate - 1).breakthrough).toBe(false);
  });

  test("the next realm begins only when the whole breakthrough is gathered", () => {
    const next = realmStart(1);
    expect(next).toBe(stageCost(0) * LAYERS * STAGES + breakthroughCost(0));
    expect(rankOf(next - 1)).toMatchObject({ realm: 0, breakthrough: true });
    expect(rankOf(next)).toMatchObject({ realm: 1, layer: 1, stage: 0, breakthrough: false });
  });

  test("the step count does not move while gathering, then rises when the realm is entered", () => {
    const gate = stageCost(0) * LAYERS * STAGES;
    expect(rankOf(gate).step).toBe(35);
    expect(rankOf(gate + 100).step).toBe(35);
    expect(rankOf(realmStart(1)).step).toBe(36);
  });

  test("the last realm has no breakthrough", () => {
    const last = REALM_NAMES.length - 1;
    expect(rankOf(realmStart(last) + stageCost(last) * LAYERS * STAGES - 1).breakthrough).toBe(false);
    expect(rankOf(MAX_XP).max).toBe(true);
  });

  test("toNextRealm counts what is still missing, and is null in the last realm", () => {
    expect(toNextRealm(0, rankOf(0))).toBe(realmStart(1));
    expect(toNextRealm(realmStart(1) - 10, rankOf(realmStart(1) - 10))).toBe(10);
    expect(toNextRealm(MAX_XP, rankOf(MAX_XP))).toBeNull();
  });
});
