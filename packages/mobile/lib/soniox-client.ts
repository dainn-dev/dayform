import { AiError } from "./ai-client";
import { SONIOX_BASE, sonioxError } from "./soniox";

/** Checks a Soniox key with a request that costs nothing (the model list); untested glue. */
export async function testSoniox(apiKey: string): Promise<string | null> {
  try {
    let response: Response;
    try {
      response = await fetch(`${SONIOX_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch {
      throw new AiError("Could not reach Soniox.", null);
    }
    if (response.status === 401 || response.status === 403) throw new AiError("Soniox did not accept the API key.", response.status);
    if (!response.ok) {
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new AiError(sonioxError(payload) ?? `Soniox answered ${response.status}.`, response.status);
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not reach Soniox.";
  }
}
