import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MANIFEST_PATH, buildSite, verifySite } from "./site";
import { serializeSignatureHeader, signManifest, verifySignature } from "./sign";
import {
  generateTestKeyPair,
  makeFakeExport,
  makeTempDir,
  sha256Hex,
  type FakeExport,
} from "./test-helpers";

const keys = generateTestKeyPair();
const otherKeys = generateTestKeyPair();
const BASE_URL = "https://ota.example.pages.dev";
const RUNTIME = "1.0.0";
const CREATED_AT = "2026-01-02T03:04:05.000Z";

let fake: FakeExport;
let outDir: string;
const dirs: string[] = [];

beforeEach(() => {
  fake = makeFakeExport();
  outDir = makeTempDir("dayform-ota-site-");
  dirs.push(outDir);
});
afterEach(() => fake.cleanup());
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const publish = (overrides: Partial<Parameters<typeof buildSite>[0]> = {}) =>
  buildSite({
    exportDir: fake.dir,
    outDir,
    baseUrl: BASE_URL,
    runtimeVersion: RUNTIME,
    createdAt: CREATED_AT,
    privateKeyPem: keys.privateKeyPem,
    keyId: "main",
    ...overrides,
  });

const verify = (overrides: Partial<Parameters<typeof verifySite>[0]> = {}) =>
  verifySite({
    siteDir: outDir,
    certificatePem: keys.certificatePem,
    expectedRuntimeVersion: RUNTIME,
    ...overrides,
  });

const manifestFile = () => join(outDir, "android", "manifest.json");
const readManifest = () => JSON.parse(readFileSync(manifestFile(), "utf8"));

describe("buildSite", () => {
  test("writes manifest, assets and _headers and returns a summary", () => {
    const summary = publish();
    expect(MANIFEST_PATH).toBe("/android/manifest.json");
    expect(existsSync(manifestFile())).toBe(true);
    expect(existsSync(join(outDir, "_headers"))).toBe(true);
    expect(readdirSync(join(outDir, "assets")).sort()).toEqual(
      [
        `${sha256Hex(fake.bundleBytes)}.bundle`,
        `${sha256Hex(fake.pngBytes)}.png`,
        `${sha256Hex(fake.ttfBytes)}.ttf`,
      ].sort(),
    );
    expect(summary.updateId).toBe(readManifest().id);
    expect(summary.assetCount).toBe(3);
    expect(summary.totalBytes).toBe(
      fake.bundleBytes.length + fake.pngBytes.length + fake.ttfBytes.length,
    );
    expect(summary.manifestUrl).toBe(`${BASE_URL}/android/manifest.json`);
  });

  test("writes exactly the signed bytes of the manifest (no trailing newline)", () => {
    publish();
    const onDisk = readFileSync(manifestFile());
    expect(onDisk.at(-1)).toBe("}".charCodeAt(0));
    const headers = readFileSync(join(outDir, "_headers"), "utf8");
    const signature = headers.match(/expo-signature: (.*)/)?.[1] ?? "";
    expect(signature).toContain('keyid="main"');
    expect(verifySignatureOnDisk(onDisk, signature)).toBe(true);
  });

  test("copies asset bytes unchanged", () => {
    publish();
    const copied = readFileSync(join(outDir, "assets", `${sha256Hex(fake.pngBytes)}.png`));
    expect(copied.equals(fake.pngBytes)).toBe(true);
  });

  test("replaces a previous publish but leaves unrelated files alone", () => {
    mkdirSync(join(outDir, "assets"), { recursive: true });
    writeFileSync(join(outDir, "assets", "stale.png"), "old");
    writeFileSync(join(outDir, "README.txt"), "keep me");
    publish();
    expect(existsSync(join(outDir, "assets", "stale.png"))).toBe(false);
    expect(readFileSync(join(outDir, "README.txt"), "utf8")).toBe("keep me");
  });

  test("touches nothing on disk when signing fails", () => {
    writeFileSync(join(outDir, "_headers"), "previous");
    expect(() => publish({ privateKeyPem: "garbage" })).toThrow("private key");
    expect(readFileSync(join(outDir, "_headers"), "utf8")).toBe("previous");
  });

  test("rejects an http base URL and an empty runtime version", () => {
    expect(() => publish({ baseUrl: "http://ota.example.com" })).toThrow("https");
    expect(() => publish({ runtimeVersion: "" })).toThrow("runtime version");
    expect(existsSync(manifestFile())).toBe(false);
  });
});

const verifySignatureOnDisk = (manifest: Buffer, header: string): boolean =>
  verifySignature(manifest, header, keys.certificatePem);

describe("verifySite", () => {
  test("accepts a freshly built site", () => {
    publish();
    expect(verify()).toEqual([]);
    expect(verify({ expectedKeyId: "main", expectedBaseUrl: `${BASE_URL}/` })).toEqual([]);
  });

  test("detects a single tampered manifest byte", () => {
    publish();
    const text = readFileSync(manifestFile(), "utf8");
    writeFileSync(manifestFile(), text.replace(CREATED_AT, "2026-01-02T03:04:06.000Z"));
    expect(verify().join("\n")).toContain("signature");
  });

  test("detects a trailing newline added after signing", () => {
    publish();
    writeFileSync(manifestFile(), `${readFileSync(manifestFile(), "utf8")}\n`);
    expect(verify().join("\n")).toContain("signature");
  });

  test("detects the wrong certificate", () => {
    publish();
    expect(verify({ certificatePem: otherKeys.certificatePem }).join("\n")).toContain("signature");
  });

  test("detects a manifest signed with another key under the same header shape", () => {
    publish();
    const manifest = readFileSync(manifestFile(), "utf8");
    const forged = serializeSignatureHeader(signManifest(manifest, otherKeys.privateKeyPem), "main");
    const headers = readFileSync(join(outDir, "_headers"), "utf8").replace(
      /expo-signature: .*/,
      `expo-signature: ${forged}`,
    );
    writeFileSync(join(outDir, "_headers"), headers);
    expect(verify().join("\n")).toContain("signature");
  });

  test("detects a key id mismatch", () => {
    publish();
    expect(verify({ expectedKeyId: "root" }).join("\n")).toContain("signature");
  });

  test("reports an invalid expected base URL", () => {
    publish();
    expect(verify({ expectedBaseUrl: "http://nope.example.com" }).join("\n")).toContain(
      "expected base URL",
    );
  });

  test("detects an altered asset", () => {
    publish();
    writeFileSync(join(outDir, "assets", `${sha256Hex(fake.pngBytes)}.png`), "tampered");
    expect(verify().join("\n")).toContain("hash");
  });

  test("detects a missing asset file", () => {
    publish();
    rmSync(join(outDir, "assets", `${sha256Hex(fake.ttfBytes)}.ttf`));
    expect(verify().join("\n")).toContain("missing");
  });

  test("detects a runtime version mismatch", () => {
    publish();
    expect(verify({ expectedRuntimeVersion: "2.0.0" }).join("\n")).toContain("runtimeVersion");
  });

  test("detects a missing _headers file and missing rules", () => {
    publish();
    const headersPath = join(outDir, "_headers");
    const original = readFileSync(headersPath, "utf8");
    writeFileSync(headersPath, original.replace("expo-protocol-version: 1\n", ""));
    expect(verify().join("\n")).toContain("expo-protocol-version");
    writeFileSync(headersPath, original.replace("/android/manifest.json", "/android/other.json"));
    expect(verify().join("\n")).toContain("no rule for /android/manifest.json");
    rmSync(headersPath);
    expect(verify().join("\n")).toContain("_headers");
  });

  test("detects a missing or unreadable manifest", () => {
    publish();
    writeFileSync(manifestFile(), "{nope");
    expect(verify().join("\n")).toContain("manifest.json");
    rmSync(manifestFile());
    expect(verify().join("\n")).toContain("manifest.json");
  });

  test("detects a manifest with the wrong shape", () => {
    publish();
    const bad = (value: unknown) => {
      writeFileSync(manifestFile(), JSON.stringify(value));
      return verify().join("\n");
    };
    expect(bad(null)).toContain("JSON object");
    expect(bad({ id: "nope", createdAt: "x", runtimeVersion: RUNTIME, assets: [] })).toContain(
      "launchAsset",
    );
    publish();
    const manifest = readManifest() as Record<string, unknown>;
    expect(bad({ ...manifest, id: "nope" })).toContain("id");
    expect(bad({ ...manifest, createdAt: "yesterday" })).toContain("createdAt");
    expect(bad({ ...manifest, assets: "x" })).toContain("assets");
  });

  describe("asset entries", () => {
    const withAsset = (patch: Record<string, unknown>) => {
      publish();
      const manifest = readManifest();
      manifest.assets[0] = { ...manifest.assets[0], ...patch };
      writeFileSync(manifestFile(), JSON.stringify(manifest));
      return verify().join("\n");
    };

    test("flags an http asset URL", () => {
      expect(withAsset({ url: "http://ota.example.pages.dev/assets/x.png" })).toContain("https");
    });

    test("flags a URL that does not point into /assets/", () => {
      expect(withAsset({ url: `${BASE_URL}/elsewhere/x.png` })).toContain("/assets/");
      expect(withAsset({ url: `${BASE_URL}/assets/..` })).toContain("/assets/");
      expect(withAsset({ url: "not a url" })).toContain("url");
    });

    test("flags a URL outside the expected base URL", () => {
      publish();
      expect(verify({ expectedBaseUrl: "https://other.example.com" }).join("\n")).toContain(
        "base URL",
      );
    });

    test("flags a wrong md5 key, a bad fileExtension and a missing contentType", () => {
      expect(withAsset({ key: "0".repeat(32) })).toContain("key");
      expect(withAsset({ fileExtension: "png" })).toContain("fileExtension");
      expect(withAsset({ contentType: "" })).toContain("contentType");
    });

    test("flags a non-object asset entry", () => {
      publish();
      const manifest = readManifest();
      manifest.assets[0] = 5;
      writeFileSync(manifestFile(), JSON.stringify(manifest));
      expect(verify().join("\n")).toContain("asset");
    });
  });
});
