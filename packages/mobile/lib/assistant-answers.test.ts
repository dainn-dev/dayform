import { describe, expect, test } from "bun:test";
import { answer, fill, greetingLine, QUESTION_IDS, QUESTIONS, talkMs, LINES } from "./assistant-answers";
import { vi } from "./i18n/assistant";
import type { Task } from "./planner";

const NOW = new Date(2026, 9, 30, 10, 0);
const time = (value: string) => value;
let counter = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${counter++}`, title: "Task", date: "2026-10-30", start: "09:00", duration: 30, status: "todo",
  category: "Focus", notes: "", createdAt: "2026-10-01T00:00:00.000Z", ...over,
});
const say = (id: (typeof QUESTION_IDS)[number], tasks: Task[]) => {
  const line = answer(id, tasks, NOW, time);
  return fill(line.text, line.vars);
};

describe("assistant answers", () => {
  test("today counts only today's tasks", () => {
    expect(say("today", [])).toBe("Nothing planned today. A free day!");
    expect(say("today", [task({ date: "2026-10-31" })])).toBe("Nothing planned today. A free day!");
    expect(say("today", [task({ status: "done" })])).toBe("You have 1 task today, 1 done.");
    expect(say("today", [task({}), task({ status: "done" }), task({ date: null, start: null })])).toBe("You have 2 tasks today, 1 done.");
  });

  test("next is the running or the next task, by start time, with the user's own title", () => {
    const tasks = [
      task({ title: "Lunch", start: "12:00" }),
      task({ title: "Standup", start: "09:45", duration: 30 }),
      task({ title: "Done one", start: "10:30", status: "done" }),
    ];
    expect(say("next", tasks)).toBe("Next: Standup at 09:45.");
    expect(say("next", [task({ title: "Lunch", start: "12:00" })])).toBe("Next: Lunch at 12:00.");
  });

  test("next reports tasks left over from earlier when nothing is coming", () => {
    expect(say("next", [task({ start: "08:00", duration: 30 })])).toBe("Nothing else is coming up, but 1 earlier tasks are still open.");
    expect(say("next", [task({ start: "08:00", status: "done" })])).toBe("Nothing else is planned for today.");
  });

  test("progress cheers on", () => {
    expect(say("progress", [])).toBe("Nothing to count yet today.");
    expect(say("progress", [task({}), task({})])).toBe("None of 2 done yet. Let's start with one!");
    expect(say("progress", [task({ status: "done" }), task({})])).toBe("1 of 2 done. Keep going!");
    expect(say("progress", [task({ status: "done" }), task({ status: "done" })])).toBe("All 2 done! Amazing!");
  });

  test("the greeting uses the name only when there is one", () => {
    expect(fill(greetingLine("").text, greetingLine("").vars)).toBe("Oh! You're finally here!");
    expect(fill(greetingLine(" An ").text, greetingLine(" An ").vars)).toBe("Oh! You're finally here, An!");
  });

  test("fill keeps unknown placeholders and talkMs stays within bounds", () => {
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(talkMs("")).toBe(2500);
    expect(talkMs("x".repeat(500))).toBe(7000);
  });

  test("every English line has a Vietnamese translation with the same placeholders", () => {
    const texts = [
      ...Object.values(QUESTIONS), ...Object.values(LINES).map(line => line.text),
      "Nothing planned today. A free day!", "You have 1 task today, {done} done.", "You have {n} tasks today, {done} done.",
      "Next: {title} at {time}.", "Nothing else is coming up, but {n} earlier tasks are still open.", "Nothing else is planned for today.",
      "Nothing to count yet today.", "All {n} done! Amazing!", "None of {n} done yet. Let's start with one!", "{done} of {n} done. Keep going!",
    ];
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const text of texts) {
      expect(vi[text]).toBeDefined();
      expect(holes(vi[text])).toEqual(holes(text));
    }
  });
});
