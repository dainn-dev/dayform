import type { KeyValueStorage } from "./task-storage";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedScheme = "light" | "dark";
export type SaveThemeResult = { ok: true } | { ok: false; reason: "write-failed" };

export const THEME_STORAGE_KEY = "dayform.theme.v1";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** Anything that is not a known preference means "follow the system". */
export function parseThemePreference(raw: unknown): ThemePreference {
  return THEME_PREFERENCES.find(pref => pref === raw) ?? "system";
}

/** Never writes: a missing, invalid or unreadable value just means "system". */
export async function loadThemePreference(storage: KeyValueStorage): Promise<ThemePreference> {
  try {
    return parseThemePreference(await storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export async function saveThemePreference(
  storage: KeyValueStorage,
  preference: ThemePreference,
): Promise<SaveThemeResult> {
  try {
    await storage.setItem(THEME_STORAGE_KEY, preference);
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}

/** `system` is whatever the device reports; unknown values (null, "unspecified") count as light. */
export function resolveScheme(preference: ThemePreference, system: unknown): ResolvedScheme {
  if (preference !== "system") return preference;
  return system === "dark" ? "dark" : "light";
}
