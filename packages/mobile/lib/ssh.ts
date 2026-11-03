/**
 * What the app knows about an SSH call, apart from the native code that makes it (modules/dayform-ssh). Pure: no React and
 * no storage. Errors carry a code so a screen can say what went wrong in the user's language; the native message is never
 * shown (it can name the server) and a credential never appears in one.
 */
export const SSH_ERROR_CODES = [
  "HOST_KEY_UNKNOWN", "HOST_KEY_MISMATCH", "AUTH_FAILED", "KEY_INVALID", "TIMEOUT", "NEGOTIATION_FAILED", "CONNECT_FAILED",
  "BAD_REQUEST", "NO_CREDENTIALS", "UNSUPPORTED",
] as const;
export type SshErrorCode = (typeof SSH_ERROR_CODES)[number];

export class SshError extends Error {
  readonly code: SshErrorCode;
  constructor(code: SshErrorCode) {
    super(code);
    this.name = "SshError";
    this.code = code;
  }
}

/** The English text of each failure; it is also the translation key (lib/i18n/ssh.ts). */
export const SSH_ERROR_TEXTS: Readonly<Record<SshErrorCode, string>> = {
  HOST_KEY_UNKNOWN: "This server's key is not trusted yet. Check its fingerprint first.",
  HOST_KEY_MISMATCH: "The server's key is not the one you trusted. Someone may be intercepting the connection, or the server was reinstalled. Nothing was sent.",
  AUTH_FAILED: "The server refused the login. Check the user name and the password or key.",
  KEY_INVALID: "The private key could not be read. Check its format and its passphrase.",
  TIMEOUT: "The server did not answer in time.",
  NEGOTIATION_FAILED: "The server and the app have no encryption method in common.",
  CONNECT_FAILED: "Could not connect. Check the address, the port and your network.",
  BAD_REQUEST: "The command is empty or too long.",
  NO_CREDENTIALS: "No password or key is saved for this server.",
  UNSUPPORTED: "SSH is not available in this build of the app.",
};

const KNOWN = new Set<string>(SSH_ERROR_CODES);

/** Maps anything thrown by the native call to an [SshError]; an unknown failure becomes CONNECT_FAILED. */
export function toSshError(error: unknown): SshError {
  if (error instanceof SshError) return error;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return new SshError(typeof code === "string" && KNOWN.has(code) ? (code as SshErrorCode) : "CONNECT_FAILED");
}

export type SshCredentials = { password?: string; privateKey?: string; passphrase?: string };

export const MAX_SSH_SECRET = 16_000;
export const MAX_SSH_COMMAND = 4000;
export const DEFAULT_SSH_TIMEOUT_MS = 30_000;
export const MAX_SSH_TIMEOUT_MS = 120_000;

export type SshResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** The output was longer than the limit and the end was dropped. */
  truncated: boolean;
  timedOut: boolean;
};

const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]+-----END [A-Z0-9 ]*PRIVATE KEY-----/;

/** True when `text` looks like a private key file (OpenSSH, PEM RSA/EC, PKCS#8), so a pasted public key or a typo is caught early. */
export function looksLikePrivateKey(text: string): boolean {
  return text.length <= MAX_SSH_SECRET && PRIVATE_KEY.test(text);
}

/** A key as the user pasted it: line endings normalised and one final newline, which some key parsers need. */
export function cleanPrivateKey(text: string): string {
  return `${text.replace(/\r\n?/g, "\n").trim()}\n`;
}

/** `SHA256:` + 43 base64 characters, the form of `ssh-keygen -l`; anything else is not a fingerprint. */
export function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^SHA256:[A-Za-z0-9+/]{43}$/.test(value);
}

/** The fingerprint cut for a small screen: its start and end are what a person compares. */
export function shortFingerprint(value: string): string {
  return value.length <= 24 ? value : `${value.slice(0, 15)}…${value.slice(-8)}`;
}
