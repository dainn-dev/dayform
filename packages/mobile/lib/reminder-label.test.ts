import { describe, test, expect } from "bun:test";
import { reminderLabelKey, fillPlaceholder } from "./reminder-label";

describe("reminderLabelKey", () => {
  test("keeps the preset keys", () => {
    expect(reminderLabelKey(0)).toEqual({ key: "At start time" });
    expect(reminderLabelKey(5)).toEqual({ key: "5 min before" });
    expect(reminderLabelKey(15)).toEqual({ key: "15 min before" });
    expect(reminderLabelKey(30)).toEqual({ key: "30 min before" });
    expect(reminderLabelKey(60)).toEqual({ key: "1 hour before" });
  });

  test("builds a translatable key plus a count for custom minutes", () => {
    expect(reminderLabelKey(45)).toEqual({ key: "{n} min before", n: 45 });
    expect(reminderLabelKey(90)).toEqual({ key: "{n} min before", n: 90 });
  });

  test("uses hours for whole custom hours", () => {
    expect(reminderLabelKey(120)).toEqual({ key: "{n} hours before", n: 2 });
    expect(reminderLabelKey(1440)).toEqual({ key: "{n} hours before", n: 24 });
  });
});

describe("fillPlaceholder", () => {
  test("replaces {n} with the count", () => {
    expect(fillPlaceholder("Trước {n} phút", 45)).toBe("Trước 45 phút");
  });
  test("leaves text without a placeholder alone", () => {
    expect(fillPlaceholder("Đúng giờ", undefined)).toBe("Đúng giờ");
  });
});
