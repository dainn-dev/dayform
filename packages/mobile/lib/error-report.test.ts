import { describe, test, expect } from "bun:test";
import { DEFAULT_STACK_LINES, MAX_MESSAGE_CHARS, formatErrorDetails } from "./error-report";

describe("formatErrorDetails", () => {
  test("returns message then trimmed stack lines for an Error", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at a (a.js:1:1)\n    at b (b.js:2:2)\n";
    expect(formatErrorDetails(error)).toBe("boom\n    at a (a.js:1:1)\n    at b (b.js:2:2)");
  });

  test("drops the stack header line that repeats the message", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at a (a.js:1:1)";
    expect(formatErrorDetails(error).split("\n")).toHaveLength(2);
  });

  test("limits the stack to maxStackLines", () => {
    const error = new Error("boom");
    const frames = Array.from({ length: 30 }, (_, i) => `    at f${i} (f.js:${i}:1)`);
    error.stack = ["Error: boom", ...frames].join("\n");
    const lines = formatErrorDetails(error, 3).split("\n");
    expect(lines).toEqual(["boom", frames[0], frames[1], frames[2]]);
  });

  test("uses DEFAULT_STACK_LINES when no limit is given", () => {
    const error = new Error("boom");
    const frames = Array.from({ length: DEFAULT_STACK_LINES + 10 }, (_, i) => `    at f${i}`);
    error.stack = ["Error: boom", ...frames].join("\n");
    expect(formatErrorDetails(error).split("\n")).toHaveLength(1 + DEFAULT_STACK_LINES);
  });

  test("handles an Error without a stack", () => {
    const error = new Error("no stack");
    error.stack = undefined;
    expect(formatErrorDetails(error)).toBe("no stack");
  });

  test("falls back to a generic message for an empty message", () => {
    const error = new Error("");
    error.stack = undefined;
    expect(formatErrorDetails(error)).toBe("Unknown error");
  });

  test("drops a bare name header when the message is empty", () => {
    const error = new Error("");
    error.stack = "Error\n    at a (a.js:1:1)";
    expect(formatErrorDetails(error)).toBe("Unknown error\n    at a (a.js:1:1)");
  });

  test("stringifies non-Error throwables", () => {
    expect(formatErrorDetails("plain string")).toBe("plain string");
    expect(formatErrorDetails(42)).toBe("42");
    expect(formatErrorDetails(null)).toBe("Unknown error");
    expect(formatErrorDetails(undefined)).toBe("Unknown error");
  });

  test("serialises plain objects with a message", () => {
    expect(formatErrorDetails({ message: "from object" })).toBe("from object");
  });

  test("trims trailing whitespace and blank lines", () => {
    const error = new Error("  boom  ");
    error.stack = "Error: boom\n    at a (a.js:1:1)   \n\n   \n";
    expect(formatErrorDetails(error)).toBe("boom\n    at a (a.js:1:1)");
  });

  test("clamps a non-positive maxStackLines to message only", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at a";
    expect(formatErrorDetails(error, 0)).toBe("boom");
  });
});

describe("formatErrorDetails message cap", () => {
  test("a message at the cap is untouched", () => {
    const message = "m".repeat(MAX_MESSAGE_CHARS);
    const error = new Error(message);
    error.stack = undefined;
    expect(formatErrorDetails(error)).toBe(message);
  });

  test("a longer message is cut to the cap with an ellipsis", () => {
    const error = new Error("m".repeat(MAX_MESSAGE_CHARS + 500));
    error.stack = undefined;
    expect(formatErrorDetails(error)).toBe(`${"m".repeat(MAX_MESSAGE_CHARS)}…`);
  });

  test("never cuts an emoji in half", () => {
    const error = new Error("😀".repeat(MAX_MESSAGE_CHARS + 1));
    error.stack = undefined;
    expect(formatErrorDetails(error)).toBe(`${"😀".repeat(MAX_MESSAGE_CHARS)}…`);
  });

  test("the cap applies to thrown strings too", () => {
    expect(formatErrorDetails("s".repeat(1000))).toHaveLength(MAX_MESSAGE_CHARS + 1);
  });
});
