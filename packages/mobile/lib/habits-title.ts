import { normalizeText } from "./search";
import type { Task } from "./planner";

/** Typed titles shorter than this (after normalising) never match anything. */
export const MIN_TYPED_LENGTH = 3;

const EDGE_JUNK = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Lowercase, accent-insensitive ("Đi chợ" = "di cho"), whitespace collapsed, and punctuation/emoji
 * trimmed from both ends. Characters inside the title are kept.
 */
export function normalizeTitle(title: string): string {
  return normalizeText(title).replace(EDGE_JUNK, "");
}

// Tasks are immutable (an edit creates a new object), so the normalised title can be cached per object.
const titleKeys = new WeakMap<Task, string>();

/** `normalizeTitle(task.title)`, cached per task object. */
export function taskTitleKey(task: Task): string {
  const cached = titleKeys.get(task);
  if (cached !== undefined) return cached;
  const key = normalizeTitle(task.title);
  titleKeys.set(task, key);
  return key;
}

function matchesTyped(key: string, typed: string, typedWords: readonly string[]): boolean {
  if (key === "") return false;
  if (key.startsWith(typed)) return true; // also covers an exact match
  if (typedWords.length < 2) return false;
  const words = key.split(" ");
  return typedWords.every(typedWord => words.some(word => word.startsWith(typedWord)));
}

/**
 * Tasks whose title matches what the user is typing: the same normalised title, a title that starts with
 * it, or (for two or more typed words) every typed word starting some word of the title, in any order.
 * Needs at least `MIN_TYPED_LENGTH` characters. Keeps the order of `history`.
 */
export function similarTitles(typed: string, history: readonly Task[]): Task[] {
  const normalized = normalizeTitle(typed);
  if (normalized.length < MIN_TYPED_LENGTH) return [];
  const typedWords = normalized.split(" ");
  return history.filter(task => matchesTyped(taskTitleKey(task), normalized, typedWords));
}
