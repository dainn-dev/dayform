import { z } from "zod";
import { MAX_SSH_COMMAND } from "./ssh";

/**
 * The commands the user ran over SSH, newest first (lib/ssh-history-context.tsx keeps them under `dayform.ssh.history.v1`).
 * Pure: no React and no storage. An entry holds the command, the server, when and how it ended, never the output: what a
 * server prints can be a secret, so it is shown once and dropped. (A command can still contain one, which the screen says.)
 */
export const MAX_SSH_HISTORY = 100;
const ID_PATTERN = /^c_[a-z0-9]{8}$/;
const HOST_ID_PATTERN = /^h_[a-z0-9]{8}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 8;

/** `done` = the command ran and ended (see `exitCode`); `timeout` = it was still running when the time was up; `error` = it could not be run. */
export type SshRunStatus = "done" | "timeout" | "error";
export type SshHistoryEntry = {
  id: string;
  hostId: string;
  command: string;
  /** Epoch milliseconds of the start. */
  at: number;
  status: SshRunStatus;
  /** The command's exit code; null unless `status` is "done". */
  exitCode: number | null;
  /** Who asked for it: the user typed it, or the assistant proposed it and the user agreed. Absent = the user (older entries). */
  by?: "user" | "assistant";
};
export type SshHistoryState = { items: SshHistoryEntry[] };
export const DEFAULT_SSH_HISTORY_STATE: SshHistoryState = { items: [] };

export type SshHistoryFailure = "invalid" | "unknown";
export type SshHistoryResult = { ok: true; state: SshHistoryState; id?: string } | { ok: false; reason: SshHistoryFailure };

export function generateHistoryId(random: () => number = Math.random): string {
  let id = "c_";
  for (let i = 0; i < ID_LENGTH; i += 1) id += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.floor(random() * ID_ALPHABET.length))];
  return id;
}

const entrySchema = z.object({
  id: z.string().regex(ID_PATTERN),
  hostId: z.string().regex(HOST_ID_PATTERN),
  command: z.string().min(1).max(MAX_SSH_COMMAND),
  at: z.number().int().nonnegative(),
  status: z.enum(["done", "timeout", "error"]),
  exitCode: z.number().int().nullable(),
  by: z.enum(["user", "assistant"]).optional(),
}).refine(entry => (entry.status === "done") === (entry.exitCode !== null));

export type ParsedHistory = { state: SshHistoryState; valid: boolean; lossy: boolean };

/** Reads stored text. `lossy` is true when an entry was dropped, so the caller keeps a copy before writing. */
export function parseSshHistoryText(text: string): ParsedHistory {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: DEFAULT_SSH_HISTORY_STATE, valid: false, lossy: true };
  }
  const list = typeof raw === "object" && raw !== null && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (list === null) return { state: DEFAULT_SSH_HISTORY_STATE, valid: false, lossy: true };
  const seen = new Set<string>();
  const items: SshHistoryEntry[] = [];
  for (const record of list.slice(0, MAX_SSH_HISTORY)) {
    const parsed = entrySchema.safeParse(record);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    items.push(parsed.data);
  }
  return { state: { items }, valid: true, lossy: items.length !== list.length };
}

export type NewEntry = Omit<SshHistoryEntry, "id">;

/**
 * Puts a run at the top. Running the same command on the same server again moves it up instead of adding a second line,
 * and only the latest MAX_SSH_HISTORY are kept.
 */
export function addHistoryEntry(state: SshHistoryState, entry: NewEntry, id: string = generateHistoryId()): SshHistoryResult {
  const command = entry.command.trim();
  const parsed = entrySchema.safeParse({ id, ...entry, command });
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const rest = state.items.filter(item => !(item.hostId === entry.hostId && item.command === command));
  return { ok: true, state: { items: [parsed.data, ...rest].slice(0, MAX_SSH_HISTORY) }, id };
}

export function removeHistoryEntry(state: SshHistoryState, id: string): SshHistoryResult {
  if (!state.items.some(item => item.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.filter(item => item.id !== id) } };
}

/** Clears one server's commands, or all of them when `hostId` is omitted. */
export function clearHistory(state: SshHistoryState, hostId?: string): SshHistoryResult {
  const items = hostId === undefined ? [] : state.items.filter(item => item.hostId !== hostId);
  return { ok: true, state: items.length === state.items.length ? state : { items } };
}

/** A server's commands, newest first. */
export function historyOf(state: SshHistoryState, hostId: string): SshHistoryEntry[] {
  return state.items.filter(item => item.hostId === hostId);
}
