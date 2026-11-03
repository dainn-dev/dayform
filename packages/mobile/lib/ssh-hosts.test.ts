import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SSH_HOSTS_STATE, MAX_SSH_HOSTS, addHost, checkHostForm, hostAddress, isValidHost, isValidPort, isValidUser, parseSshHostsText,
  removeHost, setFingerprint, updateHost, type SshHostForm, type SshHostsState,
} from "./ssh-hosts";

const FP = `SHA256:${"A".repeat(43)}`;
const form = (patch: Partial<SshHostForm> = {}): SshHostForm => ({ name: "prod", host: "10.0.0.5", port: "22", user: "deploy", auth: "key", ...patch });
const withHost = (): SshHostsState => {
  const added = addHost(DEFAULT_SSH_HOSTS_STATE, form(), "h_aaaaaaaa");
  if (!added.ok) throw new Error("setup");
  return added.state;
};

describe("host, port and user checks", () => {
  test("accepts names, IPv4 and IPv6, refuses URLs, spaces and out-of-range numbers", () => {
    for (const ok of ["example.com", "my-server", "a.b.c.d.example.org", "192.168.1.10", "::1", "fe80::1", "2001:db8::2"]) expect(isValidHost(ok)).toBe(true);
    for (const bad of ["", "ssh://example.com", "example.com:22", "a b", "256.1.1.1", "-bad.com", "bad-.com", "a..b", "1:2::3::4", "x".repeat(254)]) expect(isValidHost(bad)).toBe(false);
    expect(isValidPort(22) && isValidPort(65535) && isValidPort(1)).toBe(true);
    expect([0, 65536, 22.5, Number.NaN].some(isValidPort)).toBe(false);
    for (const ok of ["root", "deploy", "ubuntu_1", "a.b-c", "svc$"]) expect(isValidUser(ok)).toBe(true);
    for (const bad of ["", "1abc", "a b", "a;b", "x".repeat(65), "-x"]) expect(isValidUser(bad)).toBe(false);
  });

  test("the form is trimmed, an empty port means 22 and brackets around IPv6 are dropped", () => {
    expect(checkHostForm(form({ name: "  my   box ", host: " [::1] ", port: "", user: " me " }))).toEqual({
      ok: true, value: { name: "my box", host: "::1", port: 22, user: "me", auth: "key" },
    });
  });

  test("each wrong field is named", () => {
    expect(checkHostForm(form({ name: "  " }))).toEqual({ ok: false, reason: "invalid-name" });
    expect(checkHostForm(form({ host: "a b" }))).toEqual({ ok: false, reason: "invalid-host" });
    expect(checkHostForm(form({ port: "70000" }))).toEqual({ ok: false, reason: "invalid-port" });
    expect(checkHostForm(form({ port: "2x2" }))).toEqual({ ok: false, reason: "invalid-port" });
    expect(checkHostForm(form({ user: "bad user" }))).toEqual({ ok: false, reason: "invalid-user" });
  });

  test("an address is shown with its port only when it is not 22, IPv6 in brackets", () => {
    const base = { id: "h_aaaaaaaa", name: "x", user: "u", auth: "key" as const, fingerprint: null };
    expect(hostAddress({ ...base, host: "example.com", port: 22 })).toBe("example.com");
    expect(hostAddress({ ...base, host: "example.com", port: 2222 })).toBe("example.com:2222");
    expect(hostAddress({ ...base, host: "::1", port: 22 })).toBe("[::1]");
  });
});

describe("adding, editing and removing hosts", () => {
  test("adds a host with no trusted fingerprint", () => {
    expect(withHost().items).toEqual([{ id: "h_aaaaaaaa", name: "prod", host: "10.0.0.5", port: 22, user: "deploy", auth: "key", fingerprint: null }]);
  });

  test("names are unique ignoring case, and the list has a limit", () => {
    expect(addHost(withHost(), form({ name: "PROD" }))).toEqual({ ok: false, reason: "duplicate" });
    let state = DEFAULT_SSH_HOSTS_STATE;
    for (let i = 0; i < MAX_SSH_HOSTS; i += 1) {
      const next = addHost(state, form({ name: `h${i}` }), `h_${String(i).padStart(8, "0")}`);
      if (!next.ok) throw new Error("setup");
      state = next.state;
    }
    expect(addHost(state, form({ name: "one more" }))).toEqual({ ok: false, reason: "limit" });
  });

  test("editing keeps the trusted fingerprint, unless the host or the port moved", () => {
    const trusted = setFingerprint(withHost(), "h_aaaaaaaa", FP);
    if (!trusted.ok) throw new Error("setup");
    const renamed = updateHost(trusted.state, "h_aaaaaaaa", form({ name: "production", user: "ops", auth: "password" }));
    expect(renamed.ok && renamed.state.items[0]).toMatchObject({ name: "production", user: "ops", auth: "password", fingerprint: FP });
    const moved = updateHost(trusted.state, "h_aaaaaaaa", form({ host: "10.0.0.6" }));
    expect(moved.ok && moved.state.items[0].fingerprint).toBeNull();
    const newPort = updateHost(trusted.state, "h_aaaaaaaa", form({ port: "2222" }));
    expect(newPort.ok && newPort.state.items[0].fingerprint).toBeNull();
  });

  test("editing checks the form, an unknown id and a name taken by another host", () => {
    const two = addHost(withHost(), form({ name: "stage", host: "10.0.0.7" }), "h_bbbbbbbb");
    if (!two.ok) throw new Error("setup");
    expect(updateHost(two.state, "h_bbbbbbbb", form({ name: "Prod" }))).toEqual({ ok: false, reason: "duplicate" });
    expect(updateHost(two.state, "h_bbbbbbbb", form({ name: "stage", host: "no way" }))).toEqual({ ok: false, reason: "invalid-host" });
    expect(updateHost(two.state, "h_zzzzzzzz", form())).toEqual({ ok: false, reason: "unknown" });
    expect(removeHost(two.state, "h_zzzzzzzz")).toEqual({ ok: false, reason: "unknown" });
    const removed = removeHost(two.state, "h_aaaaaaaa");
    expect(removed.ok && removed.state.items.map(item => item.id)).toEqual(["h_bbbbbbbb"]);
  });
});

describe("reading stored hosts", () => {
  test("round trips, and never contains a secret field", () => {
    const state = withHost();
    expect(parseSshHostsText(JSON.stringify(state))).toEqual({ state, valid: true, lossy: false });
    expect(Object.keys(state.items[0]).sort()).toEqual(["auth", "fingerprint", "host", "id", "name", "port", "user"]);
  });

  test("a bad record is dropped and the read is lossy; an unknown extra field is dropped too", () => {
    const good = withHost().items[0];
    const text = JSON.stringify({ items: [good, { ...good, id: "h_bbbbbbbb", host: "a b" }, { ...good, id: "h_cccccccc", password: "hunter2" }, good] });
    const parsed = parseSshHostsText(text);
    expect(parsed.lossy).toBe(true);
    expect(parsed.state.items.map(item => item.id)).toEqual(["h_aaaaaaaa", "h_cccccccc"]);
    expect(JSON.stringify(parsed.state)).not.toContain("hunter2");
  });

  test("a damaged fingerprint becomes untrusted rather than dropping the host", () => {
    const good = withHost().items[0];
    const parsed = parseSshHostsText(JSON.stringify({ items: [{ ...good, fingerprint: "SHA256:short" }] }));
    expect(parsed.state.items[0].fingerprint).toBeNull();
  });

  test("text that is not a host list is invalid", () => {
    expect(parseSshHostsText("nope")).toEqual({ state: DEFAULT_SSH_HOSTS_STATE, valid: false, lossy: true });
    expect(parseSshHostsText(JSON.stringify({ items: "x" })).valid).toBe(false);
  });
});
