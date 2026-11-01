import { describe, expect, test } from "bun:test";
import { detectWake, matchPreset, parseYesNo, saysGoodbye } from "./voice-command";

describe("wake phrase", () => {
  test("the Vietnamese and English ways of calling by name", () => {
    expect(detectWake("Leo ơi", "Leo")).toEqual({ heard: true, rest: "" });
    expect(detectWake("hey Leo", "Leo")).toEqual({ heard: true, rest: "" });
    expect(detectWake("Ê Leo", "Leo")).toEqual({ heard: true, rest: "" });
    expect(detectWake("Này Leo", "Leo")).toEqual({ heard: true, rest: "" });
  });

  test("a question said in the same breath is kept, with its marks", () => {
    expect(detectWake("Leo ơi hôm nay có gì", "Leo")).toEqual({ heard: true, rest: "hôm nay có gì" });
    expect(detectWake("Hey Leo, what's next?", "Leo")).toEqual({ heard: true, rest: "what's next?" });
  });

  test("missing or wrong accents from the recognizer still match", () => {
    expect(detectWake("leo oi", "Leo").heard).toBe(true);
    expect(detectWake("Mây ơi", "Mây").heard).toBe(true);
    expect(detectWake("may oi", "Mây").heard).toBe(true);
  });

  test("a name of several words", () => {
    expect(detectWake("Bé Na ơi thêm việc", "Bé Na")).toEqual({ heard: true, rest: "thêm việc" });
  });

  test("a sentence that only mentions the name does not wake it", () => {
    expect(detectWake("hôm qua tôi gặp Leo ở quán", "Leo").heard).toBe(false);
    expect(detectWake("xin chào", "Leo").heard).toBe(false);
    expect(detectWake("Leo", "Leo")).toEqual({ heard: true, rest: "" });
    expect(detectWake("Leo ơi", "")).toEqual({ heard: false });
  });
});

describe("spoken yes or no", () => {
  test("yes", () => {
    for (const said of ["Có", "đồng ý", "OK", "được", "ừ làm đi", "yes please", "Vâng."]) expect(parseYesNo(said)).toBe("yes");
  });

  test("no wins over yes", () => {
    for (const said of ["Không", "thôi", "hủy đi", "không đồng ý", "No."]) expect(parseYesNo(said)).toBe("no");
  });

  test("anything else waits for a tap", () => {
    expect(parseYesNo("để mình nghĩ đã")).toBeNull();
  });
});

describe("preset questions without the AI", () => {
  test("by keywords", () => {
    expect(matchPreset("hôm nay có gì")).toBe("today");
    expect(matchPreset("việc tiếp theo là gì")).toBe("next");
    expect(matchPreset("mình làm được bao nhiêu rồi")).toBe("progress");
    expect(matchPreset("kể chuyện cười đi")).toBeNull();
  });
});

describe("ending the conversation", () => {
  test("short thanks or goodbye ends it; a longer sentence does not", () => {
    expect(saysGoodbye("Cảm ơn Leo")).toBe(true);
    expect(saysGoodbye("thôi")).toBe(true);
    expect(saysGoodbye("cảm ơn, giờ thêm việc gọi mẹ lúc tám giờ tối")).toBe(false);
  });
});
