import { describe, expect, test } from "bun:test";
import { rangeTitle } from "./range-title";

describe("rangeTitle", () => {
  test("a week inside one year shows the year once, at the end", () => {
    expect(rangeTitle("week", { from: "2026-05-04", to: "2026-05-10" }, "en-US")).toBe("May 4 – May 10, 2026");
  });

  test("a week spanning two years shows both years", () => {
    const title = rangeTitle("week", { from: "2025-12-29", to: "2026-01-04" }, "en-US");
    expect(title).toBe("Dec 29, 2025 – Jan 4, 2026");
  });

  test("the two-year rule holds in Vietnamese too", () => {
    const title = rangeTitle("week", { from: "2025-12-29", to: "2026-01-04" }, "vi-VN");
    expect(title).toContain("2025");
    expect(title).toContain("2026");
  });

  test("a month shows the long month name and year", () => {
    expect(rangeTitle("month", { from: "2026-05-01", to: "2026-05-31" }, "en-US")).toBe("May 2026");
  });

  test("a week across a month end keeps both months", () => {
    expect(rangeTitle("week", { from: "2026-03-30", to: "2026-04-05" }, "en-US")).toBe("Mar 30 – Apr 5, 2026");
  });
});

describe("rangeTitle with another week start", () => {
  test("a Sunday-start week", () => {
    expect(rangeTitle("week", { from: "2026-05-03", to: "2026-05-09" }, "en-US")).toBe("May 3 – May 9, 2026");
  });
  test("a Saturday-start week across a year boundary", () => {
    expect(rangeTitle("week", { from: "2025-12-27", to: "2026-01-02" }, "en-US")).toBe("Dec 27, 2025 – Jan 2, 2026");
  });
});
