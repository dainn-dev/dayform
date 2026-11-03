import { MAX_SSH_COMMAND, SshError, toSshError, type SshCredentials, type SshErrorCode, type SshResult } from "./ssh";
import type { NewEntry } from "./ssh-history";
import type { SshHost } from "./ssh-hosts";

/**
 * Runs one command the user typed on one of their servers. Pure: the secure storage, the native call and the clock are
 * passed in (components/personal/SshTerminal.tsx wires the real ones), so the rules can be tested. The rules: a server whose
 * key the user has not trusted is never contacted, a missing password or key is reported before anything is sent, and
 * only a run that reached the server is written to the history.
 */
export type RunDeps = {
  readCredentials: (hostId: string) => Promise<SshCredentials | null>;
  run: (host: SshHost, options: { command: string; fingerprint: string; credentials: SshCredentials; timeoutMs: number; maxBytes: number }) => Promise<SshResult>;
  now: () => number;
};

export type RunOutcome =
  | { ok: true; result: SshResult; ms: number; entry: NewEntry }
  /** `entry` is null when nothing was sent to the server (so there is nothing to put in the history). */
  | { ok: false; code: SshErrorCode; entry: NewEntry | null };

export const TERMINAL_TIMEOUT_MS = 60_000;
export const TERMINAL_MAX_BYTES = 65_536;

export type RunLimits = { timeoutMs: number; maxBytes: number };

export async function runOnHost(host: SshHost, command: string, deps: RunDeps, limits: RunLimits = { timeoutMs: TERMINAL_TIMEOUT_MS, maxBytes: TERMINAL_MAX_BYTES }): Promise<RunOutcome> {
  const text = command.trim();
  if (text === "" || text.length > MAX_SSH_COMMAND) return { ok: false, code: "BAD_REQUEST", entry: null };
  if (host.fingerprint === null) return { ok: false, code: "HOST_KEY_UNKNOWN", entry: null };
  const credentials = await deps.readCredentials(host.id);
  if (credentials === null) return { ok: false, code: "NO_CREDENTIALS", entry: null };
  const startedAt = deps.now();
  try {
    const result = await deps.run(host, { command: text, fingerprint: host.fingerprint, credentials, timeoutMs: limits.timeoutMs, maxBytes: limits.maxBytes });
    const entry: NewEntry = result.timedOut
      ? { hostId: host.id, command: text, at: startedAt, status: "timeout", exitCode: null }
      : { hostId: host.id, command: text, at: startedAt, status: "done", exitCode: result.exitCode };
    return { ok: true, result, ms: Math.max(0, deps.now() - startedAt), entry };
  } catch (error) {
    const failure = error instanceof SshError ? error : toSshError(error);
    return { ok: false, code: failure.code, entry: { hostId: host.id, command: text, at: startedAt, status: "error", exitCode: null } };
  }
}

/** "1.2 s", "340 ms" or "2 min 5 s" for the footer of a run. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)} min ${whole % 60} s`;
}
