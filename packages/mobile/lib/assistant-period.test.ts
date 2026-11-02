import { describe, expect, test } from "bun:test";
import { periodAnswer, PERIOD_LINES, PERIOD_QUESTION } from "./assistant-period";
import { vi } from "./i18n/assistant";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle-model";
import { addDays } from "./planner";

const TODAY = "2026-10-10";
const CYCLE = 28;
const format = (key: string) => `<${key}>`;

const tracking = (starts: string[], patch: Partial<CycleState> = {}): CycleState => ({
  ...DEFAULT_CYCLE_STATE, enabled: true, acknowledged: true, periods: starts.map(start => ({ start })), ...patch,
});

/** Four period starts, 28 days apart, the last on `lastStart`: three even cycles. */
const evenCycles = (lastStart: string): string[] => [3, 2, 1, 0].map(back => addDays(lastStart, -back * CYCLE));

describe("translations", () => {
  test("every text the assistant can say about the period has a Vietnamese string with the same placeholders", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();
    const states = [
      { ...DEFAULT_CYCLE_STATE, enabled: false }, tracking([]), tracking(evenCycles(addDays(TODAY, -5)), { paused: true }),
      tracking(evenCycles(addDays(TODAY, -5))), tracking(evenCycles(addDays(TODAY, -(CYCLE - 1)))), tracking(evenCycles(addDays(TODAY, -CYCLE))),
      tracking(evenCycles("2026-09-12")),
    ];
    const lines = [
      ...states.map(state => periodAnswer(state, TODAY, format)),
      periodAnswer(states[6]!, "2026-10-11", format), periodAnswer(states[6]!, "2026-10-13", format),
      PERIOD_LINES.notYou, PERIOD_LINES.notReady,
    ];
    for (const line of lines) {
      expect(vi[line.text]).toBeTruthy();
      expect(placeholders(vi[line.text]!)).toEqual(placeholders(line.text));
    }
    expect(vi[PERIOD_QUESTION]).toBeTruthy();
  });
});

describe("the period question", () => {
  test("has an English text that is also its translation key", () => {
    expect(PERIOD_QUESTION).toBe("When is my next period?");
  });
});

describe("periodAnswer", () => {
  test("says when tracking is off, without reading any data", () => {
    const line = periodAnswer({ ...DEFAULT_CYCLE_STATE, enabled: false, periods: [{ start: "2026-09-01" }] }, TODAY, format);
    expect(line.text).toBe("Period tracking is off. You can turn it on under Personal, Cycle.");
    expect(line.vars).toBeUndefined();
  });

  test("asks for dates when there are too few to estimate", () => {
    expect(periodAnswer(tracking([]), TODAY, format).text).toContain("at least two period start dates");
    expect(periodAnswer(tracking(["2026-09-01"]), TODAY, format).text).toContain("at least two period start dates");
  });

  test("says it cannot estimate while tracking is paused", () => {
    const state = tracking(evenCycles(addDays(TODAY, -5)), { paused: true });
    expect(periodAnswer(state, TODAY, format).text).toBe("Tracking is paused, so I can't estimate your next period.");
  });

  test("counts the days to the next period, with its date", () => {
    // The last period began 5 days ago, so the next one is due in 23 days.
    const line = periodAnswer(tracking(evenCycles(addDays(TODAY, -5))), TODAY, format);
    expect(line.text).toBe("Your next period is expected in {n} days, around {date}. It's only an estimate.");
    expect(line.vars).toEqual({ n: 23, date: "<2026-11-02>" });
  });

  test("says tomorrow and today in words", () => {
    const tomorrow = periodAnswer(tracking(evenCycles(addDays(TODAY, -(CYCLE - 1)))), TODAY, format);
    expect(tomorrow.text).toBe("Your next period is expected tomorrow. It's only an estimate.");
    const today = periodAnswer(tracking(evenCycles(addDays(TODAY, -CYCLE))), TODAY, format);
    expect(today.text).toBe("Your next period is expected today. It's only an estimate.");
  });

  test("says how late it is when the expected day has passed", () => {
    const state = tracking(evenCycles("2026-09-12"));
    const line = periodAnswer(state, "2026-10-13", format);
    expect(line.text).toBe("Your period is {n} days later than your usual cycle. It's only an estimate.");
    expect(line.vars).toEqual({ n: 3 });
    expect(periodAnswer(state, "2026-10-11", format).text).toBe("Your period is 1 day later than your usual cycle. It's only an estimate.");
  });

  test("never speaks of fertility, ovulation or safe days", () => {
    const texts = [
      periodAnswer(tracking(evenCycles(addDays(TODAY, -5))), TODAY, format).text,
      periodAnswer(tracking([]), TODAY, format).text,
      periodAnswer(tracking(evenCycles(addDays(TODAY, -5)), { paused: true }), TODAY, format).text,
      periodAnswer({ ...DEFAULT_CYCLE_STATE }, TODAY, format).text,
    ];
    for (const text of texts) expect(text).not.toMatch(/fertil|ovulat|safe|pregnan|contracept/i);
  });
});
