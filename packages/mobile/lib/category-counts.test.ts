import { describe, expect, test } from "bun:test";
import { countTasksByCategory, taskCountOf } from "./category-counts";

describe("countTasksByCategory", () => {
  test("counts tasks per category id", () => {
    const counts = countTasksByCategory([{ category: "Work" }, { category: "c_abc12345" }, { category: "Work" }]);
    expect(taskCountOf(counts, "Work")).toBe(2);
    expect(taskCountOf(counts, "c_abc12345")).toBe(1);
  });

  test("returns zero for categories nothing uses, including prototype-like ids", () => {
    const counts = countTasksByCategory([{ category: "Work" }]);
    expect(taskCountOf(counts, "Focus")).toBe(0);
    expect(taskCountOf(counts, "__proto__")).toBe(0);
    expect(taskCountOf(counts, "constructor")).toBe(0);
  });

  test("handles an empty list and ids that look like prototype keys", () => {
    expect(countTasksByCategory([]).size).toBe(0);
    expect(taskCountOf(countTasksByCategory([{ category: "__proto__" }]), "__proto__")).toBe(1);
  });
});
