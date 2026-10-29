/** Outcome of asking the phone to verify the user, reduced to what the cycle screen needs to decide. */
export type AuthStatus = "success" | "cancelled" | "failed" | "unavailable";
export type AuthResult = { status: AuthStatus };

const CANCEL_ERRORS = new Set(["user_cancel", "app_cancel", "system_cancel", "user_fallback"]);
// `not_available` is deliberately not here: the native module also reports it for a sensor that is only busy or
// temporarily unavailable, and treating that as "no screen lock" would offer to skip the lock on a phone that has one.
// Whether the phone has a lock is decided by the capability probe (`probeFrom`), never by an error code.
const UNAVAILABLE_ERRORS = new Set(["not_enrolled", "passcode_not_set"]);

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

/** What the capability check found: a lock to verify against, truly none, or the check itself failed (unknown). */
export type LockProbe = "available" | "none" | "error";

export const probeFrom = (support: LockSupport): LockProbe => (canAuthenticate(support) ? "available" : "none");

/** The user may continue without a check only when the phone truly has no screen lock; an unknown state retries. */
export const continueAllowed = (probe: LockProbe): boolean => probe === "none";
