import { normalizeText } from "./search";
import type { QuestionId } from "./assistant-answers";

/**
 * Understanding what the user said to the assistant (framework-free, tested): the wake phrase that calls it by name,
 * a yes or no for a confirmation card, a preset question when the AI chat is off, and the words that end a spoken
 * conversation. Everything compares accent-insensitively, since a recognizer may drop or misplace Vietnamese marks.
 */

/** Words that, said right before the name, call the assistant ("hey Leo", "ê Leo", "này Leo"). */
const BEFORE_NAME = ["hey", "hi", "hello", "e", "ey", "nay", "alo", "oi"];
/** Words that, said right after the name, call it ("Leo ơi", "Leo à"). */
const AFTER_NAME = ["oi", "a", "nhe"];

export type WakeMatch = { heard: false } | { heard: true; rest: string };

function words(text: string): { original: string[]; normal: string[] } {
  const original = text.trim().split(/\s+/).filter(Boolean);
  return { original, normal: original.map(word => normalizeText(word.replace(/[^\p{L}\p{N}]/gu, ""))) };
}

/**
 * Whether `transcript` calls the assistant named `name`, and what was said after the call (the question, if the user
 * did not pause). The name may be several words ("Bé Na"); the call must come before the question.
 */
export function detectWake(transcript: string, name: string): WakeMatch {
  const target = normalizeText(name).split(" ").filter(Boolean);
  if (target.length === 0) return { heard: false };
  const { original, normal } = words(transcript);
  for (let i = 0; i + target.length <= normal.length; i++) {
    if (!target.every((part, k) => normal[i + k] === part)) continue;
    const before = i > 0 ? normal[i - 1] : null;
    const afterIndex = i + target.length;
    const after = afterIndex < normal.length ? normal[afterIndex] : null;
    const calledBefore = before !== null && BEFORE_NAME.includes(before);
    const calledAfter = after !== null && AFTER_NAME.includes(after);
    // The bare name counts only when it is the whole utterance ("Leo?"), so a sentence that mentions it does not wake it.
    const alone = normal.length === target.length;
    if (!calledBefore && !calledAfter && !alone) continue;
    const restStart = calledAfter ? afterIndex + 1 : afterIndex;
    return { heard: true, rest: original.slice(restStart).join(" ").replace(/^[,.!?…\s]+/, "").trim() };
  }
  return { heard: false };
}

// Not "dạ": without its marks it is "đã" ("already"), which appears in sentences that are not a yes.
const YES = ["co", "dong y", "ok", "oke", "okay", "duoc", "u", "uh", "vang", "yes", "yeah", "sure", "lam di", "chac chan", "agree"];
const NO = ["khong", "thoi", "huy", "dung", "no", "nope", "cancel", "khoi", "bo qua"];

/** A spoken answer to a confirmation card: "yes", "no", or null when it is neither (the card then waits for a tap). */
export function parseYesNo(transcript: string): "yes" | "no" | null {
  const text = ` ${normalizeText(transcript.replace(/[^\p{L}\p{N}\s]/gu, " "))} `;
  const has = (list: string[]) => list.some(phrase => text.includes(` ${phrase} `));
  // "không đồng ý" is a no: the no-words win when both appear.
  if (has(NO)) return "no";
  if (has(YES)) return "yes";
  return null;
}

/** With the AI chat off: which preset question a spoken sentence asks, or null. */
export function matchPreset(transcript: string): QuestionId | null {
  const text = ` ${normalizeText(transcript.replace(/[^\p{L}\p{N}\s]/gu, " "))} `;
  if (/ (tiep theo|ke tiep|sap toi|next) /.test(text)) return "next";
  if (/ (bao nhieu|tien do|xong chua|how am i|progress) /.test(text)) return "progress";
  if (/ (hom nay|today|lich|ke hoach) /.test(text)) return "today";
  return null;
}

const GOODBYE = ["cam on", "thoi", "tam biet", "bye", "goodbye", "thank you", "thanks", "het roi", "vay thoi"];

/** Whether the user ended the spoken conversation ("cảm ơn", "thôi", "bye"). */
export function saysGoodbye(transcript: string): boolean {
  const text = ` ${normalizeText(transcript.replace(/[^\p{L}\p{N}\s]/gu, " "))} `;
  return GOODBYE.some(phrase => text.includes(` ${phrase} `)) && text.trim().split(" ").length <= 4;
}
