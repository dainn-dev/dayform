import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { buildManifest, normalizeBaseUrl, uuidFromSha256Hex } from "./manifest";
import {
  FAKE_BUNDLE_PATH,
  makeFakeExport,
  md5Hex,
  sha256Base64Url,
  sha256Hex,
  type FakeExport,
} from "./test-helpers";

const BASE_URL = "https://ota.example.pages.dev";
const CREATED_AT = "2026-01-02T03:04:05.000Z";
const RUNTIME = "1.0.0";

let fake: FakeExport;
afterEach(() => fake?.cleanup());

const build = (overrides: Partial<Parameters<typeof buildManifest>[0]> = {}) =>
  buildManifest({
    exportDir: fake.dir,
    baseUrl: BASE_URL,
    runtimeVersion: RUNTIME,
    createdAt: CREATED_AT,
    ...overrides,
  });

describe("normalizeBaseUrl", () => {
  test("accepts https and strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://a.example.com/")).toBe("https://a.example.com");
    expect(normalizeBaseUrl("https://a.example.com/ota//")).toBe("https://a.example.com/ota");
  });

  test("rejects http, garbage, credentials, query and hash", () => {
    expect(() => normalizeBaseUrl("http://a.example.com")).toThrow("https");
    expect(() => normalizeBaseUrl("ftp://a.example.com")).toThrow("https");
    expect(() => normalizeBaseUrl("not a url")).toThrow("valid");
    expect(() => normalizeBaseUrl("")).toThrow("valid");
    expect(() => normalizeBaseUrl("https://u:p@a.example.com")).toThrow("credentials");
    expect(() => normalizeBaseUrl("https://a.example.com/?x=1")).toThrow("query");
    expect(() => normalizeBaseUrl("https://a.example.com/#x")).toThrow("query");
  });
});

describe("uuidFromSha256Hex", () => {
  test("formats the first 32 hex chars as 8-4-4-4-12", () => {
    expect(uuidFromSha256Hex("0123456789abcdef0123456789abcdef0123456789abcdef")).toBe(
      "01234567-89ab-cdef-0123-456789abcdef",
    );
  });
});

describe("buildManifest", () => {
  test("produces the Expo Updates v1 manifest shape", () => {
    fake = makeFakeExport();
    const { manifest } = build();
    expect(Object.keys(manifest)).toEqual([
      "id",
      "createdAt",
      "runtimeVersion",
      "launchAsset",
      "assets",
      "metadata",
      "extra",
    ]);
    expect(manifest.createdAt).toBe(CREATED_AT);
    expect(manifest.runtimeVersion).toBe(RUNTIME);
    expect(manifest.metadata).toEqual({});
    expect(manifest.extra).toEqual({});
    expect(manifest.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("derives the id from the sha256 of metadata.json", () => {
    fake = makeFakeExport();
    const metadataBytes = Buffer.from(
      readFileSync(join(fake.dir, "metadata.json")),
    );
    const expected = uuidFromSha256Hex(createHash("sha256").update(metadataBytes).digest("hex"));
    expect(build().manifest.id).toBe(expected);
  });

  test("describes the launch asset like the reference server", () => {
    fake = makeFakeExport();
    const { manifest } = build();
    const name = `${sha256Hex(fake.bundleBytes)}.bundle`;
    expect(manifest.launchAsset).toEqual({
      hash: sha256Base64Url(fake.bundleBytes),
      key: md5Hex(fake.bundleBytes),
      fileExtension: ".bundle",
      contentType: "application/javascript",
      url: `${BASE_URL}/assets/${name}`,
    });
  });

  test("describes other assets with hash, md5 key, dotted extension and mime type", () => {
    fake = makeFakeExport();
    const { manifest } = build();
    expect(manifest.assets).toHaveLength(2);
    const [png, ttf] = manifest.assets;
    expect(png).toEqual({
      hash: sha256Base64Url(fake.pngBytes),
      key: md5Hex(fake.pngBytes),
      fileExtension: ".png",
      contentType: "image/png",
      url: `${BASE_URL}/assets/${sha256Hex(fake.pngBytes)}.png`,
    });
    expect(ttf.fileExtension).toBe(".ttf");
    expect(ttf.contentType).toBe("font/ttf");
    expect(ttf.key).toBe(md5Hex(fake.ttfBytes));
  });

  test("lists the files to publish (launch asset first), resolving Windows separators", () => {
    fake = makeFakeExport();
    const { assets } = build();
    expect(assets.map((a) => a.publishedName)).toEqual([
      `${sha256Hex(fake.bundleBytes)}.bundle`,
      `${sha256Hex(fake.pngBytes)}.png`,
      `${sha256Hex(fake.ttfBytes)}.ttf`,
    ]);
    expect(assets[0].sourcePath).toBe(join(fake.dir, FAKE_BUNDLE_PATH));
    expect(assets[1].sourcePath).toBe(join(fake.dir, fake.pngPath));
    expect(assets.map((a) => a.bytes)).toEqual([
      fake.bundleBytes.length,
      fake.pngBytes.length,
      fake.ttfBytes.length,
    ]);
  });

  test("manifestJson is exactly JSON.stringify(manifest) with no trailing newline", () => {
    fake = makeFakeExport();
    const { manifest, manifestJson } = build();
    expect(manifestJson).toBe(JSON.stringify(manifest));
    expect(manifestJson.endsWith("\n")).toBe(false);
  });

  test("is deterministic for identical inputs", () => {
    fake = makeFakeExport();
    expect(build().manifestJson).toBe(build().manifestJson);
  });

  test("createdAt does not change the id; changed content does", () => {
    fake = makeFakeExport();
    const a = build();
    const b = build({ createdAt: "2027-01-01T00:00:00.000Z" });
    expect(a.manifest.id).toBe(b.manifest.id);
    writeFileSync(join(fake.dir, FAKE_BUNDLE_PATH), "different bundle");
    writeFileSync(
      join(fake.dir, "metadata.json"),
      JSON.stringify({
        version: 0,
        bundler: "metro",
        fileMetadata: { android: { bundle: "_expo/static/js/android/entry-abc123.hbc", assets: [] } },
      }),
    );
    expect(build().manifest.id).not.toBe(a.manifest.id);
  });

  test("includes the expo config under extra.expoClient when provided", () => {
    fake = makeFakeExport();
    const { manifest } = build({ expoConfig: { name: "Dayform", slug: "dayform" } });
    expect(manifest.extra).toEqual({ expoClient: { name: "Dayform", slug: "dayform" } });
  });

  test("deduplicates assets that share a file", () => {
    const pngPath = "assets/dup";
    fake = makeFakeExport({
      metadata: {
        version: 0,
        bundler: "metro",
        fileMetadata: {
          android: {
            bundle: FAKE_BUNDLE_PATH,
            assets: [
              { path: pngPath, ext: "png" },
              { path: pngPath, ext: "png" },
            ],
          },
        },
      },
    });
    writeFileSync(join(fake.dir, pngPath), fake.pngBytes);
    const { manifest, assets } = build();
    expect(manifest.assets).toHaveLength(1);
    expect(assets).toHaveLength(2);
  });

  test("falls back to application/octet-stream for unknown extensions", () => {
    fake = makeFakeExport({
      metadata: {
        version: 0,
        bundler: "metro",
        fileMetadata: {
          android: { bundle: FAKE_BUNDLE_PATH, assets: [{ path: "assets/blob", ext: "zzz" }] },
        },
      },
    });
    writeFileSync(join(fake.dir, "assets", "blob"), "x");
    expect(build().manifest.assets[0].contentType).toBe("application/octet-stream");
  });

  test("supports assets without an extension", () => {
    fake = makeFakeExport({
      metadata: {
        version: 0,
        bundler: "metro",
        fileMetadata: {
          android: { bundle: FAKE_BUNDLE_PATH, assets: [{ path: "assets/noext", ext: "" }] },
        },
      },
    });
    writeFileSync(join(fake.dir, "assets", "noext"), "x");
    const asset = build().manifest.assets[0];
    expect(asset.fileExtension).toBe("");
    expect(asset.url).toMatch(/\/assets\/[0-9a-f]{64}$/);
  });

  describe("input validation", () => {
    test("rejects an empty or blank runtime version", () => {
      fake = makeFakeExport();
      expect(() => build({ runtimeVersion: "" })).toThrow("runtime version");
      expect(() => build({ runtimeVersion: "   " })).toThrow("runtime version");
    });

    test("rejects an http base URL", () => {
      fake = makeFakeExport();
      expect(() => build({ baseUrl: "http://ota.example.com" })).toThrow("https");
    });

    test("rejects a createdAt that is not a canonical ISO string", () => {
      fake = makeFakeExport();
      expect(() => build({ createdAt: "yesterday" })).toThrow("createdAt");
      expect(() => build({ createdAt: "2026-01-02" })).toThrow("createdAt");
    });

    test("rejects a missing export dir or metadata.json", () => {
      fake = makeFakeExport();
      expect(() => build({ exportDir: join(fake.dir, "nope") })).toThrow("metadata.json");
    });

    test("rejects metadata that is not JSON or lacks android", () => {
      fake = makeFakeExport();
      writeFileSync(join(fake.dir, "metadata.json"), "{nope");
      expect(() => build()).toThrow("metadata.json");
      writeFileSync(join(fake.dir, "metadata.json"), JSON.stringify({ fileMetadata: {} }));
      expect(() => build()).toThrow("android");
      writeFileSync(join(fake.dir, "metadata.json"), "null");
      expect(() => build()).toThrow("android");
    });

    test("rejects malformed bundle and asset entries", () => {
      fake = makeFakeExport();
      const write = (android: unknown) =>
        writeFileSync(
          join(fake.dir, "metadata.json"),
          JSON.stringify({ fileMetadata: { android } }),
        );
      write({ assets: [] });
      expect(() => build()).toThrow("bundle");
      write({ bundle: FAKE_BUNDLE_PATH });
      expect(() => build()).toThrow("assets");
      write({ bundle: FAKE_BUNDLE_PATH, assets: ["x"] });
      expect(() => build()).toThrow("asset");
      write({ bundle: FAKE_BUNDLE_PATH, assets: [{ path: 1, ext: "png" }] });
      expect(() => build()).toThrow("asset");
      write({ bundle: FAKE_BUNDLE_PATH, assets: [{ path: "assets/x", ext: "p/ng" }] });
      expect(() => build()).toThrow("extension");
      write({ bundle: FAKE_BUNDLE_PATH, assets: [{ path: "assets/x", ext: 5 }] });
      expect(() => build()).toThrow("extension");
    });

    test("rejects paths that escape the export directory", () => {
      fake = makeFakeExport();
      const write = (path: string) =>
        writeFileSync(
          join(fake.dir, "metadata.json"),
          JSON.stringify({
            fileMetadata: { android: { bundle: FAKE_BUNDLE_PATH, assets: [{ path, ext: "png" }] } },
          }),
        );
      for (const path of ["../outside", "assets\\..\\..\\outside", "/etc/passwd", "C:\\x", ""]) {
        write(path);
        expect(() => build()).toThrow("export directory");
      }
    });

    test("rejects a listed file that does not exist", () => {
      fake = makeFakeExport();
      rmSync(join(fake.dir, fake.pngPath));
      expect(() => build()).toThrow("Cannot read");
    });
  });
});
