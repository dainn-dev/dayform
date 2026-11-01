import * as SecureStore from "expo-secure-store";

/**
 * The AI provider's API key, in the phone's secure storage (Android Keystore) and nowhere else: not in AsyncStorage,
 * the settings, backups, snapshots or the Android Auto Backup (the expo-secure-store plugin runs with
 * `configureAndroidBackup: false`, so the app's own backup rules, which cover only the AsyncStorage database, stay).
 * Untested glue.
 */
const KEY = "dayform.ai.apiKey";
const MAX_KEY = 400;

export async function readApiKey(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export async function saveApiKey(value: string): Promise<boolean> {
  const clean = value.trim();
  if (!clean || clean.length > MAX_KEY) return false;
  try {
    await SecureStore.setItemAsync(KEY, clean);
    return true;
  } catch {
    return false;
  }
}

export async function deleteApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing stored, or the store is gone: either way there is no key.
  }
}
