import { describe, test, expect } from "bun:test";
import { parseJson } from "./json";

describe("parseJson", () => {
  test("returns the parsed value", () => {
    expect(parseJson('{"a":[1,2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
    expect(parseJson("null")).toEqual({ ok: true, value: null });
    expect(parseJson("0")).toEqual({ ok: true, value: 0 });
  });

  test("returns a typed failure instead of throwing", () => {
    expect(parseJson("{oops")).toEqual({ ok: false });
    expect(parseJson("")).toEqual({ ok: false });
    expect(parseJson("undefined")).toEqual({ ok: false });
  });
});
