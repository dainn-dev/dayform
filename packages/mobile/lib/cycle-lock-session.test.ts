import { afterEach, expect, test } from "bun:test";
import { readUnlockedAt, writeUnlockedAt } from "./cycle-lock-session";

afterEach(() => writeUnlockedAt(null));

test("starts locked and remembers an unlock for this run only", () => {
  expect(readUnlockedAt()).toBeNull();
  writeUnlockedAt(1234);
  expect(readUnlockedAt()).toBe(1234);
  writeUnlockedAt(null);
  expect(readUnlockedAt()).toBeNull();
});
