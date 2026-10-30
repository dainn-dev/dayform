/**
 * The assistant's state machine (framework-free, tested). The states and their transitions follow the owner's diagram:
 *
 *   idle --appOpened--> greeting --done--> idle
 *   idle --asked--> listening --questionChosen--> thinking --answerStarted--> talking --answerDone--> idle
 *   idle --inactive--> sleepy --poked--> listening
 *   idle --teased--> angry --done--> idle
 *   idle --positive--> happy --done--> idle
 *
 * In this first version nothing listens to a microphone: "listening" is the question menu being open, and a chosen
 * question is what "speech recognised" means. Being dragged is a state of its own that ends where it started from (or in
 * idle when that was a timed reaction). Events that do not apply to the current state are ignored.
 */

export const ASSISTANT_STATES = ["idle", "greeting", "listening", "thinking", "talking", "angry", "happy", "sleepy", "dragged"] as const;
export type AssistantState = (typeof ASSISTANT_STATES)[number];

export type AssistantEvent =
  | { type: "appOpened" }
  | { type: "asked" }
  | { type: "questionChosen" }
  | { type: "cancelled" }
  | { type: "answerStarted" }
  | { type: "answerDone" }
  | { type: "teased" }
  | { type: "positive" }
  | { type: "inactive" }
  | { type: "poked" }
  | { type: "done" }
  | { type: "dragStarted" }
  | { type: "dragEnded" };

/** How long a one-shot state lasts before the caller sends `done`, in ms. */
export const ONE_SHOT_MS: Partial<Record<AssistantState, number>> = {
  greeting: 2600,
  angry: 2400,
  happy: 1800,
};

/** No touch for this long sends `inactive` (idle only). */
export const INACTIVE_AFTER_MS = 120_000;

/** Thinking lasts at least this long before the answer starts, so it is seen. */
export const THINKING_MS = 1400;

export type Machine = { state: AssistantState; beforeDrag: AssistantState | null };

export const INITIAL_MACHINE: Machine = { state: "idle", beforeDrag: null };

/** A timed reaction is not resumed after a drag: the drag interrupted it, so the assistant goes back to idle. */
const RESUMABLE: ReadonlySet<AssistantState> = new Set(["idle", "listening", "thinking", "talking", "sleepy"]);

export function nextState(machine: Machine, event: AssistantEvent): Machine {
  const { state } = machine;
  const go = (to: AssistantState): Machine => ({ state: to, beforeDrag: null });

  if (event.type === "dragStarted") {
    return state === "dragged" ? machine : { state: "dragged", beforeDrag: state };
  }
  if (state === "dragged") {
    if (event.type !== "dragEnded") return machine;
    const back = machine.beforeDrag;
    return go(back !== null && RESUMABLE.has(back) ? back : "idle");
  }

  switch (state) {
    case "idle":
      switch (event.type) {
        case "appOpened": return go("greeting");
        case "asked": return go("listening");
        case "inactive": return go("sleepy");
        case "teased": return go("angry");
        case "positive": return go("happy");
        default: return machine;
      }
    case "greeting":
    case "angry":
    case "happy":
      return event.type === "done" ? go("idle") : machine;
    case "sleepy":
      if (event.type === "poked" || event.type === "asked") return go("listening");
      if (event.type === "positive") return go("happy");
      return machine;
    case "listening":
      if (event.type === "questionChosen") return go("thinking");
      if (event.type === "cancelled") return go("idle");
      return machine;
    case "thinking":
      return event.type === "answerStarted" ? go("talking") : machine;
    case "talking":
      return event.type === "answerDone" ? go("idle") : machine;
    default:
      return machine;
  }
}

/** Taps this close together, this many times, count as teasing. */
export const TEASE_TAPS = 4;
export const TEASE_WINDOW_MS = 1500;

/** Keeps the times of recent taps; returns true when the latest tap makes it a tease (and starts counting again). */
export function registerTap(recent: number[], now: number): { recent: number[]; teased: boolean } {
  const kept = recent.filter(at => now - at <= TEASE_WINDOW_MS).concat(now);
  if (kept.length >= TEASE_TAPS) return { recent: [], teased: true };
  return { recent: kept, teased: false };
}
