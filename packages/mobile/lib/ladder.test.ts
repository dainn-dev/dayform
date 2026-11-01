import { describe, expect, test } from "bun:test";
import { fill } from "./assistant-answers";
import { vi } from "./i18n/realm";
import { ENGINEER_WORDS, word } from "./ladder-words";
import { goalLine, rankLabel } from "./rank-label";
import {
  CULTIVATION, ENGINEER, LAYERS, MAX_XP, STAGES, breakthroughCost, maxXp, rankOf, realmStart, stageCost, toNextRealm,
} from "./realm";
import type { Task } from "./planner";
import { claimTasks, penaltyFor, settleDays, EMPTY_XP, type XpState } from "./xp";
import { noticeFor } from "./xp-notice";

const english = (text: string) => text;
const vietnamese = (text: string) => vi[text] ?? text;

describe("the engineer ladder", () => {
  test("has five ranks of nine levels and four stages", () => {
    expect(ENGINEER.tracks).toEqual(["Intern", "Fresher", "Junior", "Middle", "Senior"]);
    expect(ENGINEER.stages).toEqual(["Alpha", "Beta", "RC", "Stable"]);
    const top = rankOf(maxXp(ENGINEER), ENGINEER);
    expect(top).toMatchObject({ realm: 4, layer: LAYERS, stage: STAGES - 1, step: 179, max: true });
    expect(rankOf(maxXp(ENGINEER) - 1, ENGINEER).step).toBe(179);
  });

  test("is shorter than the cultivation ladder, and the cultivation ladder is untouched", () => {
    expect(maxXp(ENGINEER)).toBeLessThan(MAX_XP);
    expect(maxXp(CULTIVATION)).toBe(MAX_XP);
    expect(rankOf(MAX_XP - 1).realm).toBe(8);
  });

  test("labels in its own words", () => {
    expect(rankLabel(rankOf(0, ENGINEER), english, ENGINEER)).toBe("Intern Lv.1 – Alpha");
    const third = rankOf(realmStart(2, ENGINEER) + stageCost(2, ENGINEER) * 11, ENGINEER);
    expect(rankLabel(third, english, ENGINEER)).toBe("Junior Lv.3 – Stable");
    expect(rankLabel(rankOf(0), english)).toBe("Qi Refining, layer 1 – Early stage");
  });

  test("a promotion costs 15 stages of the rank being left, and the last rank has none", () => {
    for (let track = 0; track < ENGINEER.tracks.length - 1; track++) expect(breakthroughCost(track, ENGINEER)).toBe(stageCost(track, ENGINEER) * 15);
    expect(breakthroughCost(4, ENGINEER)).toBe(0);
    const gate = realmStart(1, ENGINEER);
    expect(rankOf(gate - 1, ENGINEER)).toMatchObject({ realm: 0, breakthrough: true });
    expect(rankOf(gate, ENGINEER)).toMatchObject({ realm: 1, layer: 1, stage: 0, breakthrough: false });
    expect(toNextRealm(0, rankOf(0, ENGINEER), ENGINEER)).toBe(gate);
    expect(toNextRealm(maxXp(ENGINEER), rankOf(maxXp(ENGINEER), ENGINEER), ENGINEER)).toBeNull();
  });

  test("the same experience gives a different rank in each style", () => {
    const xp = 10000;
    expect(rankOf(xp, ENGINEER).realm).not.toBe(rankOf(xp, CULTIVATION).realm);
  });
});

describe("words of each style", () => {
  test("cultivation keeps its own keys; engineer swaps the ones it has", () => {
    expect(word("cultivation", "Breakthrough")).toBe("Breakthrough");
    expect(word("engineer", "Breakthrough")).toBe("Promotion");
    expect(word("engineer", "Today")).toBe("Today");
  });

  test("the goal lines use the style's wording", () => {
    const stage = goalLine(rankOf(10, ENGINEER), 10, english, "en", ENGINEER)!;
    expect(fill(stage.text, stage.vars)).toBe("30 more XP to reach Intern Lv.1 – Beta");
    const gate = realmStart(1, ENGINEER);
    const promo = goalLine(rankOf(gate - 100, ENGINEER), gate - 100, english, "en", ENGINEER)!;
    expect(fill(promo.text, promo.vars)).toContain("to be promoted to Fresher");
  });

  test("every engineer wording is translated, and so is every key it replaces", () => {
    for (const [key, engineer] of Object.entries(ENGINEER_WORDS)) {
      expect(vi[engineer]).toBeTruthy();
      // The cultivation key itself is translated elsewhere (this file or the base dictionary), except layout-only keys.
      if (key !== "{realm}, layer {layer} – {stage}") expect(vi[key]).toBeTruthy();
    }
  });

  test("the assistant's notices follow the style", () => {
    const events = [{ type: "penalty" as const, day: "2026-10-10", amount: 40, demoted: false }];
    const engineer = noticeFor(events, "engineer")!;
    expect(fill(engineer.line.text, engineer.line.vars)).toBe("A day without a finished task cost you 40 XP. Finish one today!");
    expect(vietnamese(engineer.line.text)).not.toBe(engineer.line.text);
    const demoted = noticeFor([{ type: "penalty", day: "a", amount: 10, demoted: true }], "engineer")!;
    expect(vi[demoted.line.text]).toBeTruthy();
  });
});

describe("the experience under each ladder", () => {
  const task: Task = {
    id: "a", title: "T", date: "2026-10-10", start: "09:00", duration: 60, status: "done", category: "Focus", notes: "",
    createdAt: new Date("2026-10-01T08:00:00").toISOString(),
  };
  const now = new Date("2026-10-10T12:00:00");

  test("a rank up is judged on the chosen ladder", () => {
    const start: XpState = { ...EMPTY_XP, startDay: "2026-10-10", settledDay: "2026-10-09", total: 30 };
    expect(claimTasks(start, [task], now, ENGINEER).rankUp).toBe(true);
    expect(claimTasks(start, [task], now, CULTIVATION).rankUp).toBe(true);
    const small: XpState = { ...start, total: 0 };
    expect(claimTasks(small, [{ ...task, duration: 15, id: "b" }], now, ENGINEER).rankUp).toBe(false);
  });

  test("the penalty floor is the start of the current rank of the ladder in use", () => {
    const total = realmStart(2, ENGINEER) + 10;
    expect(penaltyFor(total, 1, ENGINEER).floor).toBe(realmStart(2, ENGINEER));
    expect(penaltyFor(total, 1, CULTIVATION).floor).toBe(realmStart(rankOf(total).realm));
    expect(penaltyFor(total, 1, CULTIVATION).floor).not.toBe(penaltyFor(total, 1, ENGINEER).floor);
    expect(penaltyFor(total, 3, ENGINEER).floor).toBe(0);
  });

  test("a demotion is reported against the ladder in use", () => {
    const start = realmStart(1, ENGINEER);
    const state: XpState = { ...EMPTY_XP, startDay: "2026-10-01", settledDay: "2026-09-30", total: start + 50, restDays: ["2026-10-01"] };
    const result = settleDays(state, new Date("2026-10-05T12:00:00"), ENGINEER);
    expect(result.events.some(event => event.type === "penalty" && event.demoted)).toBe(true);
    expect(rankOf(result.state.total, ENGINEER).realm).toBe(0);
  });
});
