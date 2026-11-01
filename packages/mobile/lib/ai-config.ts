/**
 * The AI provider the user configured (framework-free, tested): any OpenAI-compatible endpoint. The base URL and the
 * model live in the settings; the API key never does (it is kept in the phone's secure storage, see ai-key-expo.ts).
 */

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const MAX_BASE_URL = 300;
export const MAX_MODEL = 120;

/** Hosts allowed over plain http: only the user's own computer or network (a local model server). */
function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")
    || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export type BaseUrlCheck = { ok: true; url: string } | { ok: false; reason: "empty" | "invalid" | "insecure" };

/** Trims the URL and its trailing slashes; https is required except for a server on the local network. */
export function checkBaseUrl(raw: string): BaseUrlCheck {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return { ok: false, reason: "empty" };
  const match = /^(https?):\/\/([^/:?#]+)(:\d+)?(\/[^?#]*)?$/i.exec(value);
  if (!match) return { ok: false, reason: "invalid" };
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  if (scheme === "http" && !isLocalHost(host)) return { ok: false, reason: "insecure" };
  return { ok: true, url: value };
}

/** Where chat completions are posted. A base URL that already ends in /chat/completions is used as it is. */
export function chatUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

export type AiReadiness = "off" | "no-url" | "no-model" | "no-key" | "ready";

/** Whether the AI can be asked, and what is missing when it cannot. */
export function aiReadiness(ai: { enabled: boolean; baseUrl: string; model: string }, hasKey: boolean): AiReadiness {
  if (!ai.enabled) return "off";
  if (!checkBaseUrl(ai.baseUrl).ok) return "no-url";
  if (!ai.model.trim()) return "no-model";
  if (!hasKey) return "no-key";
  return "ready";
}

/** Shows only the end of a key, so the user can tell which one is saved. */
export function maskKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 8) return "••••";
  return `••••${clean.slice(-4)}`;
}
