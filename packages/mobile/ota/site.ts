// Writes the static Expo Updates site (manifest, assets, _headers) and checks a
// written site by re-reading it from disk.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ASSETS_URL_DIR, buildManifest, normalizeBaseUrl } from "./manifest";
import { buildHeadersFile, validateHeadersFile } from "./headers";
import { serializeSignatureHeader, signManifest, verifySignature } from "./sign";

export const MANIFEST_PATH = "/android/manifest.json";
const MANIFEST_FILE = join("android", "manifest.json");
const HEADERS_FILE = "_headers";
const ASSET_NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface BuildSiteInput {
  readonly exportDir: string;
  readonly outDir: string;
  readonly baseUrl: string;
  readonly runtimeVersion: string;
  readonly createdAt: string;
  readonly privateKeyPem: string;
  readonly keyId: string;
  readonly expoConfig?: Readonly<Record<string, unknown>>;
}

export interface SiteSummary {
  readonly updateId: string;
  readonly assetCount: number;
  readonly totalBytes: number;
  readonly manifestUrl: string;
}

export interface VerifySiteInput {
  readonly siteDir: string;
  /** X.509 certificate or RSA public key PEM. */
  readonly certificatePem: string;
  readonly expectedRuntimeVersion: string;
  readonly expectedKeyId?: string;
  readonly expectedBaseUrl?: string;
}

/**
 * Generates the site. Everything that can fail (manifest, signing, header
 * validation) happens before the first write, so a failure leaves outDir as it
 * was. Only `android/`, `assets/` and `_headers` inside outDir are replaced.
 */
export function buildSite(input: BuildSiteInput): SiteSummary {
  const { manifest, manifestJson, assets } = buildManifest(input);
  const signature = signManifest(manifestJson, input.privateKeyPem);
  const headersText = buildHeadersFile({
    manifestPath: MANIFEST_PATH,
    signatureHeader: serializeSignatureHeader(signature, input.keyId),
  });

  // Absolute and created first: on Windows rmSync throws EINVAL for a relative path under a missing parent.
  const outDir = resolve(input.outDir);
  mkdirSync(outDir, { recursive: true });
  rmSync(join(outDir, "android"), { recursive: true, force: true });
  rmSync(join(outDir, ASSETS_URL_DIR), { recursive: true, force: true });
  mkdirSync(join(outDir, "android"), { recursive: true });
  mkdirSync(join(outDir, ASSETS_URL_DIR), { recursive: true });
  for (const asset of assets) {
    copyFileSync(asset.sourcePath, join(outDir, ASSETS_URL_DIR, asset.publishedName));
  }
  // The very string that was signed, written as-is: no re-serialisation.
  writeFileSync(join(outDir, MANIFEST_FILE), manifestJson, "utf8");
  writeFileSync(join(outDir, HEADERS_FILE), headersText, "utf8");

  return {
    updateId: manifest.id,
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    manifestUrl: `${normalizeBaseUrl(input.baseUrl)}${MANIFEST_PATH}`,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

function readOptional(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function checkAsset(
  label: string,
  entry: unknown,
  siteDir: string,
  baseUrlPrefix: string | null,
): string[] {
  if (!isRecord(entry)) return [`${label}: asset entry is not an object.`];
  const problems: string[] = [];
  if (typeof entry.contentType !== "string" || entry.contentType === "") {
    problems.push(`${label}: contentType is missing.`);
  }
  if (entry.fileExtension !== undefined && !/^(\.[A-Za-z0-9]+)?$/.test(String(entry.fileExtension))) {
    problems.push(`${label}: fileExtension must be empty or start with ".".`);
  }
  const name = assetNameFromUrl(entry.url);
  if (name === null) {
    problems.push(`${label}: url must be an https URL ending in /${ASSETS_URL_DIR}/<name>.`);
    return problems;
  }
  if (baseUrlPrefix !== null && !String(entry.url).startsWith(baseUrlPrefix)) {
    problems.push(`${label}: url is not under the expected base URL.`);
  }
  const bytes = readOptional(join(siteDir, ASSETS_URL_DIR, name));
  if (bytes === null) {
    problems.push(`${label}: file ${ASSETS_URL_DIR}/${name} is missing from the site.`);
    return problems;
  }
  if (createHash("sha256").update(bytes).digest("base64url") !== entry.hash) {
    problems.push(`${label}: sha256 hash of ${ASSETS_URL_DIR}/${name} does not match the manifest.`);
  }
  if (createHash("md5").update(bytes).digest("hex") !== entry.key) {
    problems.push(`${label}: key does not match the md5 of ${ASSETS_URL_DIR}/${name}.`);
  }
  return problems;
}

function assetNameFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const match = new RegExp(`/${ASSETS_URL_DIR}/([^/]+)$`).exec(parsed.pathname);
  return match !== null && ASSET_NAME_PATTERN.test(match[1]) ? match[1] : null;
}

function checkManifestShape(manifest: Record<string, unknown>, expectedRuntime: string): string[] {
  const problems: string[] = [];
  if (typeof manifest.id !== "string" || !UUID_PATTERN.test(manifest.id)) {
    problems.push("manifest id must be a UUID.");
  }
  if (typeof manifest.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt))) {
    problems.push("manifest createdAt must be an ISO 8601 date.");
  }
  if (manifest.runtimeVersion !== expectedRuntime) {
    problems.push(
      `manifest runtimeVersion is ${JSON.stringify(manifest.runtimeVersion)}, expected ${JSON.stringify(expectedRuntime)}.`,
    );
  }
  if (!isRecord(manifest.launchAsset)) problems.push("manifest launchAsset is missing.");
  if (!Array.isArray(manifest.assets)) problems.push("manifest assets must be an array.");
  return problems;
}

function checkSignature(
  manifestBytes: Buffer,
  header: string,
  input: VerifySiteInput,
): string[] {
  try {
    return verifySignature(manifestBytes, header, input.certificatePem, input.expectedKeyId)
      ? []
      : ["expo-signature does not validate against the exact bytes of android/manifest.json."];
  } catch (error) {
    return [`Cannot check the signature: ${errorMessage(error)}`];
  }
}

function expectedAssetsPrefix(baseUrl: string | undefined, problems: string[]): string | null {
  if (baseUrl === undefined) return null;
  try {
    return `${normalizeBaseUrl(baseUrl)}/${ASSETS_URL_DIR}/`;
  } catch (error) {
    problems.push(`Invalid expected base URL: ${errorMessage(error)}`);
    return null;
  }
}

/**
 * Re-reads a written site and returns every problem found (empty = OK): the
 * signature over the exact manifest bytes, each asset's file and hashes, the
 * runtime version and the `_headers` rules.
 */
export function verifySite(input: VerifySiteInput): string[] {
  const problems: string[] = [];
  const headersBytes = readOptional(join(input.siteDir, HEADERS_FILE));
  let signatureHeader: string | null = null;
  if (headersBytes === null) {
    problems.push("_headers file is missing.");
  } else {
    const checked = validateHeadersFile(headersBytes.toString("utf8"), MANIFEST_PATH);
    problems.push(...checked.problems);
    signatureHeader = checked.signatureHeader;
  }

  const manifestBytes = readOptional(join(input.siteDir, MANIFEST_FILE));
  if (manifestBytes === null) return [...problems, "android/manifest.json is missing."];
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    return [...problems, "android/manifest.json is not valid JSON."];
  }
  if (!isRecord(manifest)) return [...problems, "android/manifest.json is not a JSON object."];

  if (signatureHeader !== null) {
    problems.push(...checkSignature(manifestBytes, signatureHeader, input));
  }
  problems.push(...checkManifestShape(manifest, input.expectedRuntimeVersion));

  const prefix = expectedAssetsPrefix(input.expectedBaseUrl, problems);
  const entries: [string, unknown][] = [["launchAsset", manifest.launchAsset]];
  if (Array.isArray(manifest.assets)) {
    manifest.assets.forEach((entry, index) => entries.push([`assets[${index}]`, entry]));
  }
  for (const [label, entry] of entries) {
    if (isRecord(entry) || label !== "launchAsset") {
      problems.push(...checkAsset(label, entry, input.siteDir, prefix));
    }
  }
  return problems;
}
