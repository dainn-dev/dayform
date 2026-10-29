import { describe, test, expect } from "bun:test";
import { fillPlaceholders } from "./text-template";

describe("fillPlaceholders", () => {
  test("fills every named placeholder, in any order", () => {
    expect(fillPlaceholders("{b} before {a}", { a: "1", b: "2" })).toBe("2 before 1");
  });
  test("fills a repeated placeholder each time", () => {
    expect(fillPlaceholders("{a} and {a}", { a: "x" })).toBe("x and x");
  });
  test("leaves unknown placeholders and plain braces untouched", () => {
    expect(fillPlaceholders("{a} {missing} {} { a }", { a: "1" })).toBe("1 {missing} {} { a }");
  });
  test("does not treat replacement text as a pattern or a template", () => {
    expect(fillPlaceholders("{a}", { a: "$& $1 {b}" })).toBe("$& $1 {b}");
  });
  test("ignores inherited object keys", () => {
    expect(fillPlaceholders("{toString} {constructor}", {})).toBe("{toString} {constructor}");
  });
  test("returns the text unchanged when there are no placeholders or values", () => {
    expect(fillPlaceholders("plain", { a: "1" })).toBe("plain");
    expect(fillPlaceholders("", {})).toBe("");
  });
  test("keeps Vietnamese text intact", () => {
    expect(fillPlaceholders("Phiên bản {version} đã sẵn sàng.", { version: "1.0.7" })).toBe("Phiên bản 1.0.7 đã sẵn sàng.");
  });
});
