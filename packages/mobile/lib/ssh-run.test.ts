import { describe, expect, test } from "bun:test";
import { MAX_SSH_COMMAND, SshError, type SshResult } from "./ssh";
import {
  DEFAULT_SSH_HISTORY_STATE, MAX_SSH_HISTORY, addHistoryEntry, clearHistory, historyOf, parseSshHistoryText, removeHistoryEntry, type NewEntry, type SshHistoryState,
} from "./ssh-history";
import type { SshHost } from "./ssh-hosts";
import { formatDuration, runOnHost, type RunDeps } from "./ssh-run";

const FP = `SHA256:${"A".repeat(43)}`;
const host = (patch: Partial<SshHost> = {}): SshHost => ({ id: "h_aaaaaaaa", name: "prod", host: "10.0.0.5", port: 22, user: "deploy", auth: "key", fingerprint: FP, ...patch });
const ok = (patch: Partial<SshResult> = {}): SshResult => ({ exitCode: 0, stdout: "hi\n", stderr: "", truncated: false, timedOut: false, ...patch });

function deps(patch: Partial<RunDeps> = {}): RunDeps & { calls: unknown[] } {
  const calls: unknown[] = [];
  let clock = 1_000;
  return {
    calls,
    readCredentials: async () => ({ privateKey: "k" }),
    run: async (_host, options) => { calls.push(options); clock += 250; return ok(); },
    now: () => clock,
    ...patch,
  };
}

describe("running a command", () => {
  test("a run that ends is reported with its output, its time and a history entry", async () => {
    const d = deps();
    const outcome = await runOnHost(host(), "  echo hi  ", d);
    expect(outcome).toMatchObject({ ok: true, ms: 250, result: { stdout: "hi\n", exitCode: 0 }, entry: { hostId: "h_aaaaaaaa", command: "echo hi", at: 1000, status: "done", exitCode: 0 } });
    expect(d.calls).toEqual([{ command: "echo hi", fingerprint: FP, credentials: { privateKey: "k" }, timeoutMs: 60_000, maxBytes: 65_536 }]);
  });

  test("a non-zero exit code is still a finished run", async () => {
    const outcome = await runOnHost(host(), "false", deps({ run: async () => ok({ exitCode: 1, stderr: "no" }) }));
    expect(outcome.ok && outcome.entry).toMatchObject({ status: "done", exitCode: 1 });
  });

  test("a command that was still running at the deadline is a timeout without an exit code", async () => {
    const outcome = await runOnHost(host(), "sleep 999", deps({ run: async () => ok({ timedOut: true, exitCode: -1 }) }));
    expect(outcome.ok && outcome.entry).toMatchObject({ status: "timeout", exitCode: null });
  });

  test("a server whose key is not trusted is never contacted", async () => {
    const d = deps();
    expect(await runOnHost(host({ fingerprint: null }), "ls", d)).toEqual({ ok: false, code: "HOST_KEY_UNKNOWN", entry: null });
    expect(d.calls).toEqual([]);
  });

  test("a missing password or key is reported before anything is sent, with no history entry", async () => {
    const d = deps({ readCredentials: async () => null });
    expect(await runOnHost(host(), "ls", d)).toEqual({ ok: false, code: "NO_CREDENTIALS", entry: null });
    expect(d.calls).toEqual([]);
  });

  test("an empty or too long command is refused without a history entry", async () => {
    const d = deps();
    expect(await runOnHost(host(), "   ", d)).toEqual({ ok: false, code: "BAD_REQUEST", entry: null });
    expect(await runOnHost(host(), "x".repeat(MAX_SSH_COMMAND + 1), d)).toEqual({ ok: false, code: "BAD_REQUEST", entry: null });
    expect(d.calls).toEqual([]);
  });

  test("a failure keeps its code, a changed key included, and is recorded as an error", async () => {
    const mismatch = await runOnHost(host(), "ls", deps({ run: async () => { throw new SshError("HOST_KEY_MISMATCH"); } }));
    expect(mismatch).toMatchObject({ ok: false, code: "HOST_KEY_MISMATCH", entry: { status: "error", exitCode: null } });
    const unknown = await runOnHost(host(), "ls", deps({ run: async () => { throw new Error("boom"); } }));
    expect(unknown).toMatchObject({ ok: false, code: "CONNECT_FAILED" });
  });

  test("durations are written short", () => {
    expect(formatDuration(340)).toBe("340 ms");
    expect(formatDuration(1200)).toBe("1.2 s");
    expect(formatDuration(12_400)).toBe("12 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
  });
});

const entry = (patch: Partial<NewEntry> = {}): NewEntry => ({ hostId: "h_aaaaaaaa", command: "df -h", at: 1, status: "done", exitCode: 0, ...patch });
const withEntries = (...entries: NewEntry[]): SshHistoryState => entries.reduce((state, item, index) => {
  const added = addHistoryEntry(state, item, `c_${String(index).padStart(8, "0")}`);
  if (!added.ok) throw new Error("setup");
  return added.state;
}, DEFAULT_SSH_HISTORY_STATE);

describe("history", () => {
  test("the newest run is first, and the same command on the same server moves up instead of repeating", () => {
    const state = withEntries(entry({ command: "a" }), entry({ command: "b" }), entry({ command: "a", at: 9 }));
    expect(state.items.map(item => [item.command, item.at])).toEqual([["a", 9], ["b", 1]]);
    const other = withEntries(entry({ command: "a" }), entry({ command: "a", hostId: "h_bbbbbbbb" }));
    expect(other.items).toHaveLength(2);
  });

  test("only the latest commands are kept", () => {
    let state = DEFAULT_SSH_HISTORY_STATE;
    for (let i = 0; i < MAX_SSH_HISTORY + 5; i += 1) {
      const added = addHistoryEntry(state, entry({ command: `c${i}` }), `c_${String(i).padStart(8, "0")}`);
      if (!added.ok) throw new Error("setup");
      state = added.state;
    }
    expect(state.items).toHaveLength(MAX_SSH_HISTORY);
    expect(state.items[0].command).toBe(`c${MAX_SSH_HISTORY + 4}`);
  });

  test("an entry has to be consistent: an exit code only for a finished command, a command that fits", () => {
    expect(addHistoryEntry(DEFAULT_SSH_HISTORY_STATE, entry({ status: "timeout", exitCode: 0 }))).toEqual({ ok: false, reason: "invalid" });
    expect(addHistoryEntry(DEFAULT_SSH_HISTORY_STATE, entry({ status: "done", exitCode: null }))).toEqual({ ok: false, reason: "invalid" });
    expect(addHistoryEntry(DEFAULT_SSH_HISTORY_STATE, entry({ command: "  " }))).toEqual({ ok: false, reason: "invalid" });
    expect(addHistoryEntry(DEFAULT_SSH_HISTORY_STATE, entry({ command: "x".repeat(MAX_SSH_COMMAND + 1) }))).toEqual({ ok: false, reason: "invalid" });
  });

  test("one entry, one server or everything can be cleared", () => {
    const state = withEntries(entry({ command: "a" }), entry({ command: "b", hostId: "h_bbbbbbbb" }));
    expect(removeHistoryEntry(state, "c_zzzzzzzz")).toEqual({ ok: false, reason: "unknown" });
    const gone = removeHistoryEntry(state, "c_00000000");
    expect(gone.ok && gone.state.items.map(item => item.command)).toEqual(["b"]);
    const one = clearHistory(state, "h_aaaaaaaa");
    expect(one.ok && one.state.items.map(item => item.hostId)).toEqual(["h_bbbbbbbb"]);
    const all = clearHistory(state);
    expect(all.ok && all.state.items).toEqual([]);
    const same = clearHistory(state, "h_cccccccc");
    expect(same.ok && same.state).toBe(state);
    expect(historyOf(state, "h_bbbbbbbb").map(item => item.command)).toEqual(["b"]);
  });

  test("stored history round trips, and a damaged entry or an output field is dropped", () => {
    const state = withEntries(entry({ command: "a" }));
    expect(parseSshHistoryText(JSON.stringify(state))).toEqual({ state, valid: true, lossy: false });
    const good = state.items[0];
    const parsed = parseSshHistoryText(JSON.stringify({ items: [good, { ...good, id: "c_bbbbbbbb", status: "done", exitCode: null }, { ...good, id: "c_cccccccc", stdout: "secret" }] }));
    expect(parsed.lossy).toBe(true);
    expect(parsed.state.items.map(item => item.id)).toEqual(["c_00000000", "c_cccccccc"]);
    expect(JSON.stringify(parsed.state)).not.toContain("secret");
    expect(parseSshHistoryText("nope")).toEqual({ state: DEFAULT_SSH_HISTORY_STATE, valid: false, lossy: true });
  });
});
