/**
 * When the private cycle screen asks for biometrics again. Pure, with the clock passed in, so the screen component
 * only forwards events. `unlockedAt` is the time (ms) of the last unlock or activity, or null while locked; it starts
 * as null at every cold start, so the app always asks after it was closed.
 */
const MS_PER_SECOND = 1000;

export type LockCheck = {
  lockEnabled: boolean;
  /** 0 = lock every time the screen is left; otherwise seconds of inactivity allowed. */
  timeoutSec: number;
  unlockedAt: number | null;
  now: number;
};

export type UnlockEvent =
  | { type: "unlocked"; now: number }
  | { type: "activity"; now: number; timeoutSec: number }
  | { type: "left"; timeoutSec: number }
  | { type: "reset" };

function windowOpen(unlockedAt: number, now: number, timeoutSec: number): boolean {
  if (!Number.isFinite(timeoutSec) || timeoutSec < 0 || !Number.isFinite(now) || now < unlockedAt) return false;
  // With 0 the screen stays open until `left` clears it; a bad clock was refused above.
  return timeoutSec === 0 || now - unlockedAt < timeoutSec * MS_PER_SECOND;
}

export function shouldRequireUnlock(check: LockCheck): boolean {
  if (!check.lockEnabled) return false;
  if (check.unlockedAt === null) return true;
  return !windowOpen(check.unlockedAt, check.now, check.timeoutSec);
}

/** The new `unlockedAt` after an event. Activity can extend an open window but never reopen a closed one. */
export function nextUnlockState(unlockedAt: number | null, event: UnlockEvent): number | null {
  switch (event.type) {
    case "unlocked":
      return event.now;
    case "activity":
      return unlockedAt !== null && windowOpen(unlockedAt, event.now, event.timeoutSec) ? event.now : null;
    case "left":
      return event.timeoutSec === 0 ? null : unlockedAt;
    case "reset":
      return null;
  }
}
