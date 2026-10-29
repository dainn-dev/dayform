/**
 * The last unlock time, kept in memory only for this app run. A cold start therefore always asks again, and leaving
 * the screen and coming back within the timeout does not. It is never written to storage.
 */
let unlockedAt: number | null = null;

export const readUnlockedAt = (): number | null => unlockedAt;

export function writeUnlockedAt(value: number | null): void {
  unlockedAt = value;
}
