import { describe, expect, test } from "bun:test";
import { canAuthenticate, continueAllowed, probeFrom, statusFromError } from "./cycle-lock-result";

describe("statusFromError", () => {
  test("cancellations", () => {
    for (const error of ["user_cancel", "app_cancel", "system_cancel", "user_fallback"]) expect(statusFromError(error)).toBe("cancelled");
  });

  test("no screen lock or biometric set up is unavailable", () => {
    for (const error of ["not_enrolled", "passcode_not_set"]) expect(statusFromError(error)).toBe("unavailable");
  });

  test("everything else is a failure, never a success", () => {
    for (const error of ["not_available", "lockout", "timeout", "authentication_failed", "unknown", "something_new"]) expect(statusFromError(error)).toBe("failed");
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

describe("probeFrom and continueAllowed", () => {
  test("a phone with a lock or a biometric is available", () => {
    expect(probeFrom({ enrolled: false, level: 1 })).toBe("available");
    expect(probeFrom({ enrolled: true, level: 0 })).toBe("available");
  });

  test("a phone with nothing set up has none", () => {
    expect(probeFrom({ enrolled: false, level: 0 })).toBe("none");
  });

  test("continuing without a check is allowed only when there is truly no lock", () => {
    expect(continueAllowed("none")).toBe(true);
    expect(continueAllowed("available")).toBe(false);
    expect(continueAllowed("error")).toBe(false);
  });
});
