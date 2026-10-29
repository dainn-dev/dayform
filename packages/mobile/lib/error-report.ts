/** How many stack frames the error screen shows; enough to locate the failure without pages of noise. */
export const DEFAULT_STACK_LINES = 12;

/** A thrown message can contain user text; show a bounded amount of it. */
export const MAX_MESSAGE_CHARS = 300;

const UNKNOWN_ERROR = "Unknown error";
const ELLIPSIS = "…";

function cappedMessage(message: string): string {
  if (message.length <= MAX_MESSAGE_CHARS) return message;
  // Spread to code points so a surrogate pair is never cut in half.
  return `${[...message].slice(0, MAX_MESSAGE_CHARS).join("")}${ELLIPSIS}`;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    return typeof message === "string" ? message.trim() : "";
  }
  return "";
}

/** Stack frames without the leading "Name: message" header the engine prepends. */
function stackFrames(error: unknown): string[] {
  if (!(error instanceof Error) || !error.stack) return [];
  const { stack, name, message } = error;
  // Engines print "Name: message" (or just "Name" for an empty message) before the frames.
  const header = [`${name}: ${message}`, `${name}: ${message.trim()}`, name].find(candidate => stack.startsWith(candidate));
  const body = header === undefined ? stack : stack.slice(header.length);
  return body.split("\n").map(line => line.trimEnd()).filter(line => line.trim() !== "");
}

/**
 * Plain text for the "details" block of the error screen: the message, then at most
 * `maxStackLines` stack lines, trimmed. Never throws, whatever was thrown.
 */
export function formatErrorDetails(error: unknown, maxStackLines: number = DEFAULT_STACK_LINES): string {
  const message = cappedMessage(messageOf(error) || UNKNOWN_ERROR);
  const limit = Math.max(0, Math.floor(maxStackLines));
  const frames = stackFrames(error).slice(0, limit);
  return [message, ...frames].join("\n");
}
