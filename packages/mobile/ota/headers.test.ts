import { describe, expect, test } from "bun:test";
import {
  ASSETS_CACHE_CONTROL,
  MAX_HEADER_LINE_LENGTH,
  MAX_HEADER_RULES,
  buildHeadersFile,
  parseHeadersFile,
  validateHeadersFile,
} from "./headers";

const SIGNATURE = 'sig="QUJDREVGRw==", keyid="main"';
const MANIFEST_PATH = "/android/manifest.json";

const build = (extra: Partial<Parameters<typeof buildHeadersFile>[0]> = {}) =>
  buildHeadersFile({ manifestPath: MANIFEST_PATH, signatureHeader: SIGNATURE, ...extra });

describe("buildHeadersFile", () => {
  test("emits the manifest rule and the immutable assets rule", () => {
    const text = build();
    expect(text).toContain(`\n${MANIFEST_PATH}\n`);
    expect(text).toContain("  expo-protocol-version: 1\n");
    expect(text).toContain("  expo-sfv-version: 0\n");
    expect(text).toContain("  cache-control: private, max-age=0\n");
    expect(text).toContain(`  expo-signature: ${SIGNATURE}\n`);
    expect(text).toContain("/assets/*\n  cache-control: public, max-age=31536000, immutable\n");
    expect(text.endsWith("\n")).toBe(true);
  });

  test("omits optional headers unless asked for them", () => {
    const text = build();
    expect(text).not.toContain("expo-manifest-filters");
    expect(text).not.toContain("expo-server-defined-headers");
    expect(text).not.toContain("content-type");
  });

  test("emits optional headers when provided", () => {
    const text = build({
      manifestFilters: 'channel="main"',
      serverDefinedHeaders: 'x-a="b"',
      contentType: "application/expo+json",
    });
    expect(text).toContain('  expo-manifest-filters: channel="main"\n');
    expect(text).toContain('  expo-server-defined-headers: x-a="b"\n');
    expect(text).toContain("  content-type: application/expo+json\n");
  });

  test("honours a custom assets path", () => {
    expect(build({ assetsPath: "/files/*" })).toContain("/files/*\n  cache-control: public");
  });

  test("round-trips through parse and validate with no problems", () => {
    expect(validateHeadersFile(build(), MANIFEST_PATH).problems).toEqual([]);
  });

  test("rejects unsafe paths and values", () => {
    expect(() => build({ manifestPath: "android/manifest.json" })).toThrow("path");
    expect(() => build({ manifestPath: "/a b" })).toThrow("path");
    expect(() => build({ manifestPath: "/a/*" })).toThrow("path");
    expect(() => build({ manifestPath: "/a/:x" })).toThrow("path");
    expect(() => build({ assetsPath: "assets/*" })).toThrow("path");
    expect(() => build({ signatureHeader: "sig=\"a\"\nx-evil: 1" })).toThrow("expo-signature");
    expect(() => build({ signatureHeader: "" })).toThrow("expo-signature");
    expect(() => build({ contentType: "a\r\nb" })).toThrow("content-type");
  });

  test("rejects a line longer than the Cloudflare limit", () => {
    const longSig = `sig="${"A".repeat(MAX_HEADER_LINE_LENGTH)}", keyid="main"`;
    expect(() => build({ signatureHeader: longSig })).toThrow(String(MAX_HEADER_LINE_LENGTH));
  });
});

describe("parseHeadersFile", () => {
  test("parses paths, headers, comments and blank lines", () => {
    const parsed = parseHeadersFile(
      ["# comment", "", "/a", "  x-one: 1", "  X-Two:  two, three ", "/b/*", "\tcache-control: z"].join(
        "\r\n",
      ),
    );
    expect(parsed).toEqual([
      {
        path: "/a",
        headers: [
          { name: "x-one", value: "1" },
          { name: "x-two", value: "two, three" },
        ],
      },
      { path: "/b/*", headers: [{ name: "cache-control", value: "z" }] },
    ]);
  });

  test("ignores header lines that appear before any path and lines without a colon", () => {
    expect(parseHeadersFile("  orphan: 1\n/a\n  nocolon\n")).toEqual([{ path: "/a", headers: [] }]);
  });
});

describe("validateHeadersFile", () => {
  const withoutLine = (needle: string) =>
    build()
      .split("\n")
      .filter((line) => !line.includes(needle))
      .join("\n");

  test("returns the signature header found for the manifest path", () => {
    expect(validateHeadersFile(build(), MANIFEST_PATH).signatureHeader).toBe(SIGNATURE);
  });

  test("reports a missing rule for the manifest path", () => {
    const { problems, signatureHeader } = validateHeadersFile(build(), "/other/manifest.json");
    expect(problems.join("\n")).toContain("/other/manifest.json");
    expect(signatureHeader).toBeNull();
  });

  test.each([
    ["expo-protocol-version", "expo-protocol-version"],
    ["expo-sfv-version", "expo-sfv-version"],
    ["cache-control: private", "cache-control"],
    ["expo-signature", "expo-signature"],
  ])("reports a missing %s header", (needle, expected) => {
    const { problems } = validateHeadersFile(withoutLine(needle), MANIFEST_PATH);
    expect(problems.some((p) => p.includes(expected))).toBe(true);
  });

  test("reports wrong header values", () => {
    const text = build()
      .replace("expo-protocol-version: 1", "expo-protocol-version: 0")
      .replace("expo-sfv-version: 0", "expo-sfv-version: 1")
      .replace("private, max-age=0", "public, max-age=600");
    const { problems } = validateHeadersFile(text, MANIFEST_PATH);
    expect(problems).toHaveLength(3);
  });

  test("reports an immutable assets rule that is missing or weak", () => {
    const missing = validateHeadersFile(build().split("/assets/*")[0], MANIFEST_PATH);
    expect(missing.problems.join("\n")).toContain("immutable");
    const weak = validateHeadersFile(
      build().replace(ASSETS_CACHE_CONTROL, "public, max-age=60"),
      MANIFEST_PATH,
    );
    expect(weak.problems.join("\n")).toContain("immutable");
  });

  test("reports a repeated header in the manifest rule (Cloudflare would comma-join it)", () => {
    const text = build().replace(
      `  expo-signature: ${SIGNATURE}\n`,
      `  expo-signature: ${SIGNATURE}\n  expo-signature: ${SIGNATURE}\n`,
    );
    expect(validateHeadersFile(text, MANIFEST_PATH).problems.join("\n")).toContain("more than once");
  });

  test("reports empty optional headers", () => {
    const text = build().replace(
      "  expo-sfv-version: 0\n",
      "  expo-sfv-version: 0\n  expo-manifest-filters:\n",
    );
    expect(validateHeadersFile(text, MANIFEST_PATH).problems.join("\n")).toContain(
      "expo-manifest-filters",
    );
  });

  test("reports too many rules and over-long lines", () => {
    const many = Array.from({ length: MAX_HEADER_RULES + 1 }, (_, i) => `/p${i}\n  a: b`).join("\n");
    expect(validateHeadersFile(`${build()}${many}`, MANIFEST_PATH).problems.join("\n")).toContain(
      "rules",
    );
    const long = build().replace("keyid=", `x="${"A".repeat(MAX_HEADER_LINE_LENGTH)}", keyid=`);
    expect(validateHeadersFile(long, MANIFEST_PATH).problems.join("\n")).toContain("characters");
  });
});
