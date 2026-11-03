import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { DEFAULT_SSH_TIMEOUT_MS, MAX_SSH_COMMAND, MAX_SSH_TIMEOUT_MS, SshError, isFingerprint, toSshError, type SshCredentials, type SshResult } from "../../lib/ssh";

type NativeRequest = {
  host: string; port: number; user: string; fingerprint: string; command: string; timeoutMs: number; maxBytes: number;
  password?: string; privateKey?: string; passphrase?: string;
};
type NativeResult = SshResult & { fingerprint: string };
type DayformSshNative = {
  fetchFingerprint(host: string, port: number, timeoutMs: number): Promise<string>;
  exec(request: NativeRequest): Promise<NativeResult>;
};

/** Null on web, iOS, Expo Go and any build that does not contain the Android module. */
const native: DayformSshNative | null = Platform.OS === "android" ? requireOptionalNativeModule<DayformSshNative>("DayformSsh") : null;

export function isSshSupported(): boolean {
  return native !== null;
}

export type SshTarget = { host: string; port: number; user: string };
export type RunOptions = { command: string; fingerprint: string; credentials: SshCredentials; timeoutMs?: number; maxBytes?: number };

const CONNECT_CHECK_MS = 15_000;
const DEFAULT_MAX_BYTES = 65_536;

/** The server's host key, read without logging in. Rejects with an [SshError]. */
export async function fetchHostFingerprint(target: Pick<SshTarget, "host" | "port">): Promise<string> {
  if (native === null) throw new SshError("UNSUPPORTED");
  try {
    const fingerprint = await native.fetchFingerprint(target.host, target.port, CONNECT_CHECK_MS);
    if (!isFingerprint(fingerprint)) throw new SshError("CONNECT_FAILED");
    return fingerprint;
  } catch (error) {
    throw toSshError(error);
  }
}

/**
 * Runs one command on the server. The host key must match `fingerprint` (checked natively before any login), so a call
 * without a trusted fingerprint is refused here already. Rejects with an [SshError]; credentials never appear in it.
 */
export async function runSshCommand(target: SshTarget, options: RunOptions): Promise<SshResult> {
  if (native === null) throw new SshError("UNSUPPORTED");
  if (!isFingerprint(options.fingerprint)) throw new SshError("HOST_KEY_UNKNOWN");
  const command = options.command.trim();
  if (command === "" || command.length > MAX_SSH_COMMAND) throw new SshError("BAD_REQUEST");
  const { password, privateKey, passphrase } = options.credentials;
  if (!password && !privateKey) throw new SshError("NO_CREDENTIALS");
  try {
    const result = await native.exec({
      host: target.host, port: target.port, user: target.user, fingerprint: options.fingerprint, command,
      timeoutMs: Math.min(options.timeoutMs ?? DEFAULT_SSH_TIMEOUT_MS, MAX_SSH_TIMEOUT_MS), maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
      ...(password ? { password } : {}), ...(privateKey ? { privateKey } : {}), ...(passphrase ? { passphrase } : {}),
    });
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, truncated: result.truncated, timedOut: result.timedOut };
  } catch (error) {
    throw toSshError(error);
  }
}
