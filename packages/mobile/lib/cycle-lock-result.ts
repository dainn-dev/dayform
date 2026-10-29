/** Outcome of asking the phone to verify the user, reduced to what the cycle screen needs to decide. */
export type AuthStatus = "success" | "cancelled" | "failed" | "unavailable";
export type AuthResult = { status: AuthStatus };

const CANCEL_ERRORS = new Set(["user_cancel", "app_cancel", "system_cancel", "user_fallback"]);
const UNAVAILABLE_ERRORS = new Set(["not_enrolled", "not_available", "passcode_not_set"]);

/** Maps an `expo-local-authentication` error code to a status. Unknown codes count as a plain failure. */
export function statusFromError(error: string): AuthStatus {
  if (CANCEL_ERRORS.has(error)) return "cancelled";
  if (UNAVAILABLE_ERRORS.has(error)) return "unavailable";
  return "failed";
}

export type LockSupport = { enrolled: boolean; level: number };

/**
 * True when the phone can verify the user: a biometric or a screen lock (PIN, pattern, password) is set up.
 * `level` is `SecurityLevel` (0 = nothing enrolled, 1 = screen lock, 2 and 3 = biometrics).
 */
export function canAuthenticate(support: LockSupport): boolean {
  return support.level > 0 || support.enrolled;
}
