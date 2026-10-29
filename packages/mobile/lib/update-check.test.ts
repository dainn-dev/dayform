import { describe, test, expect } from "bun:test";
import {
  FALLBACK_PAGE_URL,
  MAX_NOTES_LENGTH,
  MAX_BODY_CHARS,
  AUTO_CHECK_INTERVAL_MS,
  NETWORK_RETRY_DELAY_MS,
  compareVersions,
  cleanNotes,
  fetchLatestRelease,
  isNewer,
  normalizeVersion,
  parseRelease,
  shouldAutoCheck,
  shouldPrompt,
  type FetchLike,
  type ParseResult,
  type Release,
} from "./update-check";

const REPO = "https://github.com/dainn-dev/dayform/";

function rawRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: "v1.0.7",
    name: "Dayform 1.0.7",
    body: "## What is new\n- Faster **startup**",
    html_url: `${REPO}releases/tag/v1.0.7`,
    draft: false,
    prerelease: false,
    assets: [
      { name: "notes.txt", browser_download_url: `${REPO}releases/download/v1.0.7/notes.txt`, size: 5 },
      { name: "Dayform-1.0.7.APK", browser_download_url: `${REPO}releases/download/v1.0.7/Dayform-1.0.7.APK`, size: 1234 },
      { name: "other.apk", browser_download_url: `${REPO}releases/download/v1.0.7/other.apk`, size: 9 },
    ],
    ...overrides,
  };
}

function release(overrides: Partial<Release> = {}): Release {
  return { version: "1.0.7", name: "n", notes: "", pageUrl: FALLBACK_PAGE_URL, apkUrl: null, apkBytes: null, ...overrides };
}

/** Narrowing helper: fails the test loudly instead of silently skipping assertions. */
function expectRelease(parsed: ParseResult): Release {
  if (!parsed.ok) throw new Error(`expected a release, got ${parsed.reason}`);
  return parsed.release;
}

const apkAsset = (url: string, name = "Dayform-1.0.7.APK") => ({ name, browser_download_url: url, size: 1 });

describe("normalizeVersion", () => {
  test("strips one leading v and returns the text", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
    expect(normalizeVersion("V1")).toBe("1");
    expect(normalizeVersion("1.0")).toBe("1.0");
  });
  test("is null for anything that is not a dotted numeric version", () => {
    expect(normalizeVersion("vv1")).toBeNull();
    expect(normalizeVersion("1.0-beta")).toBeNull();
    expect(normalizeVersion(7)).toBeNull();
    expect(normalizeVersion(undefined)).toBeNull();
  });
});

describe("compareVersions", () => {
  test("orders numerically, not lexically", () => {
    expect(compareVersions("v1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.9", "v1.0.10")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });
  test("treats missing parts as zero and ignores the v prefix", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("V1", "1.0.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.0.1", "1.0")).toBe(1);
  });
  test.each(["", "v", "1.", ".1", "1..2", "1.a", "1.0.0-beta", "abc", " 1.0", "1.0 ", "1.-1", "1.2.3.4.5.6.7", "99999999999.0"])(
    "returns invalid for %p", value => {
      expect(compareVersions(value, "1.0.0")).toBe("invalid");
      expect(compareVersions("1.0.0", value)).toBe("invalid");
    });
  test("returns invalid for non-string input", () => {
    expect(compareVersions(undefined as unknown as string, "1.0.0")).toBe("invalid");
  });
});

describe("cleanNotes", () => {
  test("strips markdown markers, links and html", () => {
    const out = cleanNotes("## Title\n**bold** and `code` and [link](https://x.y/z) ![img](a.png)\n<b>tag</b>\n```\nblock\n```");
    expect(out).toBe("Title\nbold and code and link img\ntag\nblock");
  });
  test("collapses blank lines and trims", () => {
    expect(cleanNotes("\n\n a \r\n\r\n\r\n\r\n b  \n\n")).toBe("a\n\nb");
  });
  test("drops control and bidi characters", () => {
    expect(cleanNotes("a\u0000b‮c​d")).toBe("abcd");
  });
  test.each([
    ["C0 controls", "\u0000\u0001\u0008\u000B\u000C\u000E\u001F"],
    ["DEL and C1 controls", "\u007F\u0080\u0085\u009F"],
    ["soft hyphen", "­"],
    ["Arabic letter mark", "؜"],
    ["Mongolian vowel separator", "᠎"],
    ["zero-width and directional marks", "​‌‍‎‏"],
    ["line and paragraph separators", "  "],
    ["bidi embeddings and overrides", "‪‫‬‭‮"],
    ["word joiner, invisible operators and bidi isolates", "⁠⁡⁢⁣⁤⁦⁧⁨⁩"],
    ["byte order mark", "﻿"],
    ["variation selectors", "︀︇️"],
    ["tag characters", "\u{E0000}\u{E0041}\u{E007F}"],
  ])("strips %s", (_label, invisible) => {
    expect(invisible.length).toBeGreaterThan(0);
    expect(cleanNotes(`a${invisible}b`)).toBe("ab");
  });
  test("keeps tabs, ordinary text, emoji and Vietnamese", () => {
    expect(cleanNotes("Chào bạn 👋\nline\ttab")).toBe("Chào bạn 👋\nline\ttab");
  });
  test("caps the length with an ellipsis", () => {
    const out = cleanNotes("word ".repeat(1000));
    expect(out.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
    expect(out.endsWith("…")).toBe(true);
    expect(cleanNotes("x".repeat(MAX_NOTES_LENGTH))).toBe("x".repeat(MAX_NOTES_LENGTH));
  });
  test("handles huge input without hanging", () => {
    expect(cleanNotes("[".repeat(500_000)).length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
  });
});

describe("parseRelease", () => {
  test("maps a valid release", () => {
    const parsed = parseRelease(rawRelease());
    expect(parsed).toEqual({
      ok: true,
      release: {
        version: "1.0.7",
        name: "Dayform 1.0.7",
        notes: "What is new\n- Faster startup",
        pageUrl: `${REPO}releases/tag/v1.0.7`,
        apkUrl: `${REPO}releases/download/v1.0.7/Dayform-1.0.7.APK`,
        apkBytes: 1234,
      },
    });
  });
  test("rejects drafts, prereleases and non-objects", () => {
    expect(parseRelease(rawRelease({ draft: true }))).toEqual({ ok: false, reason: "draft" });
    expect(parseRelease(rawRelease({ prerelease: true }))).toEqual({ ok: false, reason: "prerelease" });
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(parseRelease(bad)).toEqual({ ok: false, reason: "invalid" });
  });
  test("rejects a tag that is not a version", () => {
    expect(parseRelease(rawRelease({ tag_name: "nightly" }))).toEqual({ ok: false, reason: "invalid" });
    expect(parseRelease(rawRelease({ tag_name: 7 }))).toEqual({ ok: false, reason: "invalid" });
  });
  test("falls back for missing name, body, size and assets", () => {
    const parsed = parseRelease({ tag_name: "1.2" });
    expect(parsed).toEqual({
      ok: true,
      release: { version: "1.2", name: "Dayform 1.2", notes: "", pageUrl: FALLBACK_PAGE_URL, apkUrl: null, apkBytes: null },
    });
  });
  test("ignores wrongly typed optional fields", () => {
    const parsed = parseRelease(rawRelease({ name: 5, body: { x: 1 }, html_url: 3, assets: "nope", draft: "yes" }));
    expect(expectRelease(parsed)).toMatchObject({ name: "Dayform 1.0.7", notes: "", pageUrl: FALLBACK_PAGE_URL, apkUrl: null });
  });
  test("drops links outside the repository", () => {
    const evil = [
      "http://github.com/dainn-dev/dayform/releases/x",
      "https://github.com.evil.com/dainn-dev/dayform/x",
      "https://github.com/dainn-dev/dayform-evil/x",
      "https://github.com/dainn-dev/dayform/../../evil/x",
      "https://github.com/dainn-dev/dayform/a b",
      "https://github.com/dainn-dev/dayform/\\evil",
      "https://evil.com/https://github.com/dainn-dev/dayform/x",
      "javascript:alert(1)",
      `${REPO}${"a".repeat(600)}`,
      "",
    ];
    for (const url of evil) {
      const parsed = expectRelease(parseRelease(rawRelease({ html_url: url, assets: [apkAsset(url, "a.apk")] })));
      expect(parsed.pageUrl).toBe(FALLBACK_PAGE_URL);
      expect(parsed.apkUrl).toBeNull();
    }
  });
  test.each([
    ["a raw file", `${REPO}raw/main/Dayform-1.0.7.APK`],
    ["a source archive", `${REPO}archive/refs/tags/v1.0.7.apk`],
    ["an older release's asset (downgrade bait)", `${REPO}releases/download/v1.0.6/Dayform-1.0.7.APK`],
    ["a differently cased tag", `${REPO}releases/download/V1.0.7/Dayform-1.0.7.APK`],
    ["a differently cased path", `${REPO}Releases/download/v1.0.7/Dayform-1.0.7.APK`],
    ["a differently cased file name", `${REPO}releases/download/v1.0.7/dayform-1.0.7.APK`],
    ["a query string", `${REPO}releases/download/v1.0.7/Dayform-1.0.7.APK?x=1`],
    ["a fragment", `${REPO}releases/download/v1.0.7/Dayform-1.0.7.APK#frag`],
    ["an extra path segment", `${REPO}releases/download/v1.0.7/sub/Dayform-1.0.7.APK`],
    ["a percent-encoded dot trick", `${REPO}releases/download/v1.0.7/%2e%2e/Dayform-1.0.7.APK`],
  ])("the apk url is rejected for %s", (_label, url) => {
    expect(expectRelease(parseRelease(rawRelease({ assets: [apkAsset(url)] }))).apkUrl).toBeNull();
  });
  test("the apk url may only be this tag's download of this asset, percent-encoded", () => {
    const encoded = parseRelease(rawRelease({
      assets: [apkAsset(`${REPO}releases/download/v1.0.7/Day%20form%20(1).apk`, "Day form (1).apk")],
    }));
    expect(expectRelease(encoded).apkUrl).toBe(`${REPO}releases/download/v1.0.7/Day%20form%20(1).apk`);
    const bareTag = parseRelease(rawRelease({ tag_name: "1.0.7", assets: [apkAsset(`${REPO}releases/download/1.0.7/a.apk`, "a.apk")] }));
    expect(expectRelease(bareTag).apkUrl).toBe(`${REPO}releases/download/1.0.7/a.apk`);
    const otherTagForm = parseRelease(rawRelease({ tag_name: "1.0.7", assets: [apkAsset(`${REPO}releases/download/v1.0.7/a.apk`, "a.apk")] }));
    expect(expectRelease(otherTagForm).apkUrl).toBeNull();
  });
  test("the page url must be inside the releases section", () => {
    const accepted = [`${REPO}releases`, `${REPO}releases/tag/v1.0.7`, `${REPO}releases/latest?x=1`];
    for (const url of accepted) expect(expectRelease(parseRelease(rawRelease({ html_url: url }))).pageUrl).toBe(url);
    const rejected = [`${REPO}issues/1`, `${REPO}raw/main/a.apk`, `${REPO}releases-evil/x`, `${REPO}releasesX`, `${REPO}Releases/tag/v1`, REPO];
    for (const url of rejected) expect(expectRelease(parseRelease(rawRelease({ html_url: url }))).pageUrl).toBe(FALLBACK_PAGE_URL);
  });
  test("skips an untrusted apk and takes the next trusted one", () => {
    const parsed = parseRelease(rawRelease({
      assets: [
        apkAsset("https://evil.com/a.apk", "a.apk"),
        apkAsset(`${REPO}releases/download/v1.0.7/b.apk`, "b.apk"),
      ],
    }));
    expect(expectRelease(parsed).apkUrl).toBe(`${REPO}releases/download/v1.0.7/b.apk`);
  });
  test("ignores malformed assets and bad sizes", () => {
    const parsed = parseRelease(rawRelease({
      assets: [null, 4, { name: 3 }, { name: "a.apk" }, { name: "b.apk", browser_download_url: `${REPO}releases/download/v1.0.7/b.apk`, size: -5 }],
    }));
    expect(expectRelease(parsed).apkUrl).toBe(`${REPO}releases/download/v1.0.7/b.apk`);
    expect(expectRelease(parsed).apkBytes).toBeNull();
  });
  test("cleans and caps name and notes", () => {
    const parsed = parseRelease(rawRelease({ name: "**" + "N".repeat(500), body: "x".repeat(5000) }));
    expect(expectRelease(parsed).name.length).toBeLessThanOrEqual(80);
    expect(expectRelease(parsed).notes.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
  });
  test("uses the default name when the cleaned name is empty", () => {
    expect(expectRelease(parseRelease(rawRelease({ name: "***" }))).name).toBe("Dayform 1.0.7");
  });
});

type ResponseOptions = { failText?: boolean; rawText?: string; contentLength?: string | null };

function response(status: number, body: unknown, options: ResponseOptions = {}) {
  const headers = { get: (name: string) => (name.toLowerCase() === "content-length" ? options.contentLength ?? null : null) };
  const text = async () => {
    if (options.failText) throw new TypeError("stream failed");
    return options.rawText ?? JSON.stringify(body);
  };
  return { status, ok: status >= 200 && status < 300, headers, text };
}

describe("fetchLatestRelease", () => {
  test("requests the releases endpoint with the GitHub accept header", async () => {
    const calls: Array<{ url: string; accept: string | undefined; hasSignal: boolean }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, accept: init.headers.Accept, hasSignal: init.signal instanceof AbortSignal });
      return response(200, rawRelease());
    };
    const result = await fetchLatestRelease(fetchFn);
    expect(calls).toEqual([{ url: "https://api.github.com/repos/dainn-dev/dayform/releases/latest", accept: "application/vnd.github+json", hasSignal: true }]);
    expect(result.kind).toBe("release");
  });
  test("404 means no release yet", async () => {
    expect(await fetchLatestRelease(async () => response(404, {}))).toEqual({ kind: "none" });
  });
  test("a draft or prerelease counts as no release", async () => {
    expect(await fetchLatestRelease(async () => response(200, rawRelease({ draft: true })))).toEqual({ kind: "none" });
    expect(await fetchLatestRelease(async () => response(200, rawRelease({ prerelease: true })))).toEqual({ kind: "none" });
  });
  test("403 and 429 are rate limits", async () => {
    expect(await fetchLatestRelease(async () => response(403, {}))).toEqual({ kind: "error", reason: "rate-limited" });
    expect(await fetchLatestRelease(async () => response(429, {}))).toEqual({ kind: "error", reason: "rate-limited" });
  });
  test("other http failures, including 5xx, are network errors", async () => {
    expect(await fetchLatestRelease(async () => response(500, {}))).toEqual({ kind: "error", reason: "network" });
    expect(await fetchLatestRelease(async () => response(503, {}))).toEqual({ kind: "error", reason: "network" });
  });
  test("a rejected fetch is a network error", async () => {
    expect(await fetchLatestRelease(async () => { throw new TypeError("Network request failed"); })).toEqual({ kind: "error", reason: "network" });
  });
  test("a synchronous throw is a network error", async () => {
    const fetchFn: FetchLike = () => { throw new Error("boom"); };
    expect(await fetchLatestRelease(fetchFn)).toEqual({ kind: "error", reason: "network" });
  });
  test("unparseable, unreadable or malformed bodies are invalid", async () => {
    expect(await fetchLatestRelease(async () => response(200, null, { rawText: "{not json" }))).toEqual({ kind: "error", reason: "invalid" });
    expect(await fetchLatestRelease(async () => response(200, null, { failText: true }))).toEqual({ kind: "error", reason: "invalid" });
    expect(await fetchLatestRelease(async () => response(200, { tag_name: "x" }))).toEqual({ kind: "error", reason: "invalid" });
  });
  test("a body larger than the cap is invalid, whether declared by content-length or measured", async () => {
    expect(MAX_BODY_CHARS).toBe(200_000);
    const declared = response(200, rawRelease(), { contentLength: String(MAX_BODY_CHARS + 1) });
    expect(await fetchLatestRelease(async () => declared)).toEqual({ kind: "error", reason: "invalid" });
    const big = JSON.stringify(rawRelease({ body: "x".repeat(MAX_BODY_CHARS) }));
    expect(big.length).toBeGreaterThan(MAX_BODY_CHARS);
    expect(await fetchLatestRelease(async () => response(200, null, { rawText: big }))).toEqual({ kind: "error", reason: "invalid" });
  });
  test("the text is not even read when content-length already exceeds the cap", async () => {
    let read = false;
    const huge = { status: 200, ok: true, headers: { get: () => String(MAX_BODY_CHARS + 1) }, text: async () => { read = true; return "{}"; } };
    await fetchLatestRelease(async () => huge);
    expect(read).toBe(false);
  });
  test("a body exactly at the cap and a missing or junk content-length are accepted", async () => {
    const padded = JSON.stringify(rawRelease()) + " ".repeat(MAX_BODY_CHARS);
    const atCap = padded.slice(0, MAX_BODY_CHARS);
    expect(atCap.length).toBe(MAX_BODY_CHARS);
    const exact = await fetchLatestRelease(async () => response(200, null, { rawText: atCap, contentLength: String(MAX_BODY_CHARS) }));
    expect(exact.kind).toBe("release");
    expect((await fetchLatestRelease(async () => response(200, rawRelease(), { contentLength: "abc" }))).kind).toBe("release");
    const noHeaders = { status: 200, ok: true, text: async () => JSON.stringify(rawRelease()) };
    expect((await fetchLatestRelease(async () => noHeaders)).kind).toBe("release");
  });
  test("times out even when fetch ignores the abort signal, and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const fetchFn: FetchLike = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
    const result = await fetchLatestRelease(fetchFn, { timeoutMs: 10 });
    expect(result).toEqual({ kind: "error", reason: "network" });
    expect(signal?.aborted).toBe(true);
  });
  test("clears the timer after success", async () => {
    let signal: AbortSignal | undefined;
    await fetchLatestRelease(async (_u, init) => { signal = init.signal; return response(404, {}); }, { timeoutMs: 20 });
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(signal?.aborted).toBe(false);
  });
});

describe("isNewer / shouldPrompt", () => {
  test("isNewer compares against the installed version", () => {
    expect(isNewer("1.0.6", release({ version: "1.0.7" }))).toBe(true);
    expect(isNewer("1.0.7", release({ version: "1.0.7" }))).toBe(false);
    expect(isNewer("1.0.8", release({ version: "1.0.7" }))).toBe(false);
    expect(isNewer("garbage", release({ version: "1.0.7" }))).toBe(false);
  });
  test("a skipped version is not prompted but a newer one is", () => {
    expect(shouldPrompt({ current: "1.0.6", release: release(), skipped: null })).toBe(true);
    expect(shouldPrompt({ current: "1.0.6", release: release(), skipped: "1.0.7" })).toBe(false);
    expect(shouldPrompt({ current: "1.0.6", release: release({ version: "1.0.8" }), skipped: "1.0.7" })).toBe(true);
    expect(shouldPrompt({ current: "1.0.7", release: release(), skipped: null })).toBe(false);
  });
});

describe("shouldAutoCheck", () => {
  const now = 1_000_000_000_000;
  test("is off when the switch is off", () => {
    expect(shouldAutoCheck({ auto: false, lastCheckAt: null, now })).toBe(false);
  });
  test("runs when never checked", () => {
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, now })).toBe(true);
  });
  test("waits 12 hours by default", () => {
    expect(shouldAutoCheck({ auto: true, lastCheckAt: now - AUTO_CHECK_INTERVAL_MS + 1, now })).toBe(false);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: now - AUTO_CHECK_INTERVAL_MS, now })).toBe(true);
    expect(AUTO_CHECK_INTERVAL_MS).toBe(12 * 60 * 60 * 1000);
  });
  test("honours a custom interval", () => {
    expect(shouldAutoCheck({ auto: true, lastCheckAt: now - 5, now, minIntervalMs: 10 })).toBe(false);
  });
  test("waits for retryAt after a network error, then runs again", () => {
    expect(NETWORK_RETRY_DELAY_MS).toBe(15 * 60 * 1000);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: now + 1, now })).toBe(false);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: now, now })).toBe(true);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: now - 1, now })).toBe(true);
  });
  test("retryAt does not override the switch or the normal interval", () => {
    expect(shouldAutoCheck({ auto: false, lastCheckAt: null, retryAt: now - 1, now })).toBe(false);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: now - 5, retryAt: now - 1, now })).toBe(false);
  });
  test("a null, NaN or implausibly distant retryAt is ignored (clock moved back)", () => {
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: null, now })).toBe(true);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: Number.NaN, now })).toBe(true);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: now + NETWORK_RETRY_DELAY_MS + 1, now })).toBe(true);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: null, retryAt: now + NETWORK_RETRY_DELAY_MS, now })).toBe(false);
  });
  test("a last check in the future (clock change) is due again", () => {
    expect(shouldAutoCheck({ auto: true, lastCheckAt: now + 1, now })).toBe(true);
    expect(shouldAutoCheck({ auto: true, lastCheckAt: Number.NaN, now })).toBe(true);
  });
});
