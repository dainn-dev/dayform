import { z } from "zod";

/** Pure, framework-free logic for the "new version available" check. `fetch` is always injected. */

export const REPO_URL_PREFIX = "https://github.com/dainn-dev/dayform/";
export const FALLBACK_PAGE_URL = "https://github.com/dainn-dev/dayform/releases";
export const LATEST_RELEASE_URL = "https://api.github.com/repos/dainn-dev/dayform/releases/latest";
export const MAX_NOTES_LENGTH = 700;
export const AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** After a network error the automatic check waits this long instead of retrying on every foreground event. */
export const NETWORK_RETRY_DELAY_MS = 15 * 60 * 1000;
export const DEFAULT_TIMEOUT_MS = 6000;
/** The release JSON of a normal release is a few KB; anything above this is refused before it is parsed. */
export const MAX_BODY_CHARS = 200_000;

const MAX_URL_LENGTH = 500;
const MAX_NAME_LENGTH = 80;
const MAX_RAW_NOTES_LENGTH = 20_000;
const MAX_TAG_LENGTH = 64;
const MAX_ASSET_NAME_LENGTH = 300;
const ELLIPSIS = "…";
const RELEASES_PREFIX = FALLBACK_PAGE_URL;

export type Release = {
  version: string;
  name: string;
  notes: string;
  pageUrl: string;
  apkUrl: string | null;
  apkBytes: number | null;
};

export type ParseResult =
  | { ok: true; release: Release }
  | { ok: false; reason: "invalid" | "draft" | "prerelease" };

export type FetchResponseLike = {
  status: number;
  ok: boolean;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
};
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<FetchResponseLike>;

export type FetchErrorReason = "network" | "rate-limited" | "invalid";
export type FetchResult =
  | { kind: "release"; release: Release }
  | { kind: "none" }
  | { kind: "error"; reason: FetchErrorReason };

// ---- versions ----

const VERSION_PATTERN = /^\d{1,9}(\.\d{1,9}){0,5}$/;

type ParsedVersion = { text: string; parts: number[] };

function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/^[vV]/, "");
  return VERSION_PATTERN.test(text) ? { text, parts: text.split(".").map(Number) } : null;
}

/** Strips a leading "v"; null when the text is not a dotted numeric version. */
export function normalizeVersion(raw: unknown): string | null {
  return parseVersion(raw)?.text ?? null;
}

/** Numeric comparison of dotted versions (missing parts are 0). Garbage is "invalid", never NaN math. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | "invalid" {
  const parsedLeft = parseVersion(a);
  const parsedRight = parseVersion(b);
  if (!parsedLeft || !parsedRight) return "invalid";
  const left = parsedLeft.parts;
  const right = parsedRight.parts;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewer(current: string, release: Pick<Release, "version">): boolean {
  return compareVersions(release.version, current) === 1;
}

/** The one rule for "should the prompt open on its own": newer than installed and not skipped by the user. */
export function shouldPrompt(input: { current: string; release: Pick<Release, "version">; skipped: string | null }): boolean {
  return isNewer(input.current, input.release) && input.skipped !== input.release.version;
}

export function shouldAutoCheck(input: {
  auto: boolean;
  lastCheckAt: number | null;
  /** Earliest time to retry after a network error. Ignored when absent or implausibly far ahead (clock moved back). */
  retryAt?: number | null;
  now: number;
  minIntervalMs?: number;
}): boolean {
  if (!input.auto) return false;
  const { lastCheckAt, retryAt, now, minIntervalMs = AUTO_CHECK_INTERVAL_MS } = input;
  if (typeof retryAt === "number" && retryAt > now && retryAt - now <= NETWORK_RETRY_DELAY_MS) return false;
  if (lastCheckAt === null || !Number.isFinite(lastCheckAt) || lastCheckAt > now) return true;
  return now - lastCheckAt >= minIntervalMs;
}

// ---- text and urls ----

// Invisible or formatting characters that can hide or reorder text: C0/C1 controls (newline and tab are kept, CR is
// normalised later), soft hyphen, Arabic letter mark, Mongolian vowel separator, zero-width and bidi marks, line and
// paragraph separators, bidi embeddings and isolates, word joiner and invisible operators, BOM, variation selectors
// and tag characters. Written as escapes so the source itself contains no invisible characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u{0}-\u{8}\u{B}\u{C}\u{E}-\u{1F}\u{7F}-\u{9F}\u{AD}\u{61C}\u{180E}\u{200B}-\u{200F}\u{2028}\u{2029}\u{202A}-\u{202E}\u{2060}-\u{2069}\u{FEFF}\u{FE00}-\u{FE0F}\u{E0000}-\u{E007F}]/gu;

function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}${ELLIPSIS}`;
}

/** Plain-text version of release notes: no markdown markers, links, html or control characters; capped. */
export function cleanNotes(raw: string): string {
  const lines = raw
    .slice(0, MAX_RAW_NOTES_LENGTH)
    .replace(UNSAFE_CHARS, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter(line => !/^\s*```/.test(line))
    .map(line => line
      .replace(/!?\[([^\]\n]{0,200})\]\([^)\n]{0,500}\)/g, "$1")
      .replace(/<\/?[a-zA-Z][^>\n]{0,200}>/g, "")
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/[*`]/g, "")
      .trim());
  return capText(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), MAX_NOTES_LENGTH);
}

const URL_TAIL = /^[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]*$/;
const DOT_SEGMENTS = new Set(["", "..", "%2e%2e", ".%2e", "%2e."]);

/** Only links inside the project's GitHub repository are ever shown or opened. */
export function isTrustedUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > MAX_URL_LENGTH || !url.startsWith(REPO_URL_PREFIX)) return false;
  const tail = url.slice(REPO_URL_PREFIX.length);
  if (!URL_TAIL.test(tail)) return false;
  return !tail.split(/[/?#]/).some(segment => segment !== "" && DOT_SEGMENTS.has(segment.toLowerCase()));
}

/** The release page link must stay inside the releases section (not issues, raw files, ...). */
function isReleasesPageUrl(url: string): boolean {
  if (!isTrustedUrl(url) || !url.startsWith(RELEASES_PREFIX)) return false;
  return url.length === RELEASES_PREFIX.length || /^[/?#]/.test(url.charAt(RELEASES_PREFIX.length));
}

// ---- release parsing ----

const releaseSchema = z.object({
  tag_name: z.string().max(MAX_TAG_LENGTH),
  name: z.string().catch(""),
  body: z.string().catch(""),
  html_url: z.string().catch(""),
  draft: z.boolean().catch(false),
  prerelease: z.boolean().catch(false),
  assets: z.array(z.unknown()).catch([]),
});

const assetSchema = z.object({
  name: z.string().max(MAX_ASSET_NAME_LENGTH),
  browser_download_url: z.string(),
  size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().catch(null),
});

/** The only accepted download location: this very tag's asset (no /raw/, /archive/ or older releases' files). */
function expectedApkUrl(tag: string, assetName: string): string {
  return `${REPO_URL_PREFIX}releases/download/${tag}/${encodeURIComponent(assetName)}`;
}

function pickApk(tag: string, assets: readonly unknown[]): { url: string; bytes: number | null } | null {
  for (const candidate of assets) {
    const asset = assetSchema.safeParse(candidate);
    if (!asset.success || !asset.data.name.toLowerCase().endsWith(".apk")) continue;
    const { browser_download_url: url, name, size } = asset.data;
    if (url === expectedApkUrl(tag, name) && isTrustedUrl(url)) return { url, bytes: size };
  }
  return null;
}

/** Validates the GitHub payload; nothing outside the fields below is ever read. */
export function parseRelease(json: unknown): ParseResult {
  const parsed = releaseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const raw = parsed.data;
  const version = normalizeVersion(raw.tag_name);
  if (!version) return { ok: false, reason: "invalid" };
  if (raw.draft) return { ok: false, reason: "draft" };
  if (raw.prerelease) return { ok: false, reason: "prerelease" };
  const apk = pickApk(raw.tag_name, raw.assets);
  const name = cleanNotes(raw.name).replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return {
    ok: true,
    release: {
      version,
      name: name || `Dayform ${version}`,
      notes: cleanNotes(raw.body),
      pageUrl: isReleasesPageUrl(raw.html_url) ? raw.html_url : FALLBACK_PAGE_URL,
      apkUrl: apk?.url ?? null,
      apkBytes: apk?.bytes ?? null,
    },
  };
}

// ---- network ----

const NETWORK_ERROR: FetchResult = { kind: "error", reason: "network" };
const INVALID_BODY: FetchResult = { kind: "error", reason: "invalid" };

function toResult(body: unknown): FetchResult {
  const parsed = parseRelease(body);
  if (parsed.ok) return { kind: "release", release: parsed.release };
  return parsed.reason === "invalid" ? INVALID_BODY : { kind: "none" };
}

/** Refuses oversized bodies before parsing: the text is read (not `json()`) so its length can be checked first. */
async function readBody(response: FetchResponseLike): Promise<FetchResult> {
  const declared = Number(response.headers?.get("content-length") ?? Number.NaN);
  if (declared > MAX_BODY_CHARS) return INVALID_BODY;
  try {
    const text = await response.text();
    return text.length > MAX_BODY_CHARS ? INVALID_BODY : toResult(JSON.parse(text));
  } catch {
    return INVALID_BODY;
  }
}

async function request(fetchFn: FetchLike, signal: AbortSignal): Promise<FetchResult> {
  let response: FetchResponseLike;
  try {
    response = await fetchFn(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" }, signal });
  } catch {
    return NETWORK_ERROR;
  }
  if (response.status === 404) return { kind: "none" };
  if (response.status === 403 || response.status === 429) return { kind: "error", reason: "rate-limited" };
  if (!response.ok) return NETWORK_ERROR;
  return readBody(response);
}

/** Never throws. The timer also races the request, so a fetch that ignores `signal` still times out. */
export async function fetchLatestRelease(
  fetchFn: FetchLike,
  options: { timeoutMs?: number } = {},
): Promise<FetchResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FetchResult>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(NETWORK_ERROR); }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request(fetchFn, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
