// Builds an Expo Updates protocol v1 manifest from an `expo export` directory.
// Pure with respect to its inputs: the same export, base URL, runtime version
// and createdAt always give the same manifest string.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const LAUNCH_ASSET_EXTENSION = ".bundle";
export const LAUNCH_ASSET_CONTENT_TYPE = "application/javascript";
export const ASSETS_URL_DIR = "assets";

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EXTENSION_PATTERN = /^[A-Za-z0-9]{1,10}$/;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  xml: "application/xml",
  json: "application/json",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  txt: "text/plain",
  html: "text/html",
  js: "application/javascript",
};

export interface ManifestAsset {
  readonly hash: string;
  readonly key: string;
  readonly fileExtension: string;
  readonly contentType: string;
  readonly url: string;
}

export interface Manifest {
  readonly id: string;
  readonly createdAt: string;
  readonly runtimeVersion: string;
  readonly launchAsset: ManifestAsset;
  readonly assets: readonly ManifestAsset[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface PublishedAsset {
  readonly sourcePath: string;
  readonly publishedName: string;
  readonly bytes: number;
}

export interface BuildManifestInput {
  readonly exportDir: string;
  readonly baseUrl: string;
  readonly runtimeVersion: string;
  readonly createdAt: string;
  readonly expoConfig?: Readonly<Record<string, unknown>>;
}

export interface BuildManifestResult {
  readonly manifest: Manifest;
  /** The exact string to sign and to write to disk. Never re-serialise it. */
  readonly manifestJson: string;
  readonly assets: readonly PublishedAsset[];
}

interface AssetSource {
  readonly path: string;
  readonly ext: string;
  readonly isLaunchAsset: boolean;
}

/** Validates an https base URL and strips trailing slashes. */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The base URL is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("The base URL must use https.");
  if (url.username !== "" || url.password !== "") {
    throw new Error("The base URL must not contain credentials.");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("The base URL must not contain a query or hash.");
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/** Same UUID scheme as the Expo reference server: first 32 hex chars of a sha256. */
export function uuidFromSha256Hex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function assertCreatedAt(createdAt: string): void {
  const valid =
    ISO_PATTERN.test(createdAt) &&
    !Number.isNaN(Date.parse(createdAt)) &&
    new Date(createdAt).toISOString() === createdAt;
  if (!valid) {
    throw new Error("createdAt must be a canonical ISO 8601 string like 2026-01-02T03:04:05.000Z.");
  }
}

function readMetadata(exportDir: string): { raw: Buffer; android: Record<string, unknown> } {
  let raw: Buffer;
  let parsed: unknown;
  try {
    raw = readFileSync(join(exportDir, "metadata.json"));
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`Cannot read a valid metadata.json in ${exportDir}.`);
  }
  const android = isRecord(parsed) && isRecord(parsed.fileMetadata) ? parsed.fileMetadata.android : null;
  if (!isRecord(android)) throw new Error("metadata.json has no android file metadata.");
  return { raw, android };
}

function readAssetSources(android: Record<string, unknown>): AssetSource[] {
  if (typeof android.bundle !== "string") {
    throw new Error("metadata.json has no android bundle path.");
  }
  if (!Array.isArray(android.assets)) {
    throw new Error("metadata.json has no android assets list.");
  }
  const others = android.assets.map((entry: unknown): AssetSource => {
    if (!isRecord(entry) || typeof entry.path !== "string") {
      throw new Error("Invalid asset entry in metadata.json.");
    }
    if (typeof entry.ext !== "string" || (entry.ext !== "" && !EXTENSION_PATTERN.test(entry.ext))) {
      throw new Error(`Invalid asset extension for ${entry.path}.`);
    }
    return { path: entry.path, ext: entry.ext, isLaunchAsset: false };
  });
  return [{ path: android.bundle, ext: "", isLaunchAsset: true }, ...others];
}

// metadata.json uses the OS separator of the machine that ran the export
// (backslashes on Windows). Resolve inside the export dir, refusing escapes.
function resolveInsideExport(exportDir: string, metadataPath: string): string {
  const segments = metadataPath.split(/[\\/]+/).filter((segment) => segment !== ".");
  const unsafe =
    segments.length === 0 ||
    segments[0] === "" ||
    segments.some((segment) => segment === ".." || segment.includes(":"));
  if (unsafe) {
    throw new Error(`Asset path escapes the export directory: ${metadataPath}`);
  }
  return resolve(exportDir, ...segments);
}

const digest = (bytes: Buffer, algorithm: "sha256" | "md5") => createHash(algorithm).update(bytes);

function describeAsset(
  source: AssetSource,
  exportDir: string,
  baseUrl: string,
): { asset: ManifestAsset; published: PublishedAsset } {
  const sourcePath = resolveInsideExport(exportDir, source.path);
  let bytes: Buffer;
  try {
    bytes = readFileSync(sourcePath);
  } catch {
    throw new Error(`Cannot read asset ${source.path} listed in metadata.json.`);
  }
  const extension = source.isLaunchAsset
    ? LAUNCH_ASSET_EXTENSION
    : source.ext === ""
      ? ""
      : `.${source.ext}`;
  const publishedName = `${digest(bytes, "sha256").digest("hex")}${extension}`;
  const contentType = source.isLaunchAsset
    ? LAUNCH_ASSET_CONTENT_TYPE
    : (CONTENT_TYPES[source.ext.toLowerCase()] ?? "application/octet-stream");
  return {
    asset: {
      hash: digest(bytes, "sha256").digest("base64url"),
      key: digest(bytes, "md5").digest("hex"),
      fileExtension: extension,
      contentType,
      url: `${baseUrl}/${ASSETS_URL_DIR}/${publishedName}`,
    },
    published: { sourcePath, publishedName, bytes: bytes.length },
  };
}

export function buildManifest(input: BuildManifestInput): BuildManifestResult {
  const runtimeVersion = input.runtimeVersion.trim();
  if (runtimeVersion === "") throw new Error("The runtime version must not be empty.");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  assertCreatedAt(input.createdAt);

  const { raw, android } = readMetadata(input.exportDir);
  const described = readAssetSources(android).map((source) =>
    describeAsset(source, input.exportDir, baseUrl),
  );
  const [launch, ...rest] = described;

  const seen = new Set<string>([launch.published.publishedName]);
  const uniqueAssets = rest.filter(({ published }) => {
    if (seen.has(published.publishedName)) return false;
    seen.add(published.publishedName);
    return true;
  });

  const manifest: Manifest = {
    id: uuidFromSha256Hex(digest(raw, "sha256").digest("hex")),
    createdAt: input.createdAt,
    runtimeVersion,
    launchAsset: launch.asset,
    assets: uniqueAssets.map(({ asset }) => asset),
    metadata: {},
    extra: input.expoConfig === undefined ? {} : { expoClient: input.expoConfig },
  };

  return {
    manifest,
    manifestJson: JSON.stringify(manifest),
    assets: [launch, ...uniqueAssets].map(({ published }) => published),
  };
}
