import * as LocalAuthentication from "expo-local-authentication";
import { canAuthenticate, statusFromError, type AuthResult } from "./cycle-lock-result";

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

/** True when a biometric or a screen lock is set up, so a check can succeed. Never throws. */
export async function isLockAvailable(): Promise<boolean> {
  try {
    const [enrolled, level] = await Promise.all([
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return canAuthenticate({ enrolled, level: Number(level) });
  } catch {
    return false;
  }
}

/** Asks the phone to verify the user. A thrown native error is reported as a plain failure. */
export async function authenticate(prompt: AuthPrompt): Promise<AuthResult> {
  try {
    if (!(await isLockAvailable())) return { status: "unavailable" };
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
