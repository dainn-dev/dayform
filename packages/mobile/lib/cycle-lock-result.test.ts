import { describe, expect, test } from "bun:test";
import { canAuthenticate, statusFromError } from "./cycle-lock-result";

describe("statusFromError", () => {
  test("cancellations", () => {
    for (const error of ["user_cancel", "app_cancel", "system_cancel", "user_fallback"]) expect(statusFromError(error)).toBe("cancelled");
  });

  test("no screen lock or biometric set up is unavailable", () => {
    for (const error of ["not_enrolled", "not_available", "passcode_not_set"]) expect(statusFromError(error)).toBe("unavailable");
  });

  test("everything else is a failure, never a success", () => {
    for (const error of ["lockout", "timeout", "authentication_failed", "unknown", "something_new"]) expect(statusFromError(error)).toBe("failed");
  });
});

describe("canAuthenticate", () => {
  test("needs a screen lock or an enrolled biometric", () => {
    expect(canAuthenticate({ enrolled: false, level: 0 })).toBe(false);
    expect(canAuthenticate({ enrolled: false, level: 1 })).toBe(true);
    expect(canAuthenticate({ enrolled: true, level: 0 })).toBe(true);
    expect(canAuthenticate({ enrolled: true, level: 3 })).toBe(true);
  });
});
