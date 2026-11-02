import { describe, expect, test } from "bun:test";
import { describeParts, readAddRequest, shouldAdd, spokenProposal } from "./assistant-add";
import { planQuickAdd } from "./quick-add-plan";
import { DEFAULT_SETTINGS } from "./settings";

// Monday 2026-11-02, 10:00 local.
const NOW = new Date(2026, 10, 2, 10, 0);
const CATEGORIES = [{ id: "Focus", name: "Focus" }, { id: "Work", name: "Work" }];
let n = 0;
const plan = (text: string) => planQuickAdd(text, { now: NOW, categories: CATEGORIES, settings: DEFAULT_SETTINGS, newId: () => `id${n++}`, newSeriesId: () => `s${n++}` });

describe("readAddRequest", () => {
  test.each([
    ["thêm họp nhóm 3pm mai", "họp nhóm 3pm mai"],
    ["Thêm việc họp nhóm 3pm mai", "họp nhóm 3pm mai"],
    ["tạo công việc đi chợ chiều nay", "đi chợ chiều nay"],
    ["giúp mình thêm một việc đọc sách 20p", "đọc sách 20p"],
    ["nhắc tôi uống thuốc 8h mỗi ngày", "uống thuốc 8h mỗi ngày"],
    ["nhắc mình gọi điện cho mẹ", "gọi điện cho mẹ"],
    ["đặt lịch khám răng thứ sáu 9h", "khám răng thứ sáu 9h"],
    ["add gym 6pm friday", "gym 6pm friday"],
    ["please create a task: pay rent every month", "pay rent every month"],
    ["remind me to call mom tomorrow 5pm", "call mom tomorrow 5pm"],
  ])("%s", (said, text) => {
    expect(readAddRequest(said)).toMatchObject({ explicit: true, text, questionLike: false });
  });

  test("a sentence without a verb is passed on whole", () => {
    expect(readAddRequest("họp nhóm 3pm mai")).toEqual({ explicit: false, text: "họp nhóm 3pm mai", questionLike: false });
  });

  test("questions are recognised", () => {
    expect(readAddRequest("lịch hôm nay có gì?").questionLike).toBe(true);
    expect(readAddRequest("khi nào tôi họp").questionLike).toBe(true);
    expect(readAddRequest("what is next").questionLike).toBe(true);
  });

  test("only the verb is cut: the accents and the order of the rest are kept", () => {
    expect(readAddRequest("Thêm   Đọc sách,  tối nay.").text).toBe("Đọc sách, tối nay");
  });
});

describe("shouldAdd", () => {
  test("an explicit verb adds even a backlog task", () => {
    const request = readAddRequest("thêm mua sữa");
    expect(shouldAdd(request, plan(request.text))).toBe(true);
  });

  test("an explicit verb with nothing after it adds nothing", () => {
    const request = readAddRequest("thêm");
    expect(shouldAdd(request, plan(request.text))).toBe(false);
  });

  test("without a verb it must be scheduled and not a question", () => {
    const said = (text: string) => shouldAdd(readAddRequest(text), plan(readAddRequest(text).text));
    expect(said("họp nhóm 3pm mai")).toBe(true);
    expect(said("mua sữa")).toBe(false);
    expect(said("họp nhóm lúc mấy giờ mai?")).toBe(false);
    expect(said("khi nào tôi họp mai")).toBe(false);
  });
});

describe("describing the proposal", () => {
  const ctx = {
    today: "2026-11-02", t: (text: string) => text, time: (v: string) => v, duration: (m: number) => `${m} min`,
    date: (key: string) => `on ${key}`, category: (id: string) => id,
  };

  test("parts of a scheduled, repeating task", () => {
    const { form } = plan("uống thuốc 8h mỗi ngày");
    expect(describeParts(form!, ctx)).toEqual(["Today 08:00", "30 min", "Every day", "Focus"]);
  });

  test("tomorrow, a far day and a backlog task", () => {
    expect(describeParts(plan("họp 3pm mai 45p #work").form!, ctx)).toEqual(["Tomorrow 15:00", "45 min", "Work"]);
    expect(describeParts(plan("họp 3pm 15/11").form!, ctx)[0]).toBe("on 2026-11-15 15:00");
    expect(describeParts(plan("mua sữa").form!, ctx)[0]).toBe("On your mind");
  });

  test("the spoken proposal reads title, parts, then the question", () => {
    expect(spokenProposal("Họp", ["Tomorrow 15:00", "45 min"], "Shall I?")).toBe("Họp. Tomorrow 15:00, 45 min. Shall I?");
  });
});
