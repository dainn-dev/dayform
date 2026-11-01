import { describe, expect, test } from "bun:test";
import { vi } from "./i18n/realm";
import { rankLabel, isNewRealm } from "./rank-label";
import { rankOf, realmStart, REALM_NAMES, STAGE_NAMES } from "./realm";

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
    expect(isNewRealm(rankOf(40))).toBe(false);
    expect(isNewRealm(rankOf(realmStart(1)))).toBe(true);
    expect(isNewRealm(rankOf(realmStart(1) + 1))).toBe(true);
    expect(isNewRealm(rankOf(realmStart(1) + 60))).toBe(false);
  });
});
