import { z } from "zod";
import { dateKey } from "./planner";

/**
 * Focus timer (Pomodoro) pure core. A session is a run of absolute times, so it survives the app being killed or
 * the phone sleeping: the remaining time is always recomputed from the clock. A focus round that ends is logged and
 * followed by a break; a break that ends (or is skipped) ends the session. Pausing freezes the remaining time.
 * Framework-free: the clock is a parameter and nothing here reads storage.
 */
export const FOCUS_CHOICES = [15, 25, 45, 50] as const;
export const BREAK_CHOICES = [5, 10, 15] as const;
export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;
/** Every fourth round is followed by a long break. */
export const ROUNDS_PER_LONG_BREAK = 4;
export const LONG_BREAK_MINUTES = 15;
export const MAX_LOG_ENTRIES = 600;
const MAX_ID_LENGTH = 100;
const MS_PER_MINUTE = 60_000;
const MAX_MINUTES = 240;

export type FocusPhase = "focus" | "break";

export type FocusSession = {
  /** The task being worked on, or null for a free focus round. Its title is looked up live, never copied. */
  taskId: string | null;
  phase: FocusPhase;
  /** Epoch ms the phase began (moved forward by the time spent paused). */
  startedAt: number;
  /** Planned length of the phase. */
  durationMs: number;
  /** Epoch ms the pause began; null while running. */
  pausedAt: number | null;
  /** Focus rounds finished in this session so far. */
  round: number;
};

/** A focus stretch that really happened: it counts toward the stats, finished or stopped early. */
export type FocusLogEntry = {
  /** Local `YYYY-MM-DD` the stretch ended on. */
  date: string;
  taskId: string | null;
  minutes: number;
  /** Epoch ms it ended. */
  at: number;
};

export type FocusPrefs = { focusMinutes: number; breakMinutes: number };
export type FocusState = { session: FocusSession | null; log: FocusLogEntry[]; prefs: FocusPrefs };

export const DEFAULT_FOCUS_PREFS: FocusPrefs = { focusMinutes: DEFAULT_FOCUS_MINUTES, breakMinutes: DEFAULT_BREAK_MINUTES };
export const DEFAULT_FOCUS_STATE: FocusState = { session: null, log: [], prefs: DEFAULT_FOCUS_PREFS };

const clampMinutes = (minutes: number): number => Math.min(MAX_MINUTES, Math.max(1, Math.round(minutes)));

export function startFocus(state: FocusState, now: number, taskId: string | null, minutes: number = state.prefs.focusMinutes): FocusState {
  const session: FocusSession = { taskId, phase: "focus", startedAt: now, durationMs: clampMinutes(minutes) * MS_PER_MINUTE, pausedAt: null, round: 0 };
  return { ...state, session, prefs: { ...state.prefs, focusMinutes: clampMinutes(minutes) } };
}

/** The moment the phase ends (while paused, the moment it would end if resumed now is `now + remaining`). */
export function endsAt(session: FocusSession): number {
  return session.startedAt + session.durationMs;
}

export function remainingMs(session: FocusSession, now: number): number {
  const clock = session.pausedAt ?? now;
  return Math.max(0, session.durationMs - Math.max(0, clock - session.startedAt));
}

export function isDue(session: FocusSession, now: number): boolean {
  return session.pausedAt === null && now >= endsAt(session);
}

export function pauseFocus(state: FocusState, now: number): FocusState {
  const { session } = state;
  if (session === null || session.pausedAt !== null || isDue(session, now)) return state;
  return { ...state, session: { ...session, pausedAt: now } };
}

export function resumeFocus(state: FocusState, now: number): FocusState {
  const { session } = state;
  if (session === null || session.pausedAt === null) return state;
  return { ...state, session: { ...session, startedAt: session.startedAt + (now - session.pausedAt), pausedAt: null } };
}

function entryFor(session: FocusSession, minutes: number, endedAt: number): FocusLogEntry {
  return { date: dateKey(new Date(endedAt)), taskId: session.taskId, minutes, at: endedAt };
}

function withEntry(state: FocusState, entry: FocusLogEntry | null): FocusLogEntry[] {
  return entry === null ? state.log : [...state.log, entry].slice(-MAX_LOG_ENTRIES);
}

/** Whole minutes of focus actually spent in a running or paused focus phase. */
export function elapsedFocusMinutes(session: FocusSession, now: number): number {
  if (session.phase !== "focus") return 0;
  const spent = session.durationMs - remainingMs(session, now);
  return Math.floor(spent / MS_PER_MINUTE);
}

/** Ends the session now. A focus round stopped early is logged for the whole minutes spent (none under one minute). */
export function stopFocus(state: FocusState, now: number): FocusState {
  const { session } = state;
  if (session === null) return state;
  const minutes = elapsedFocusMinutes(session, now);
  return { ...state, session: null, log: withEntry(state, minutes >= 1 ? entryFor(session, minutes, now) : null) };
}

function breakLength(round: number, prefs: FocusPrefs): number {
  return round % ROUNDS_PER_LONG_BREAK === 0 ? LONG_BREAK_MINUTES : prefs.breakMinutes;
}

/**
 * Applies every phase that is over by `now`: a finished focus round is logged (its planned length) and a break starts
 * where the round ended, a finished break ends the session. Idempotent; a paused session is left alone.
 */
export function settleFocus(state: FocusState, now: number): FocusState {
  let current = state;
  for (let guard = 0; guard < 2; guard += 1) {
    const { session } = current;
    if (session === null || !isDue(session, now)) return current;
    const end = endsAt(session);
    if (session.phase === "break") return { ...current, session: null };
    const round = session.round + 1;
    const minutes = Math.round(session.durationMs / MS_PER_MINUTE);
    current = {
      ...current,
      log: withEntry(current, entryFor(session, minutes, end)),
      session: { taskId: session.taskId, phase: "break", startedAt: end, durationMs: breakLength(round, current.prefs) * MS_PER_MINUTE, pausedAt: null, round },
    };
  }
  return current;
}

/** Ends a break early; the finished rounds stay logged. */
export function skipBreak(state: FocusState): FocusState {
  return state.session?.phase === "break" ? { ...state, session: null } : state;
}

/** Adds one more round after a break ended (or while on a break): a fresh focus round on the same task. */
export function nextRound(state: FocusState, now: number): FocusState {
  const { session } = state;
  if (session === null || session.phase !== "break") return state;
  return {
    ...state,
    session: { taskId: session.taskId, phase: "focus", startedAt: now, durationMs: state.prefs.focusMinutes * MS_PER_MINUTE, pausedAt: null, round: session.round },
  };
}

export function setFocusPrefs(state: FocusState, prefs: Partial<FocusPrefs>): FocusState {
  return {
    ...state,
    prefs: {
      focusMinutes: prefs.focusMinutes === undefined ? state.prefs.focusMinutes : clampMinutes(prefs.focusMinutes),
      breakMinutes: prefs.breakMinutes === undefined ? state.prefs.breakMinutes : clampMinutes(prefs.breakMinutes),
    },
  };
}

/** `mm:ss`, rounding a partial second up so the display reaches 00:00 only when the time is really over. */
export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Minutes of focus logged on the days of `[from, to]` (inclusive local dates), per day and in total. */
export function focusMinutesIn(log: readonly FocusLogEntry[], from: string, to: string): { total: number; perDay: Record<string, number> } {
  const perDay: Record<string, number> = {};
  let total = 0;
  for (const entry of log) {
    if (entry.date < from || entry.date > to) continue;
    perDay[entry.date] = (perDay[entry.date] ?? 0) + entry.minutes;
    total += entry.minutes;
  }
  return { total, perDay };
}

/** Minutes of focus logged for one task. */
export function focusMinutesFor(log: readonly FocusLogEntry[], taskId: string): number {
  return log.reduce((sum, entry) => sum + (entry.taskId === taskId ? entry.minutes : 0), 0);
}

// --- Storage ---------------------------------------------------------------------------------------------------
const sessionSchema = z.object({
  taskId: z.string().min(1).max(MAX_ID_LENGTH).nullable(),
  phase: z.enum(["focus", "break"]),
  startedAt: z.number().finite(),
  durationMs: z.number().finite().min(MS_PER_MINUTE).max(MAX_MINUTES * MS_PER_MINUTE),
  pausedAt: z.number().finite().nullable(),
  round: z.number().int().min(0).max(1000),
});
const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1).max(MAX_ID_LENGTH).nullable(),
  minutes: z.number().int().min(1).max(MAX_MINUTES),
  at: z.number().finite(),
});
const prefsSchema = z.object({
  focusMinutes: z.number().int().min(1).max(MAX_MINUTES).catch(DEFAULT_FOCUS_MINUTES),
  breakMinutes: z.number().int().min(1).max(MAX_MINUTES).catch(DEFAULT_BREAK_MINUTES),
});

export type ParsedFocus = { state: FocusState; valid: boolean; lossy: boolean };

/** Reads stored text. `lossy` is true when something was dropped, so the caller keeps a copy before writing. */
export function parseFocusText(text: string): ParsedFocus {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: DEFAULT_FOCUS_STATE, valid: false, lossy: true };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { state: DEFAULT_FOCUS_STATE, valid: false, lossy: true };
  const record = raw as { session?: unknown; log?: unknown; prefs?: unknown };
  let lossy = false;
  const parsedSession = record.session == null ? null : sessionSchema.safeParse(record.session);
  if (parsedSession !== null && !parsedSession.success) lossy = true;
  const logList = Array.isArray(record.log) ? record.log : [];
  const log = logList.flatMap(item => {
    const parsed = entrySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }).slice(-MAX_LOG_ENTRIES);
  if (log.length !== logList.length) lossy = true;
  const prefs = prefsSchema.safeParse(record.prefs ?? {});
  return {
    state: { session: parsedSession?.success ? parsedSession.data : null, log, prefs: prefs.success ? prefs.data : DEFAULT_FOCUS_PREFS },
    valid: true,
    lossy,
  };
}
