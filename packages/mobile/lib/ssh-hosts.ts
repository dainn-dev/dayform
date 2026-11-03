import { z } from "zod";

/**
 * SSH servers the user configured. Pure: no React, no storage (lib/ssh-hosts-context.tsx keeps them under
 * `dayform.ssh.v1`). A host record holds only what is not secret: the name, where to connect, the user, how to log in and
 * the fingerprint of the server key the user trusted. The password or private key lives only in the phone's secure
 * storage (lib/ssh-credentials-expo.ts) and never appears here, in a backup, in a log or in anything sent to the AI.
 */
export const MAX_SSH_HOSTS = 20;
export const MAX_HOST_NAME = 40;
export const DEFAULT_SSH_PORT = 22;
const MAX_HOST = 253;
const MAX_USER = 64;
const ID_PATTERN = /^h_[a-z0-9]{8}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 8;

export type SshAuth = "key" | "password";
export type SshHost = {
  id: string;
  /** What the user calls it ("prod", "Raspberry Pi"). */
  name: string;
  host: string;
  port: number;
  user: string;
  auth: SshAuth;
  /** `SHA256:` + base64 of the server's host key, set when the user trusted it; null until then. */
  fingerprint: string | null;
};
export type SshHostsState = { items: SshHost[] };
export const DEFAULT_SSH_HOSTS_STATE: SshHostsState = { items: [] };

export type SshHostFailure = "invalid-name" | "invalid-host" | "invalid-port" | "invalid-user" | "duplicate" | "limit" | "unknown";
export type SshHostResult = { ok: true; state: SshHostsState; id?: string } | { ok: false; reason: SshHostFailure };

/** What the user types in the editor; the port stays text until it is checked. */
export type SshHostForm = { name: string; host: string; port: string; user: string; auth: SshAuth };

export function generateHostId(random: () => number = Math.random): string {
  let id = "h_";
  for (let i = 0; i < ID_LENGTH; i += 1) id += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.floor(random() * ID_ALPHABET.length))];
  return id;
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;
const USER = /^[a-z_][a-z0-9._-]*\$?$/i;

/** A DNS name, an IPv4 address or an IPv6 address (without brackets); anything else (a URL, spaces, a port) is refused. */
export function isValidHost(value: string): boolean {
  if (value.length === 0 || value.length > MAX_HOST) return false;
  const v4 = IPV4.exec(value);
  if (v4) return v4.slice(1).every(part => Number(part) <= 255);
  if (value.includes(":")) return IPV6.test(value) && (value.match(/::/g) ?? []).length <= 1;
  return HOSTNAME.test(value);
}

export const isValidPort = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= 65535;
export const isValidUser = (value: string): boolean => value.length > 0 && value.length <= MAX_USER && USER.test(value);

export function cleanHostName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_HOST_NAME);
}

/** `host:port` as shown to the user (an IPv6 address gets brackets). */
export function hostAddress(host: SshHost): string {
  const name = host.host.includes(":") ? `[${host.host}]` : host.host;
  return host.port === DEFAULT_SSH_PORT ? name : `${name}:${host.port}`;
}

const hostSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  name: z.string().min(1).max(MAX_HOST_NAME),
  host: z.string().refine(isValidHost),
  port: z.number().refine(isValidPort),
  user: z.string().refine(isValidUser),
  auth: z.enum(["key", "password"]),
  fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/).nullable().catch(null),
});

export type ParsedHosts = { state: SshHostsState; valid: boolean; lossy: boolean };

/** Reads stored text. `lossy` is true when a record was dropped, so the caller keeps a copy before writing. */
export function parseSshHostsText(text: string): ParsedHosts {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: DEFAULT_SSH_HOSTS_STATE, valid: false, lossy: true };
  }
  const list = typeof raw === "object" && raw !== null && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (list === null) return { state: DEFAULT_SSH_HOSTS_STATE, valid: false, lossy: true };
  const seen = new Set<string>();
  const items: SshHost[] = [];
  for (const record of list.slice(0, MAX_SSH_HOSTS)) {
    const parsed = hostSchema.safeParse(record);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    items.push(parsed.data);
  }
  return { state: { items }, valid: true, lossy: items.length !== list.length };
}

type Checked = { ok: true; value: Omit<SshHost, "id" | "fingerprint"> } | { ok: false; reason: SshHostFailure };

/** Validates the editor's form. A host or port written with spaces around it is trimmed first. */
export function checkHostForm(form: SshHostForm): Checked {
  const name = cleanHostName(form.name);
  if (name === "") return { ok: false, reason: "invalid-name" };
  const host = form.host.trim().replace(/^\[|\]$/g, "");
  if (!isValidHost(host)) return { ok: false, reason: "invalid-host" };
  const portText = form.port.trim() === "" ? String(DEFAULT_SSH_PORT) : form.port.trim();
  const port = /^\d{1,5}$/.test(portText) ? Number(portText) : Number.NaN;
  if (!isValidPort(port)) return { ok: false, reason: "invalid-port" };
  const user = form.user.trim();
  if (!isValidUser(user)) return { ok: false, reason: "invalid-user" };
  return { ok: true, value: { name, host, port, user, auth: form.auth } };
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function addHost(state: SshHostsState, form: SshHostForm, id: string = generateHostId()): SshHostResult {
  const checked = checkHostForm(form);
  if (!checked.ok) return checked;
  if (state.items.length >= MAX_SSH_HOSTS) return { ok: false, reason: "limit" };
  if (state.items.some(item => sameName(item.name, checked.value.name))) return { ok: false, reason: "duplicate" };
  return { ok: true, state: { items: [...state.items, { id, ...checked.value, fingerprint: null }] }, id };
}

/** Saves an edit. Changing where the host is (address or port) forgets the trusted fingerprint: it belongs to the old server. */
export function updateHost(state: SshHostsState, id: string, form: SshHostForm): SshHostResult {
  const current = state.items.find(item => item.id === id);
  if (!current) return { ok: false, reason: "unknown" };
  const checked = checkHostForm(form);
  if (!checked.ok) return checked;
  if (state.items.some(item => item.id !== id && sameName(item.name, checked.value.name))) return { ok: false, reason: "duplicate" };
  const moved = checked.value.host !== current.host || checked.value.port !== current.port;
  const next: SshHost = { id, ...checked.value, fingerprint: moved ? null : current.fingerprint };
  return { ok: true, state: { items: state.items.map(item => (item.id === id ? next : item)) } };
}

/** Records the fingerprint the user trusted (or clears it with null, so the next connection asks again). */
export function setFingerprint(state: SshHostsState, id: string, fingerprint: string | null): SshHostResult {
  if (!state.items.some(item => item.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.map(item => (item.id === id ? { ...item, fingerprint } : item)) } };
}

export function removeHost(state: SshHostsState, id: string): SshHostResult {
  if (!state.items.some(item => item.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.filter(item => item.id !== id) } };
}
