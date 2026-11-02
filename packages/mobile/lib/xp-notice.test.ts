import { describe, expect, test } from "bun:test";
import { fill } from "./assistant-answers";
import { vi } from "./i18n/realm";
import { formatNumber, goalLine, rankLabel } from "./rank-label";
import { layerCosts, rankOf, realmStart } from "./realm";
import { noticeFor } from "./xp-notice";
import type { SettleEvent } from "./xp";

const rest = (day: string): SettleEvent => ({ type: "rest", day });
const penalty = (day: string, amount: number, demoted = false): SettleEvent => ({ type: "penalty", day, amount, demoted });
const said = (events: SettleEvent[]) => {
  const notice = noticeFor(events);
  return notice && { stern: notice.stern, text: fill(notice.line.text, notice.line.vars) };
};

describe("what the assistant says after judging the days", () => {
  test("nothing to say when nothing happened", () => {
    expect(noticeFor([])).toBeNull();
  });

  test("a rest day is calm news, one or several", () => {
    expect(said([rest("2026-10-13")])).toEqual({ stern: false, text: "Yesterday was a rest day. Your streak is safe." });
    expect(said([rest("2026-10-13"), rest("2026-10-20")])).toEqual({ stern: false, text: "2 days were rest days. Your streak is safe." });
  });

  test("a penalty says how much it cost, and beats a rest day", () => {
    expect(said([rest("a"), penalty("b", 40)])).toEqual({ stern: true, text: "A day without a finished task cost you 40 experience. Finish one today!" });
    expect(said([penalty("a", 40), penalty("b", 80)])?.text).toBe("2 days without a finished task cost you 120 experience. Finish one today!");
  });

  test("a penalty that could not take anything still says the streak broke", () => {
    expect(said([penalty("a", 0)])?.text).toBe("A day without a finished task broke your streak. Finish one today!");
  });

  test("a demotion is the heaviest news", () => {
    expect(said([penalty("a", 40), penalty("b", 120, true)])).toEqual({
      stern: true, text: "Your cultivation was shaken: -160 experience, and you fell back a realm. Finish a task today to climb again!",
    });
  });

  test("every line is translated", () => {
    const events: SettleEvent[][] = [[rest("a")], [rest("a"), rest("b")], [penalty("a", 0)], [penalty("a", 5)], [penalty("a", 5), penalty("b", 5)], [penalty("a", 5, true)]];
    for (const set of events) expect(vi[noticeFor(set)!.line.text]).toBeTruthy();
  });
});

describe("goal and numbers", () => {
  const english = (text: string) => text;

  test("numbers are grouped in the language's style", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(1234567, "vi")).toBe("1.234.567");
    expect(formatNumber(12, "vi")).toBe("12");
    expect(formatNumber(-5, "en")).toBe("0");
  });

  test("the goal is the next stage, with what is still missing", () => {
    const line = goalLine(rankOf(10), 10, english, "en")!;
    expect(fill(line.text, line.vars)).toBe("90 more experience to reach Qi Refining, layer 1 – Middle stage");
  });

  test("on the last stage of a realm the goal is to start the breakthrough, then to break through", () => {
    const gate = layerCosts(0).reduce((sum, cost) => sum + cost, 0);
    const last = rankOf(gate - 10);
    const first = goalLine(last, gate - 10, english, "en")!;
    expect(fill(first.text, first.vars)).toBe("10 more experience to start the breakthrough to Foundation Establishment");
    const gathering = rankOf(gate + 100);
    const second = goalLine(gathering, gate + 100, english, "en")!;
    expect(fill(second.text, second.vars)).toBe(`${(realmStart(1) - gate - 100).toLocaleString("en-US")} more experience to break through to Foundation Establishment`);
  });

  test("there is no goal at the top, and the goal texts are translated", () => {
    expect(goalLine(rankOf(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER, english, "en")).toBeNull();
    for (const text of ["{n} more experience to reach {rank}", "{n} more experience to start the breakthrough to {realm}", "{n} more experience to break through to {realm}"]) {
      expect(vi[text]).toBeTruthy();
    }
    expect(rankLabel(rankOf(0), english)).toContain("Qi Refining");
  });
});
