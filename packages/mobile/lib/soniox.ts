/**
 * Soniox's REST base and error reading (framework-free, tested). Speech to text itself is real time
 * (lib/soniox-rt.ts, components/assistant/use-soniox.ts); the REST API only checks the key (`GET /v1/models`).
 */

export const SONIOX_BASE = "https://api.soniox.com/v1";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Soniox's error message in an error answer, or null. */
export function sonioxError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error_message === "string") return payload.error_message;
  return null;
}
