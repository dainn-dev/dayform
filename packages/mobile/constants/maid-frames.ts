import type { MaidFrame } from "../lib/assistant-maid";

/** The maid's frames (see lib/assistant-maid.ts); a PNG/WebP cannot be required by bun test, so the test reads this as text. */
export const MAID_FRAME_SOURCES: Record<MaidFrame, number> = {
  "idle": require("../assets/assistant/maid/idle.webp"),
  "idle-in": require("../assets/assistant/maid/idle-in.webp"),
  "idle-out": require("../assets/assistant/maid/idle-out.webp"),
  "blink-half": require("../assets/assistant/maid/blink-half.webp"),
  "blink-closed": require("../assets/assistant/maid/blink-closed.webp"),
  "talk-small": require("../assets/assistant/maid/talk-small.webp"),
  "talk-open": require("../assets/assistant/maid/talk-open.webp"),
  "happy-0": require("../assets/assistant/maid/happy-0.webp"),
  "happy-1": require("../assets/assistant/maid/happy-1.webp"),
  "happy-2": require("../assets/assistant/maid/happy-2.webp"),
  "happy-3": require("../assets/assistant/maid/happy-3.webp"),
  "sleepy-0": require("../assets/assistant/maid/sleepy-0.webp"),
  "sleepy-1": require("../assets/assistant/maid/sleepy-1.webp"),
  "sleepy-2": require("../assets/assistant/maid/sleepy-2.webp"),
  "sleepy-3": require("../assets/assistant/maid/sleepy-3.webp"),
  "angry-0": require("../assets/assistant/maid/angry-0.webp"),
  "angry-1": require("../assets/assistant/maid/angry-1.webp"),
  "angry-2": require("../assets/assistant/maid/angry-2.webp"),
  "angry-3": require("../assets/assistant/maid/angry-3.webp"),
  "dragged-0": require("../assets/assistant/maid/dragged-0.webp"),
  "dragged-1": require("../assets/assistant/maid/dragged-1.webp"),
  "dragged-2": require("../assets/assistant/maid/dragged-2.webp"),
  "dragged-3": require("../assets/assistant/maid/dragged-3.webp"),
};
