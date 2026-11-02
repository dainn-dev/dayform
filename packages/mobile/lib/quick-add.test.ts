import { describe, expect, test } from "bun:test";
import { parseQuickAdd, quickAddForm, type QuickAddResult } from "./quick-add";

// Monday 2026-11-02, 10:00 local.
const NOW = new Date(2026, 10, 2, 10, 0);
const CATEGORIES = [{ id: "Work", name: "Work" }, { id: "Wellness", name: "Sức khỏe" }, { id: "c_12345678", name: "Học tập" }];
const parse = (text: string) => parseQuickAdd(text, { now: NOW, categories: CATEGORIES });

describe("title only", () => {
  test("plain text is a backlog task", () => {
    expect(parse("Đọc sách")).toEqual({ title: "Đọc sách", date: null, start: null, duration: null, repeat: null, category: null });
  });
  test("empty text has an empty title", () => {
    expect(parse("   ").title).toBe("");
  });
});

describe("times", () => {
  test.each([
    ["họp team 15h", "15:00"],
    ["họp team 15:30", "15:30"],
    ["họp team 3pm", "15:00"],
    ["họp team 9:15 am", "09:15"],
    ["họp team 3h30 chiều", "15:30"],
    ["họp team lúc 3 giờ chiều", "15:00"],
    ["họp team lúc 9", "09:00"],
    ["họp team at 4pm", "16:00"],
    ["họp team 12 giờ trưa", "12:00"],
    ["họp team 1 giờ trưa", "13:00"],
  ])("%s -> %s", (text, start) => {
    const result = parse(`${text} mai`);
    expect(result.start).toBe(start);
    expect(result.title).toBe("họp team");
    expect(result.date).toBe("2026-11-03");
  });

  test("a range sets the start and the duration", () => {
    const result = parse("họp 14h-15h30 mai");
    expect(result).toMatchObject({ title: "họp", start: "14:00", duration: 90, date: "2026-11-03" });
  });

  test("a time already past today goes to tomorrow, one ahead stays today", () => {
    expect(parse("gọi điện 9h")).toMatchObject({ date: "2026-11-03", start: "09:00" });
    expect(parse("gọi điện 17h")).toMatchObject({ date: "2026-11-02", start: "17:00" });
  });

  test("an hour above 23 is not a time", () => {
    expect(parse("ôn thi 25h").start).toBeNull();
  });
});

describe("durations", () => {
  test.each([
    ["45p", 45], ["45 phút", 45], ["45 min", 45], ["30m", 30], ["2 giờ", 120], ["1.5 giờ", 90],
    ["2 hours", 120], ["1 tiếng", 60], ["1 giờ 30 phút", 90], ["for 2h", 120], ["trong 1h30", 90],
  ])("%s -> %d min", (written, minutes) => {
    const result = parse(`viết báo cáo ${written}`);
    expect(result.duration).toBe(minutes);
    expect(result.title).toBe("viết báo cáo");
    expect(result.start).toBeNull();
  });

  test("a bare 'N giờ' after 'lúc' is a time, not a duration", () => {
    expect(parse("họp lúc 2 giờ mai")).toMatchObject({ start: "02:00", duration: null });
  });

  test("the duration is capped to a day", () => {
    expect(parse("trực 99 giờ").duration).toBe(1440);
  });

  test("a time and a duration together", () => {
    expect(parse("họp 15h 45p mai")).toMatchObject({ start: "15:00", duration: 45 });
    expect(parse("meeting 3pm for 1h tomorrow")).toMatchObject({ start: "15:00", duration: 60, date: "2026-11-03" });
  });
});

describe("dates", () => {
  test.each([
    ["hôm nay", "2026-11-02"], ["today", "2026-11-02"],
    ["mai", "2026-11-03"], ["ngày mai", "2026-11-03"], ["tomorrow", "2026-11-03"],
    ["ngày mốt", "2026-11-04"], ["sau 3 ngày", "2026-11-05"], ["in 2 weeks", "2026-11-16"], ["1 tuần nữa", "2026-11-09"],
    ["thứ ba", "2026-11-03"], ["thứ hai", "2026-11-09"], ["t6", "2026-11-06"], ["chủ nhật", "2026-11-08"], ["friday", "2026-11-06"],
    ["thứ sáu tuần sau", "2026-11-13"], ["thứ ba tuần sau", "2026-11-10"], ["next week", "2026-11-09"],
    ["15/11", "2026-11-15"], ["1/11", "2027-11-01"], ["15/11/2027", "2027-11-15"], ["2026-12-25", "2026-12-25"],
    ["ngày 20", "2026-11-20"], ["ngày 1", "2026-12-01"],
  ])("%s -> %s", (written, date) => {
    const result = parse(`nộp bài ${written}`);
    expect(result.date).toBe(date);
    expect(result.title).toBe("nộp bài");
    expect(result.start).toBeNull();
  });

  test("an impossible date stays in the title", () => {
    expect(parse("nộp bài 31/2").date).toBeNull();
  });

  test("a day part alone gives a default time", () => {
    expect(parse("chạy bộ sáng mai")).toMatchObject({ title: "chạy bộ", date: "2026-11-03", start: "09:00" });
    expect(parse("ăn tối nay")).toMatchObject({ title: "ăn", date: "2026-11-02", start: "19:00" });
    expect(parse("tomorrow morning run")).toMatchObject({ title: "run", date: "2026-11-03", start: "09:00" });
  });

  test("an explicit time beats the day part", () => {
    expect(parse("họp 8h sáng mai")).toMatchObject({ date: "2026-11-03", start: "08:00" });
  });

  test("'tôi' is not the evening", () => {
    expect(parse("nhắc tôi mua sữa")).toMatchObject({ title: "nhắc tôi mua sữa", date: null });
    expect(parse("đi chợ tối")).toMatchObject({ title: "đi chợ", start: "19:00" });
  });

  test("'sang' without its accent is not the morning", () => {
    expect(parse("sang nhà bạn")).toMatchObject({ title: "sang nhà bạn", date: null });
  });
});

describe("repeats", () => {
  test.each([
    ["mỗi ngày", "daily"], ["hàng ngày", "daily"], ["every day", "daily"], ["daily", "daily"],
    ["ngày thường", "weekdays"], ["weekdays", "weekdays"],
    ["mỗi tuần", "weekly"], ["weekly", "weekly"],
    ["mỗi tháng", "monthly"], ["monthly", "monthly"],
  ] as const)("%s -> %s", (written, repeat) => {
    const result = parse(`uống thuốc ${written}`);
    expect(result.repeat).toBe(repeat);
    expect(result.title).toBe("uống thuốc");
    expect(result.date).toBe("2026-11-02");
  });

  test("every weekday sets the first date", () => {
    expect(parse("họp nhóm mỗi thứ tư 14h")).toMatchObject({ title: "họp nhóm", repeat: "weekly", date: "2026-11-04", start: "14:00" });
    expect(parse("yoga every friday 7am")).toMatchObject({ title: "yoga", repeat: "weekly", date: "2026-11-06", start: "07:00" });
  });

  test("every morning is daily with a morning time", () => {
    expect(parse("chạy bộ mỗi sáng 6h")).toMatchObject({ title: "chạy bộ", repeat: "daily", start: "06:00" });
    expect(parse("chạy bộ mỗi sáng")).toMatchObject({ repeat: "daily", start: "09:00" });
  });

  test("a time already past still starts a repeat today", () => {
    expect(parse("uống nước 8h mỗi ngày")).toMatchObject({ repeat: "daily", date: "2026-11-02", start: "08:00" });
  });
});

describe("categories", () => {
  test("a #tag picks a category by name or id, ignoring accents", () => {
    expect(parse("họp #work")).toMatchObject({ title: "họp", category: "Work" });
    expect(parse("tập gym #suckhoe")).toMatchObject({ title: "tập gym", category: "Wellness" });
    expect(parse("làm bài #hoc")).toMatchObject({ title: "làm bài", category: "c_12345678" });
  });
  test("an unknown tag is left in the title", () => {
    expect(parse("họp #xyz")).toMatchObject({ title: "họp #xyz", category: null });
  });
  test("without categories a # is plain text", () => {
    expect(parseQuickAdd("họp #work", { now: NOW }).title).toBe("họp #work");
  });
});

describe("a full sentence", () => {
  test("Vietnamese", () => {
    expect(parse("họp team lúc 3pm mai 45p #work")).toEqual({
      title: "họp team", date: "2026-11-03", start: "15:00", duration: 45, repeat: null, category: "Work",
    });
  });
  test("English", () => {
    expect(parse("Dentist on Friday at 4:30pm for 1 hour")).toMatchObject({ title: "Dentist", date: "2026-11-06", start: "16:30", duration: 60 });
  });
  test("a number inside the title is kept", () => {
    expect(parse("đọc chương 3 sách").title).toBe("đọc chương 3 sách");
  });
  test("does not mistake words starting with h for hours", () => {
    expect(parse("mua 5 hoa").title).toBe("mua 5 hoa");
  });
});

describe("quickAddForm", () => {
  const defaults = { duration: 30, category: "Focus", remind: 15, startTime: "09:00" };
  const base: QuickAddResult = { title: "Họp", date: null, start: null, duration: null, repeat: null, category: null };

  test("no title gives no form", () => {
    expect(quickAddForm({ ...base, title: "" }, defaults)).toBeNull();
  });
  test("a backlog task has no reminder or repeat", () => {
    expect(quickAddForm(base, defaults)).toMatchObject({ scheduled: false, remind: null, repeat: null, duration: 30, category: "Focus" });
  });
  test("a scheduled task takes the default reminder and a missing time takes the default start", () => {
    expect(quickAddForm({ ...base, date: "2026-11-03", repeat: "daily" }, defaults)).toMatchObject({
      scheduled: true, date: "2026-11-03", time: "09:00", remind: 15, repeat: "daily",
    });
  });
  test("a task that would pass midnight is shortened, or started earlier when the time was not written", () => {
    expect(quickAddForm({ ...base, date: "2026-11-03", start: "23:00", duration: 120 }, defaults)).toMatchObject({ time: "23:00", duration: 60 });
    expect(quickAddForm({ ...base, date: "2026-11-03", duration: 120 }, { ...defaults, startTime: "23:30" })).toMatchObject({ time: "22:00", duration: 120 });
  });
});
