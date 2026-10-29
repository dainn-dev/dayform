import { matchesFilter, type ExploreFilter } from "./explore-groups";
import type { Category, Task } from "./planner";

export type SearchOptions = { query: string; categories: readonly Category[]; status: ExploreFilter };
/** Half-open `[start, end)` UTF-16 range in the original text. */
export type TextRange = { start: number; end: number };

const COMBINING_MARKS = /\p{M}/gu;
const WHITESPACE = /\s/u;
const CHAR_CACHE_LIMIT = 4096;
const charCache = new Map<string, string>();

/** One code point to its search form: lowercase, accents removed, "đ" folded to "d". Never whitespace. */
function foldChar(ch: string): string {
  const cached = charCache.get(ch);
  if (cached !== undefined) return cached;
  // NFD does not decompose "đ" (it is a distinct letter, not d + a mark), so it is folded explicitly.
  const folded = ch.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/đ/g, "d");
  if (charCache.size < CHAR_CACHE_LIMIT) charCache.set(ch, folded);
  return folded;
}

type Normalized = { text: string; starts: number[]; ends: number[] };

/**
 * Normalises `text` one code point at a time so every normalised unit knows the original span it came from
 * (`starts[k]`/`ends[k]` for unit k). Combining marks vanish but extend the span of the letter before them.
 */
function normalizeWithMap(text: string): Normalized {
  const units: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const ch of text) {
    const end = index + ch.length;
    const folded = WHITESPACE.test(ch) ? " " : foldChar(ch);
    if (folded === "") {
      if (units.length > 0) ends[ends.length - 1] = end;
    } else if (folded !== " " || (units.length > 0 && units[units.length - 1] !== " ")) {
      for (let i = 0; i < folded.length; i += 1) { units.push(folded[i]); starts.push(index); ends.push(end); }
    }
    index = end;
  }
  if (units[units.length - 1] === " ") { units.pop(); starts.pop(); ends.pop(); }
  return { text: units.join(""), starts, ends };
}

/** Lowercase, accent-insensitive ("công" and "cong" compare equal, "Đ" = "d"), whitespace collapsed and trimmed. */
export function normalizeText(text: string): string {
  return normalizeWithMap(text).text;
}

function queryTerms(query: string): string[] {
  const normalized = normalizeText(query);
  return normalized === "" ? [] : normalized.split(" ");
}

/** Tasks are immutable (an edit creates a new object), so the normalised text can be cached per object. */
const haystacks = new WeakMap<Task, string>();

function haystackOf(task: Task): string {
  const cached = haystacks.get(task);
  if (cached !== undefined) return cached;
  // The separator keeps a term (which never contains a space) from matching across the title/notes boundary.
  const haystack = `${normalizeText(task.title)} ${normalizeText(task.notes)}`;
  haystacks.set(task, haystack);
  return haystack;
}

function matchesTerms(task: Task, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = haystackOf(task);
  return terms.every(term => haystack.includes(term));
}

/** True when every whitespace-separated term of `query` appears in the title or notes. An empty query matches all. */
export function matchesQuery(task: Task, query: string): boolean {
  return matchesTerms(task, queryTerms(query));
}

/** Status filter (same semantics as the Tasks tab), optional category multi-select (empty = all) and text query. O(n). */
export function filterTasks(tasks: readonly Task[], { query, categories, status }: SearchOptions): Task[] {
  const terms = queryTerms(query);
  const wanted = new Set<Category>(categories);
  return tasks.filter(task =>
    matchesFilter(task, status)
    && (wanted.size === 0 || wanted.has(task.category))
    && matchesTerms(task, terms));
}

function occurrences(haystack: string, term: string): [number, number][] {
  const found: [number, number][] = [];
  for (let at = haystack.indexOf(term); at !== -1; at = haystack.indexOf(term, at + term.length)) {
    found.push([at, at + term.length]);
  }
  return found;
}

function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  const merged: TextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    else merged.push(range);
  }
  return merged;
}

/** Ranges of the ORIGINAL `text` covered by any term of `query`, sorted and merged. */
export function highlightRanges(text: string, query: string): TextRange[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const { text: normalized, starts, ends } = normalizeWithMap(text);
  const ranges = terms.flatMap(term => occurrences(normalized, term))
    .map(([from, to]): TextRange => ({ start: starts[from], end: ends[to - 1] }));
  return mergeRanges(ranges);
}

export type HighlightSegment = { text: string; highlighted: boolean };

/** Splits `text` into consecutive segments, flagging the ones matched by `query` (see `highlightRanges`). */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const { start, end } of highlightRanges(text, query)) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlighted: false });
    segments.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length || segments.length === 0) segments.push({ text: text.slice(cursor), highlighted: false });
  return segments;
}
