export type JsonResult = { ok: true; value: unknown } | { ok: false };

/** `JSON.parse` as a typed result, so callers never need a try/catch of their own. */
export function parseJson(text: string): JsonResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
