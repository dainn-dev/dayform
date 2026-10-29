// RSA-SHA256 (PKCS#1 v1.5) signing and verification of the exact manifest
// bytes, plus the tiny slice of Structured Field Values (RFC 8941) needed for
// the `expo-signature` header. Hand-rolled on purpose: no dependencies.
import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from "node:crypto";

const MIN_RSA_BITS = 2048;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+=*$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const TOKEN_CHAR = /[a-z0-9_\-.*]/;

export interface ParsedSignatureHeader {
  readonly sig: string;
  readonly keyId: string | null;
}

function assertRsa(key: KeyObject, what: string): void {
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error(`The ${what} must be an RSA key.`);
  }
}

function loadPrivateKey(privateKeyPem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    // Deliberately generic: never echo anything derived from key material.
    throw new Error("The private key could not be parsed (expected an unencrypted PEM).");
  }
  assertRsa(key, "private key");
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < MIN_RSA_BITS) {
    throw new Error(`The RSA private key must be at least ${MIN_RSA_BITS} bits.`);
  }
  return key;
}

function loadVerificationKey(pem: string): KeyObject {
  let key: KeyObject;
  if (pem.includes("BEGIN CERTIFICATE")) {
    try {
      key = new X509Certificate(pem).publicKey;
    } catch {
      throw new Error("The certificate PEM could not be parsed.");
    }
  } else {
    try {
      key = createPublicKey(pem);
    } catch {
      throw new Error("The certificate or public key PEM could not be parsed.");
    }
  }
  assertRsa(key, "verification key");
  return key;
}

/** Base64 RSA-SHA256 signature over the exact UTF-8 bytes of `manifestJson`. */
export function signManifest(manifestJson: string, privateKeyPem: string): string {
  const key = loadPrivateKey(privateKeyPem);
  return createSign("RSA-SHA256").update(manifestJson, "utf8").sign(key, "base64");
}

/** Public key (SPKI PEM) matching a private key, for self-checks. */
export function derivePublicKeyPem(privateKeyPem: string): string {
  const key = createPublicKey(loadPrivateKey(privateKeyPem));
  return key.export({ type: "spki", format: "pem" }).toString();
}

const escapeSfvString = (value: string): string => value.replace(/[\\"]/g, (c) => `\\${c}`);

/** `sig="<base64>", keyid="<id>"` as an SFV dictionary of two strings. */
export function serializeSignatureHeader(sig: string, keyId: string): string {
  if (!BASE64_PATTERN.test(sig)) {
    throw new Error("The signature must be a non-empty base64 string.");
  }
  if (!PRINTABLE_ASCII.test(keyId)) {
    throw new Error("The key id must be non-empty printable ASCII.");
  }
  return `sig="${sig}", keyid="${escapeSfvString(keyId)}"`;
}

interface Member {
  readonly name: string;
  readonly value: string | null;
}

// Reads a quoted SFV string starting just after the opening quote. Returns the
// text and the index after the closing quote, or null if malformed.
function readQuoted(header: string, start: number): { text: string; end: number } | null {
  let text = "";
  let i = start;
  for (;;) {
    const c = header[i];
    if (c === undefined) return null;
    i += 1;
    if (c === '"') return { text, end: i };
    if (c !== "\\") {
      text += c;
      continue;
    }
    const escaped = header[i];
    if (escaped !== '"' && escaped !== "\\") return null;
    text += escaped;
    i += 1;
  }
}

// Parses `name="string"` / bare-token members separated by commas. Returns
// null on anything malformed. Non-string values become a null value.
function parseMembers(header: string): Member[] | null {
  const members: Member[] = [];
  let i = 0;
  const skipSpaces = (): void => {
    while (header[i] === " " || header[i] === "\t") i += 1;
  };
  for (;;) {
    skipSpaces();
    const nameStart = i;
    while (i < header.length && TOKEN_CHAR.test(header[i])) i += 1;
    const name = header.slice(nameStart, i);
    if (name === "") return null;
    let value: string | null = null;
    if (header[i] === "=") {
      if (header[i + 1] !== '"') return null;
      const quoted = readQuoted(header, i + 2);
      if (quoted === null) return null;
      value = quoted.text;
      i = quoted.end;
    }
    members.push({ name, value });
    skipSpaces();
    if (i >= header.length) return members;
    if (header[i] !== ",") return null;
    i += 1;
  }
}

/** Extracts `sig` and `keyid`; null when the header is malformed or has no sig. */
export function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  const members = parseMembers(header);
  if (members === null) return null;
  const sig = members.find((m) => m.name === "sig")?.value;
  if (typeof sig !== "string") return null;
  const keyId = members.find((m) => m.name === "keyid")?.value ?? null;
  return { sig, keyId };
}

/**
 * Verifies `signatureHeader` over exactly `manifest` (string = UTF-8 bytes, or
 * the raw bytes read from disk). `keyPem` is an RSA public key or an X.509
 * certificate PEM. Returns false for a bad signature or malformed header and
 * throws only when the key itself is unusable.
 */
export function verifySignature(
  manifest: string | Uint8Array,
  signatureHeader: string,
  keyPem: string,
  expectedKeyId?: string,
): boolean {
  const key = loadVerificationKey(keyPem);
  const parsed = parseSignatureHeader(signatureHeader);
  if (parsed === null || !BASE64_PATTERN.test(parsed.sig)) return false;
  if (expectedKeyId !== undefined && parsed.keyId !== expectedKeyId) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(typeof manifest === "string" ? Buffer.from(manifest, "utf8") : manifest);
  return verifier.verify(key, parsed.sig, "base64");
}
