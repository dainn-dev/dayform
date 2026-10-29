import { describe, expect, test } from "bun:test";
import { weekdayShort } from "./weekdays";

describe("weekdayShort", () => {
  test("English short names", () => {
    expect(weekdayShort("2026-10-26", "en")).toBe("Mon");
    expect(weekdayShort("2026-10-31", "en")).toBe("Sat");
    expect(weekdayShort("2026-10-25", "en")).toBe("Sun");
  });
  test("Vietnamese names: T2..T7 and CN for Sunday", () => {
    expect(weekdayShort("2026-10-26", "vi")).toBe("T2");
    expect(weekdayShort("2026-10-31", "vi")).toBe("T7");
    expect(weekdayShort("2026-10-25", "vi")).toBe("CN");
  });
  test("labels follow the date, so any week start orders correctly", () => {
    const sunStart = ["2026-10-25", "2026-10-26", "2026-10-27"].map(key => weekdayShort(key, "vi"));
    expect(sunStart).toEqual(["CN", "T2", "T3"]);
  });
});
