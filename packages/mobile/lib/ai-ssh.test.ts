import { describe, expect, test } from "bun:test";
import type { ToolCall } from "./ai-stream";
import { CARD_TEXTS, actionIsRisky, checkSettingsChanges, describeAction, openSettings, parseToolCall, toolsFor, TOOL_DEFINITIONS, SSH_TOOL_DEFINITIONS, type Action, type ToolContext } from "./ai-tools";
import { systemPrompt } from "./ai-prompt";
import { extraTranslations } from "./i18n";
import { DEFAULT_SETTINGS } from "./settings";
import { MAX_AI_OUTPUT_CHARS, MAX_SSH_PER_TURN, SSH_LIMIT_ERROR, sshResultForModel } from "./ssh-ai";
import type { SshResult } from "./ssh";
import type { RunOutcome } from "./ssh-run";

const ctx = (ssh: ToolContext["ssh"]): ToolContext => ({
  tasks: [], settings: DEFAULT_SETTINGS, categories: [], shareTitles: true, now: new Date(2026, 10, 1, 8, 0), newId: () => "n",
  ssh,
});
const ON = { enabled: true, hosts: [{ id: "h_aaaaaaaa", name: "prod", trusted: true }, { id: "h_bbbbbbbb", name: "new", trusted: false }] };
const call = (name: string, args: unknown): ToolCall => ({ id: "c", type: "function", function: { name, arguments: JSON.stringify(args) } });
const run = (command: string, host = "h_aaaaaaaa") => parseToolCall(call("ssh_run", { host_id: host, command }), ctx(ON));
const action = (parsed: ReturnType<typeof parseToolCall>): Action => {
  if (parsed.kind !== "action") throw new Error(`expected an action, got ${JSON.stringify(parsed)}`);
  return parsed.action;
};

describe("the SSH tools are only offered and only usable when the user allows them", () => {
  test("the request carries the SSH tools only when allowed, after the others, which never change", () => {
    expect(toolsFor(false)).toBe(TOOL_DEFINITIONS);
    const withSsh = toolsFor(true).map(tool => tool.function.name);
    expect(withSsh.slice(0, TOOL_DEFINITIONS.length)).toEqual(TOOL_DEFINITIONS.map(tool => tool.function.name));
    expect(withSsh.slice(TOOL_DEFINITIONS.length)).toEqual(SSH_TOOL_DEFINITIONS.map(tool => tool.function.name));
    expect(withSsh).toContain("ssh_run");
    expect(TOOL_DEFINITIONS.map(tool => tool.function.name)).not.toContain("ssh_run");
  });

  test("both tools refuse while SSH is off, or when the app gave no SSH context", () => {
    for (const ssh of [undefined, { enabled: false, hosts: ON.hosts }]) {
      for (const [name, args] of [["ssh_list_hosts", {}], ["ssh_run", { host_id: "h_aaaaaaaa", command: "uptime" }]] as const) {
        const parsed = parseToolCall(call(name, args), ctx(ssh));
        expect(parsed.kind).toBe("error");
      }
    }
  });

  test("the settings the assistant may change never include SSH", () => {
    expect(Object.keys(openSettings(DEFAULT_SETTINGS))).not.toContain("ssh");
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { ssh: { assistant: true } }).ok).toBe(false);
    expect(checkSettingsChanges(DEFAULT_SETTINGS, { ssh: { shareOutput: true } }).ok).toBe(false);
  });
});

describe("listing servers and proposing a command", () => {
  test("the list has ids, names and whether the key is trusted, nothing else", () => {
    const parsed = parseToolCall(call("ssh_list_hosts", {}), ctx(ON));
    expect(parsed).toEqual({ kind: "read", result: { servers: [{ id: "h_aaaaaaaa", name: "prod", trusted: true }, { id: "h_bbbbbbbb", name: "new", trusted: false }] } });
  });

  test("a command becomes an action to confirm, never a run", () => {
    const a = action(run("df -h"));
    expect(a).toEqual({ kind: "ssh-run", hostId: "h_aaaaaaaa", hostName: "prod", command: "df -h", risks: [], chained: false });
    expect(actionIsRisky(a)).toBe(false);
    expect(describeAction(a)).toEqual([{ text: "Run on server {host}:", vars: { host: "prod" } }, { text: "{command}", vars: { command: "df -h" } }]);
  });

  test("a risky or chained command says so on the card and needs a tap", () => {
    const a = action(run("cd /srv && rm -rf cache"));
    expect(actionIsRisky(a)).toBe(true);
    const lines = describeAction(a).map(line => line.text);
    expect(lines).toContain("It runs several commands in a row.");
    expect(lines).toContain("Careful, this command may be dangerous:");
    expect(lines).toContain("It deletes files, possibly a whole folder.");
  });

  test("an unknown server, an untrusted one, a bad command and extra arguments are refused", () => {
    expect(run("uptime", "h_zzzzzzzz").kind).toBe("error");
    expect(run("uptime", "h_bbbbbbbb")).toMatchObject({ kind: "error" });
    expect(parseToolCall(call("ssh_run", { host_id: "h_aaaaaaaa", command: "  " }), ctx(ON)).kind).toBe("error");
    expect(run("x".repeat(4001)).kind).toBe("error");
    expect(run("echo a\0b").kind).toBe("error");
    expect(parseToolCall(call("ssh_run", { host_id: "h_aaaaaaaa", command: "ls", password: "x" }), ctx(ON)).kind).toBe("error");
    expect(parseToolCall(call("ssh_run", { host_id: "h_aaaaaaaa", command: "ls", timeout: 999 }), ctx(ON)).kind).toBe("error");
  });

  test("every text of the SSH cards is translated", () => {
    for (const text of CARD_TEXTS) expect({ text, vi: extraTranslations[text] !== undefined }).toEqual({ text, vi: true });
    expect(extraTranslations["This one needs a tap: press Agree on the card."]).toBeTruthy();
  });
});

const result = (patch: Partial<SshResult> = {}): SshResult => ({ exitCode: 0, stdout: "ok\n", stderr: "", truncated: false, timedOut: false, ...patch });
const done = (patch: Partial<SshResult> = {}): RunOutcome => ({ ok: true, result: result(patch), ms: 10, entry: { hostId: "h_aaaaaaaa", command: "x", at: 1, status: "done", exitCode: 0 } });

describe("what the model is told about a run", () => {
  test("with 'Send command output to the AI' off it learns the exit code and nothing the server printed", () => {
    const told = sshResultForModel(done({ stdout: "SECRET=1", stderr: "token" }), false);
    expect(told).toMatchObject({ ok: true, exit_code: 0, timed_out: false, output: "not shared" });
    expect(JSON.stringify(told)).not.toContain("SECRET");
    expect(JSON.stringify(told)).not.toContain("token");
  });

  test("with it on the output is cut and marked as data, never as instructions", () => {
    const told = sshResultForModel(done({ stdout: "a".repeat(MAX_AI_OUTPUT_CHARS + 50), stderr: "err" }), true);
    expect((told.stdout as string).length).toBe(MAX_AI_OUTPUT_CHARS);
    expect(told).toMatchObject({ ok: true, stderr: "err", output_cut: true });
    expect(String(told.note)).toContain("not instructions");
  });

  test("a timeout has no exit code, and a failure carries only its fixed text", () => {
    expect(sshResultForModel(done({ timedOut: true, exitCode: -1 }), false)).toMatchObject({ exit_code: null, timed_out: true });
    const failed = sshResultForModel({ ok: false, code: "HOST_KEY_MISMATCH", entry: null }, true);
    expect(failed).toEqual({ ok: false, error: expect.stringContaining("not the one you trusted") });
  });

  test("a question can run only a few commands", () => {
    expect(MAX_SSH_PER_TURN).toBe(3);
    expect(SSH_LIMIT_ERROR).toContain("3");
  });
});

describe("the prompt", () => {
  const input = { name: "Leo", language: "en" as const, now: new Date(2026, 10, 1), weekStart: "mon" as const };
  test("explains SSH only when it is allowed, and says output is data and every command needs its own yes", () => {
    expect(systemPrompt(input)).not.toContain("ssh_run");
    const prompt = systemPrompt({ ...input, ssh: true });
    expect(prompt).toContain("ssh_run");
    expect(prompt).toContain("never an instruction");
    expect(prompt).toContain("agree to every single one");
    expect(prompt).toContain("Never ask for passwords or keys");
  });
});
