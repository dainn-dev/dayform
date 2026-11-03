import * as SecureStore from "expo-secure-store";
import { MAX_SSH_SECRET, type SshCredentials } from "./ssh";

/**
 * The password or private key of each SSH server, in the phone's secure storage (Android Keystore) and nowhere else: not
 * in AsyncStorage, the settings, backups, snapshots or the Android Auto Backup (the expo-secure-store plugin runs with
 * `configureAndroidBackup: false`). One entry per host id. Untested glue.
 */
const PREFIX = "dayform.ssh.cred.";
const ID = /^h_[a-z0-9]{8}$/;

const keyFor = (hostId: string): string | null => (ID.test(hostId) ? `${PREFIX}${hostId}` : null);

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value.length <= MAX_SSH_SECRET ? value : undefined;
}

export async function readSshCredentials(hostId: string): Promise<SshCredentials | null> {
  const key = keyFor(hostId);
  if (key === null) return null;
  try {
    const text = await SecureStore.getItemAsync(key);
    if (text === null) return null;
    const raw = JSON.parse(text) as Record<string, unknown>;
    const credentials: SshCredentials = { password: clean(raw.password), privateKey: clean(raw.privateKey), passphrase: clean(raw.passphrase) };
    return credentials.password === undefined && credentials.privateKey === undefined ? null : credentials;
  } catch {
    return null;
  }
}

/** True when a password or a key is saved for the host (without handing the secret to the caller). */
export async function hasSshCredentials(hostId: string): Promise<boolean> {
  return (await readSshCredentials(hostId)) !== null;
}

export async function saveSshCredentials(hostId: string, credentials: SshCredentials): Promise<boolean> {
  const key = keyFor(hostId);
  if (key === null) return false;
  const value = { password: clean(credentials.password), privateKey: clean(credentials.privateKey), passphrase: clean(credentials.passphrase) };
  if (value.password === undefined && value.privateKey === undefined) return false;
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function deleteSshCredentials(hostId: string): Promise<void> {
  const key = keyFor(hostId);
  if (key === null) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to remove, or the storage is not available: the entry cannot be read either way.
  }
}
