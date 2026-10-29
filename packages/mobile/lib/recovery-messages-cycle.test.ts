import { describe, expect, test } from "bun:test";
import { formatNotice, type ImportSummary } from "./backup-flow";
import { DEFAULT_CYCLE_STATE } from "./cycle";
import { vi as cycleNotifyVi } from "./i18n/cycle-notify";
import { vi as cyclePrivacyVi } from "./i18n/cycle-privacy";
import {
  INCLUDES_PERSONAL_DATA,
  PERSONAL_DATA_RESTORED,
  REPLACE_PERSONAL_DATA_QUESTION,
  REPLACE_TASKS_AND_PERSONAL_QUESTION,
  replaceCopyQuestion,
  isPersonalDataOnly,
  kindLabel,
  previewSummaryParts,
  restoredNotice,
} from "./recovery-messages";

const identity = (text: string) => text;
const summary = (overrides: Partial<ImportSummary> = {}): ImportSummary => ({
  found: 0, skipped: 0, added: 0, updated: 0, unchanged: 0, removed: 0, resulting: 0, ...overrides,
});

describe("recovery messages for the period tracker", () => {
  const withCycle = (tasks: number, rejected = 0) => ({
    tasks: Array.from({ length: tasks }, (_, i) => ({ id: String(i) })) as never,
    rejected,
    cycle: DEFAULT_CYCLE_STATE,
  });

  test("the cycle copy has its own neutral label that never names the feature", () => {
    const label = kindLabel("cycle");
    expect(new Set([kindLabel("backup"), kindLabel("corrupt"), kindLabel("snapshot"), label]).size).toBe(4);
    expect(label.toLowerCase()).not.toMatch(/period|cycle|health|fertil/);
    expect(cycleNotifyVi[label]).toBeTruthy();
  });

  test("a preview says personal data is included without naming it", () => {
    expect(formatNotice(previewSummaryParts(withCycle(0)), identity)).toBe("Includes personal data");
    expect(formatNotice(previewSummaryParts(withCycle(2, 1)), identity)).toBe("2 tasks in this copy, 1 task skipped, Includes personal data");
    expect(INCLUDES_PERSONAL_DATA.toLowerCase()).not.toMatch(/period|health/);
  });

  test("isPersonalDataOnly is true only for no tasks plus tracker data", () => {
    expect(isPersonalDataOnly(withCycle(0))).toBe(true);
    expect(isPersonalDataOnly(withCycle(1))).toBe(false);
    expect(isPersonalDataOnly({ tasks: [], rejected: 0 })).toBe(false);
  });

  test("restoredNotice mentions the tracker only when it failed, or when it was the only thing restored", () => {
    const base = summary({ added: 1 });
    expect(formatNotice(restoredNotice(base, "applied", { cycle: "failed" }).parts, identity)).toBe("1 task restored, Personal data could not be restored");
    expect(formatNotice(restoredNotice(base, undefined, { cycle: "applied" }).parts, identity)).toBe("1 task restored");
    expect(formatNotice(restoredNotice(summary(), undefined, { cycleOnly: true, cycle: "applied" }).parts, identity)).toBe("Personal data restored");
    expect(restoredNotice(summary(), undefined, { cycleOnly: true }).tone).toBe("success");
  });

  test("the translated keys exist", () => {
    for (const key of [PERSONAL_DATA_RESTORED, REPLACE_PERSONAL_DATA_QUESTION, INCLUDES_PERSONAL_DATA]) expect(cycleNotifyVi[key]).toBeTruthy();
  });
});

describe("replaceCopyQuestion", () => {
  const cycle = DEFAULT_CYCLE_STATE;
  const one = [{ id: "a" }] as never;

  test("mentions personal data whenever the copy carries tracker data", () => {
    expect(replaceCopyQuestion("snapshot", { tasks: one, cycle })).toBe(REPLACE_TASKS_AND_PERSONAL_QUESTION);
    expect(replaceCopyQuestion("snapshot", { tasks: [], cycle })).toBe(REPLACE_PERSONAL_DATA_QUESTION);
    expect(replaceCopyQuestion("cycle", { tasks: [], cycle })).toBe(REPLACE_PERSONAL_DATA_QUESTION);
  });

  test("a copy without tracker data asks only about the tasks", () => {
    expect(replaceCopyQuestion("snapshot", { tasks: one })).toBe("Replace all your current tasks with this copy?");
  });

  test("before the preview is known the kind decides", () => {
    expect(replaceCopyQuestion("cycle", null)).toBe(REPLACE_PERSONAL_DATA_QUESTION);
    expect(replaceCopyQuestion("backup", null)).toBe("Replace all your current tasks with this copy?");
  });

  test("the new question is translated and neutral", () => {
    expect(cyclePrivacyVi[REPLACE_TASKS_AND_PERSONAL_QUESTION]).toBeTruthy();
    expect(REPLACE_TASKS_AND_PERSONAL_QUESTION.toLowerCase()).not.toMatch(/period|health|cycle/);
  });
});
