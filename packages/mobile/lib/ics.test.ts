import { describe, expect, test } from "bun:test";
import { IMPORT_WINDOW_DAYS, MAX_IMPORTED_TASKS, importedTaskId, parseIcs, planIcsImport } from "./ics";
import { taskSchema } from "./task-storage";

const TODAY = "2026-03-02"; // a Monday
const calendar = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const event = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
const read = (text: string) => {
  const result = parseIcs(text, TODAY);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe("one event", () => {
  test("a local time with an end", () => {
    const { occurrences } = read(calendar(event("UID:a", "SUMMARY:Dentist", "DTSTART:20260304T143000", "DTEND:20260304T153000", "DESCRIPTION:Bring the card\\, please\\nSecond floor")));
    expect(occurrences).toEqual([{ uid: "a", title: "Dentist", date: "2026-03-04", start: "14:30", duration: 60, notes: "Bring the card, please\nSecond floor" }]);
  });

  test("a TZID time is taken as written; a UTC time is shown in local time", () => {
    const tz = read(calendar(event("UID:t", "DTSTART;TZID=Asia/Ho_Chi_Minh:20260305T090000", "DURATION:PT45M"))).occurrences[0];
    expect(tz).toMatchObject({ date: "2026-03-05", start: "09:00", duration: 45 });
    const utc = read(calendar(event("UID:u", "DTSTART:20260305T090000Z", "DTEND:20260305T100000Z"))).occurrences[0];
    const local = new Date(Date.UTC(2026, 2, 5, 9, 0));
    expect(utc.start).toBe(`${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`);
    expect(utc.duration).toBe(60);
  });

  test("no end gives an hour, and a long folded title is unfolded", () => {
    const { occurrences } = read(calendar(event("UID:f", "SUMMARY:A very long", "  title", "DTSTART:20260305T090000")));
    expect(occurrences[0]).toMatchObject({ title: "A very long title", duration: 60 });
  });

  test("an event that runs past midnight is cut there", () => {
    const { occurrences } = read(calendar(event("UID:n", "DTSTART:20260305T230000", "DTEND:20260306T020000")));
    expect(occurrences[0]).toMatchObject({ start: "23:00", duration: 60 });
  });

  test("a missing title becomes 'Event' and a missing UID still gives a stable one", () => {
    const first = read(calendar(event("DTSTART:20260305T090000"))).occurrences[0];
    const second = read(calendar(event("DTSTART:20260305T090000"))).occurrences[0];
    expect(first.title).toBe("Event");
    expect(first.uid).toBe(second.uid);
  });
});

describe("skipped events", () => {
  test("all-day, cancelled, past and rules it does not understand are counted, not imported", () => {
    const result = read(calendar(
      event("UID:1", "DTSTART;VALUE=DATE:20260305"),
      event("UID:2", "DTSTART:20260305T090000", "STATUS:CANCELLED"),
      event("UID:3", "DTSTART:20260101T090000"),
      event("UID:4", "DTSTART:20260305T090000", "RRULE:FREQ=YEARLY"),
      event("UID:5", "DTSTART:20260305T090000", "RRULE:FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO"),
      event("UID:6", "SUMMARY:No start"),
      event("UID:7", "DTSTART:20260307T090000"),
    ));
    expect(result.occurrences.map(o => o.uid)).toEqual(["7"]);
    expect(result.skipped).toEqual({ allDay: 1, cancelled: 1, unsupported: 3, outsideWindow: 1 });
  });

  test("a file that is not a calendar, or is huge, is refused", () => {
    expect(parseIcs("hello", TODAY)).toEqual({ ok: false, reason: "not-calendar" });
    expect(parseIcs(`BEGIN:VCALENDAR${"x".repeat(2_000_001)}`, TODAY)).toEqual({ ok: false, reason: "too-large" });
  });

  test("events beyond the window are left out", () => {
    const far = read(calendar(event("UID:far", "DTSTART:20261001T090000")));
    expect(far.occurrences).toEqual([]);
    expect(IMPORT_WINDOW_DAYS).toBe(90);
  });
});

describe("repeats", () => {
  const dates = (rule: string, start = "20260302T090000", extra: string[] = []) =>
    read(calendar(event("UID:r", `DTSTART:${start}`, `RRULE:${rule}`, ...extra))).occurrences.map(o => o.date);

  test("daily with a count", () => {
    expect(dates("FREQ=DAILY;COUNT=3")).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
  });

  test("every other day until a date", () => {
    expect(dates("FREQ=DAILY;INTERVAL=2;UNTIL=20260308T000000Z")).toEqual(["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-08"]);
  });

  test("weekly on several days, and every second week", () => {
    expect(dates("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4")).toEqual(["2026-03-02", "2026-03-04", "2026-03-09", "2026-03-11"]);
    expect(dates("FREQ=WEEKLY;INTERVAL=2;COUNT=3")).toEqual(["2026-03-02", "2026-03-16", "2026-03-30"]);
  });

  test("weekly without BYDAY repeats on the start's weekday", () => {
    expect(dates("FREQ=WEEKLY;COUNT=2", "20260304T090000")).toEqual(["2026-03-04", "2026-03-11"]);
  });

  test("monthly skips a month without that day", () => {
    expect(dates("FREQ=MONTHLY;COUNT=4", "20260131T090000")).toEqual(["2026-03-31"]);
    expect(dates("FREQ=MONTHLY;COUNT=3", "20260315T090000")).toEqual(["2026-03-15", "2026-04-15", "2026-05-15"]);
  });

  test("EXDATE removes a day and a rule that began in the past still fills the window", () => {
    expect(dates("FREQ=DAILY;COUNT=5", "20260301T090000", ["EXDATE:20260303T090000"])).toEqual(["2026-03-02", "2026-03-04", "2026-03-05"]);
    const open = read(calendar(event("UID:o", "DTSTART:20250101T090000", "RRULE:FREQ=WEEKLY;BYDAY=FR"))).occurrences;
    expect(open[0].date).toBe("2026-03-06");
    expect(open.length).toBeGreaterThan(10);
  });

  test("the number of imported occurrences is capped", () => {
    const result = read(calendar(event("UID:d", "DTSTART:20260302T090000", "RRULE:FREQ=DAILY"), event("UID:e", "DTSTART:20260302T100000", "RRULE:FREQ=DAILY"), event("UID:g", "DTSTART:20260302T110000", "RRULE:FREQ=DAILY"), event("UID:h", "DTSTART:20260302T120000", "RRULE:FREQ=DAILY")));
    expect(result.occurrences).toHaveLength(MAX_IMPORTED_TASKS);
    expect(result.truncated).toBe(true);
  });
});

describe("planIcsImport", () => {
  const occurrences = read(calendar(event("UID:a", "SUMMARY:One", "DTSTART:20260304T090000"), event("UID:b", "SUMMARY:Two", "DTSTART:20260305T090000"))).occurrences;

  test("builds valid tasks with deterministic ids", () => {
    const { toAdd, alreadyThere } = planIcsImport(occurrences, [], "Work", "2026-03-02T00:00:00.000Z");
    expect(alreadyThere).toBe(0);
    expect(toAdd.map(t => t.id)).toEqual(occurrences.map(importedTaskId));
    expect(toAdd.every(t => taskSchema.safeParse(t).success)).toBe(true);
    expect(toAdd[0]).toMatchObject({ title: "One", category: "Work", status: "todo", remind: null });
  });

  test("importing again adds nothing and never touches what the user changed", () => {
    const first = planIcsImport(occurrences, [], "Work", "x").toAdd;
    const edited = first.map(t => ({ ...t, status: "done" as const }));
    const again = planIcsImport(occurrences, edited, "Work", "x");
    expect(again).toEqual({ toAdd: [], alreadyThere: 2 });
  });
});
