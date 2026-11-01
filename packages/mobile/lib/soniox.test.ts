import { describe, expect, test } from "bun:test";
import { SONIOX_BASE, sonioxError } from "./soniox";

describe("Soniox REST", () => {
  test("errors are read from either field", () => {
    expect(sonioxError({ message: "Invalid API key" })).toBe("Invalid API key");
    expect(sonioxError({ error_message: "Quota" })).toBe("Quota");
    expect(sonioxError({ ok: true })).toBeNull();
  });

  test("the API base", () => {
    expect(SONIOX_BASE).toBe("https://api.soniox.com/v1");
  });
});
