// Shared fixtures for the OTA tests. Everything here is throw-away: keys are
// generated per run and the fake export lives in a temp dir. Never imported by
// the app.
import { createHash, generateKeyPairSync, createSign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

export interface TestKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  certificatePem: string;
}

const BUNDLE_BYTES = Buffer.from("fake hermes bytecode é\u0000\u0001");
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const TTF_BYTES = Buffer.from("fake font bytes");

export const FAKE_BUNDLE_PATH = "_expo/static/js/android/entry-abc123.hbc";

export function md5Hex(bytes: Buffer): string {
  return createHash("md5").update(bytes).digest("hex");
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Base64Url(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

const encodeLength = (length: number): Buffer => {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};

const der = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
};

const SHA256_RSA_ALGORITHM = der(
  0x30,
  der(0x06, Buffer.from("2a864886f70d01010b", "hex")),
  Buffer.from([0x05, 0x00]),
);

const commonName = der(
  0x30,
  der(0x31, der(0x30, der(0x06, Buffer.from("550403", "hex")), der(0x0c, Buffer.from("test")))),
);

// Minimal self-signed X.509 certificate (no extensions) around a public key.
function selfSignedCertificate(publicKeyDer: Buffer, privateKeyPem: string): string {
  const validity = der(
    0x30,
    der(0x17, Buffer.from("240101000000Z")),
    der(0x17, Buffer.from("490101000000Z")),
  );
  const tbs = der(
    0x30,
    Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]),
    der(0x02, Buffer.from([1])),
    SHA256_RSA_ALGORITHM,
    commonName,
    validity,
    commonName,
    publicKeyDer,
  );
  const signature = createSign("RSA-SHA256").update(tbs).sign(privateKeyPem);
  const certificate = der(0x30, tbs, SHA256_RSA_ALGORITHM, der(0x03, Buffer.from([0]), signature));
  const lines = certificate.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

export function generateTestKeyPair(modulusLength = 2048): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKeyPem,
    publicKeyPem,
    certificatePem: selfSignedCertificate(publicKeyDer, privateKeyPem),
  };
}

export interface FakeExport {
  dir: string;
  bundleBytes: Buffer;
  pngBytes: Buffer;
  ttfBytes: Buffer;
  pngPath: string;
  ttfPath: string;
  cleanup: () => void;
}

export function makeTempDir(prefix = "dayform-ota-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeFileDeep(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// Mirrors the real `expo export --platform android` layout, including the
// Windows-style backslashes Expo writes in metadata.json asset paths.
export function makeFakeExport(overrides?: { metadata?: unknown }): FakeExport {
  const dir = makeTempDir();
  const pngPath = `assets/${md5Hex(PNG_BYTES)}`;
  const ttfPath = `assets/${md5Hex(TTF_BYTES)}`;
  writeFileDeep(join(dir, FAKE_BUNDLE_PATH), BUNDLE_BYTES);
  writeFileDeep(join(dir, pngPath), PNG_BYTES);
  writeFileDeep(join(dir, ttfPath), TTF_BYTES);
  const metadata = overrides?.metadata ?? {
    version: 0,
    bundler: "metro",
    fileMetadata: {
      android: {
        bundle: FAKE_BUNDLE_PATH,
        assets: [
          { path: pngPath.replace("/", "\\"), ext: "png" },
          { path: ttfPath, ext: "ttf" },
        ],
      },
    },
  };
  writeFileDeep(join(dir, "metadata.json"), JSON.stringify(metadata));
  return {
    dir,
    bundleBytes: BUNDLE_BYTES,
    pngBytes: PNG_BYTES,
    ttfBytes: TTF_BYTES,
    pngPath,
    ttfPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
