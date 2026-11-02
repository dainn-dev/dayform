import { describe, expect, test } from "bun:test";
import { vi } from "./i18n/realm";
import { fill } from "./assistant-answers";
import { expLine, rankLabel, isNewRealm } from "./rank-label";
import { ENGINEER, MAX_XP, rankOf, realmStart, REALM_NAMES, STAGE_NAMES } from "./realm";

const english = (text: string) => text;
const vietnamese = (text: string) => vi[text] ?? text;

describe("rank label", () => {
  test("names a rank in English and in Vietnamese", () => {
    expect(rankLabel(rankOf(0), english)).toBe("Qi Refining, layer 1 – Early stage");
    const third = rankOf(realmStart(2) + 3 * 40 * 2 * 4 + 120);
    expect(rankLabel(third, vietnamese)).toMatch(/^Kim Đan tầng \d – (Sơ kỳ|Trung kỳ|Hậu kỳ|Đại viên mãn)$/);
  });

  test("every realm and stage name is translated", () => {
    for (const name of [...REALM_NAMES, ...STAGE_NAMES]) expect(vi[name]).toBeTruthy();
  });

  test("only the first step of a realm is a new realm", () => {
    expect(isNewRealm(rankOf(0))).toBe(true);
    expect(isNewRealm(rankOf(100))).toBe(false);
    expect(isNewRealm(rankOf(realmStart(1)))).toBe(true);
    expect(isNewRealm(rankOf(realmStart(1) + 1))).toBe(true);
    expect(isNewRealm(rankOf(realmStart(1) + 150))).toBe(false);
  });
});

describe("the short experience line", () => {
  test("shows what is gathered of the current stage over what it takes", () => {
    const rank = rankOf(25);
    const line = expLine(rank, 25, "en");
    expect(fill(line.text, line.vars)).toBe("25/100 exp");
    const next = rankOf(495);
    expect(fill(expLine(next, 495, "en").text, expLine(next, 495, "en").vars)).toBe("95/120 exp");
  });

  test("restarts for every stage and counts a bigger stage in a higher realm", () => {
    const start = realmStart(1);
    const rank = rankOf(start + 15);
    const line = expLine(rank, start + 15, "en");
    expect(fill(line.text, line.vars)).toBe("15/150 exp");
  });

  test("while gathering the breakthrough, it counts the gate", () => {
    const gate = 8340;
    const rank = rankOf(gate + 100);
    const line = expLine(rank, gate + 100, "en");
    expect(fill(line.text, line.vars)).toBe("100/3,475 exp");
  });

  test("numbers are grouped, and the engineer style says XP", () => {
    const rank = rankOf(realmStart(3) + 1500);
    const line = expLine(rank, realmStart(3) + 1500, "vi");
    expect(fill(line.text, line.vars)).toMatch(/^[\d.]+\/[\d.]+ exp$/);
    const engineer = expLine(rankOf(25, ENGINEER), 25, "en", ENGINEER);
    expect(fill(engineer.text, engineer.vars)).toBe("25/100 XP");
  });

  test("at the top of the ladder it shows the total", () => {
    const top = rankOf(MAX_XP);
    const line = expLine(top, MAX_XP, "en");
    expect(line.text).toBe("{xp} exp");
    expect(line.vars.xp).toBe(MAX_XP.toLocaleString("en-US"));
  });

  test("every line is translated", () => {
    for (const key of ["{xp}/{next} exp", "{xp} exp", "{xp}/{next} XP", "{xp} XP"]) expect(vi[key]).toBeTruthy();
  });
});
