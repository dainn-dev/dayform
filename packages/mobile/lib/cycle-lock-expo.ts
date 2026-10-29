import * as LocalAuthentication from "expo-local-authentication";
import { probeFrom, statusFromError, type AuthResult, type LockProbe } from "./cycle-lock-result";

/**
 * Thin adapter over expo-local-authentication: the phone verifies the user with a biometric, or with the screen
 * lock (PIN, pattern, password) as the fallback. Nothing is stored and nothing leaves the device. The decisions
 * live in cycle-lock-result.ts and cycle-lock-gate.ts; this file only calls the native module.
 */
export type AuthPrompt = {
  /** Already translated and neutral: it must not say what the app is used for. */
  message: string;
  cancelLabel: string;
};

/** Looks for a lock to verify against. A native error is `error` (unknown), never `none`. */
export async function probeLock(): Promise<LockProbe> {
  try {
    const [enrolled, level] = await Promise.all([
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return probeFrom({ enrolled, level: Number(level) });
  } catch {
    return "error";
  }
}

/** True when a biometric or a screen lock is set up, so a check can succeed. Never throws. */
export async function isLockAvailable(): Promise<boolean> {
  return (await probeLock()) === "available";
}

/**
 * Asks the phone to verify the user. A phone with no lock is `unavailable`; a thrown native error (also while
 * looking for a lock) is a plain failure, so a transient error never offers to skip the check.
 */
export async function authenticate(prompt: AuthPrompt): Promise<AuthResult> {
  try {
    const probe = await probeLock();
    if (probe === "none") return { status: "unavailable" };
    if (probe === "error") return { status: "failed" };
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt.message,
      cancelLabel: prompt.cancelLabel,
      disableDeviceFallback: false,
    });
    return { status: result.success ? "success" : statusFromError(result.error) };
  } catch {
    return { status: "failed" };
  }
}
