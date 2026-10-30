import { describe, expect, test } from "bun:test";
import { INITIAL_MACHINE, nextState, registerTap, TEASE_TAPS, TEASE_WINDOW_MS, type AssistantEvent, type Machine } from "./assistant-state";

const run = (events: AssistantEvent["type"][], from: Machine = INITIAL_MACHINE): Machine =>
  events.reduce((machine, type) => nextState(machine, { type } as AssistantEvent), from);

describe("assistant state machine", () => {
  test("greets on opening the app, then idles", () => {
    expect(run(["appOpened"]).state).toBe("greeting");
    expect(run(["appOpened", "done"]).state).toBe("idle");
  });

  test("a question goes listening, thinking, talking and back to idle", () => {
    expect(run(["asked"]).state).toBe("listening");
    expect(run(["asked", "questionChosen"]).state).toBe("thinking");
    expect(run(["asked", "questionChosen", "answerStarted"]).state).toBe("talking");
    expect(run(["asked", "questionChosen", "answerStarted", "answerDone"]).state).toBe("idle");
  });

  test("closing the question menu without a question goes back to idle", () => {
    expect(run(["asked", "cancelled"]).state).toBe("idle");
  });

  test("a long time without a touch makes it sleepy, and a poke wakes it into listening", () => {
    expect(run(["inactive"]).state).toBe("sleepy");
    expect(run(["inactive", "poked"]).state).toBe("listening");
  });

  test("teasing and good news are short reactions that end in idle", () => {
    expect(run(["teased"]).state).toBe("angry");
    expect(run(["teased", "done"]).state).toBe("idle");
    expect(run(["positive"]).state).toBe("happy");
    expect(run(["positive", "done"]).state).toBe("idle");
  });

  test("events that do not apply are ignored", () => {
    expect(run(["answerDone"]).state).toBe("idle");
    expect(run(["asked", "teased"]).state).toBe("listening");
    expect(run(["questionChosen"]).state).toBe("idle");
    expect(run(["appOpened", "positive"]).state).toBe("greeting");
  });

  test("a drag interrupts any state and resumes a lasting one", () => {
    expect(run(["dragStarted"]).state).toBe("dragged");
    expect(run(["dragStarted", "dragEnded"]).state).toBe("idle");
    expect(run(["inactive", "dragStarted", "dragEnded"]).state).toBe("sleepy");
    expect(run(["asked", "questionChosen", "answerStarted", "dragStarted", "dragEnded"]).state).toBe("talking");
  });

  test("a drag cuts a timed reaction short and drops to idle", () => {
    expect(run(["teased", "dragStarted", "dragEnded"]).state).toBe("idle");
    expect(run(["appOpened", "dragStarted", "dragEnded"]).state).toBe("idle");
  });

  test("while dragged only the end of the drag counts", () => {
    expect(run(["dragStarted", "appOpened", "teased", "dragStarted"]).state).toBe("dragged");
  });
});

describe("tease detection", () => {
  test("enough quick taps are a tease, and counting starts again after it", () => {
    let recent: number[] = [];
    let teased = false;
    for (let i = 0; i < TEASE_TAPS; i++) ({ recent, teased } = registerTap(recent, 1000 + i * 200));
    expect(teased).toBe(true);
    expect(recent).toEqual([]);
  });

  test("slow taps never add up to a tease", () => {
    let recent: number[] = [];
    let teased = false;
    for (let i = 0; i < TEASE_TAPS * 2; i++) {
      ({ recent, teased } = registerTap(recent, i * (TEASE_WINDOW_MS + 1)));
      expect(teased).toBe(false);
    }
  });
});
