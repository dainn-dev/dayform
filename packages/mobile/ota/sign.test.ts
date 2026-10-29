import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  derivePublicKeyPem,
  parseSignatureHeader,
  serializeSignatureHeader,
  signManifest,
  verifySignature,
} from "./sign";
import { generateTestKeyPair } from "./test-helpers";

const keys = generateTestKeyPair();
const otherKeys = generateTestKeyPair();
const MANIFEST = '{"id":"x","note":"café"}';

const ecPem = (kind: "private" | "public"): string => {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return kind === "private"
    ? pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    : pair.publicKey.export({ type: "spki", format: "pem" }).toString();
};

describe("signManifest", () => {
  test("returns a base64 RSA-SHA256 signature that verifies", () => {
    const sig = signManifest(MANIFEST, keys.privateKeyPem);
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const header = serializeSignatureHeader(sig, "main");
    expect(verifySignature(MANIFEST, header, keys.publicKeyPem)).toBe(true);
  });

  test("is deterministic (PKCS#1 v1.5)", () => {
    expect(signManifest(MANIFEST, keys.privateKeyPem)).toBe(
      signManifest(MANIFEST, keys.privateKeyPem),
    );
  });

  test("rejects garbage keys without echoing them", () => {
    const secret = "-----BEGIN PRIVATE KEY-----\nSECRETSECRET\n-----END PRIVATE KEY-----";
    let message = "";
    try {
      signManifest(MANIFEST, secret);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("private key");
    expect(message).not.toContain("SECRETSECRET");
  });

  test("rejects non-RSA keys", () => {
    expect(() => signManifest(MANIFEST, ecPem("private"))).toThrow("RSA");
  });

  test("rejects RSA keys shorter than 2048 bits", () => {
    const small = generateTestKeyPair(1024);
    expect(() => signManifest(MANIFEST, small.privateKeyPem)).toThrow("2048");
  });
});

describe("serializeSignatureHeader / parseSignatureHeader", () => {
  test("produces an SFV dictionary of two strings", () => {
    expect(serializeSignatureHeader("abc+/=", "main")).toBe('sig="abc+/=", keyid="main"');
  });

  test("round-trips", () => {
    const header = serializeSignatureHeader("QUJD", "key one");
    expect(parseSignatureHeader(header)).toEqual({ sig: "QUJD", keyId: "key one" });
  });

  test("escapes quotes and backslashes in the key id", () => {
    const header = serializeSignatureHeader("QUJD", 'a"b\\c');
    expect(header).toBe('sig="QUJD", keyid="a\\"b\\\\c"');
    expect(parseSignatureHeader(header)?.keyId).toBe('a"b\\c');
  });

  test("rejects a signature that is not base64", () => {
    expect(() => serializeSignatureHeader('a"b', "main")).toThrow("base64");
    expect(() => serializeSignatureHeader("", "main")).toThrow("base64");
  });

  test("rejects empty or non-printable key ids", () => {
    expect(() => serializeSignatureHeader("QUJD", "")).toThrow("key id");
    expect(() => serializeSignatureHeader("QUJD", "a\nb")).toThrow("key id");
    expect(() => serializeSignatureHeader("QUJD", "café")).toThrow("key id");
  });

  test("parse tolerates extra members such as alg and bare tokens", () => {
    const parsed = parseSignatureHeader('sig="QUJD", alg="rsa-v1_5-sha256", flag, keyid="main"');
    expect(parsed).toEqual({ sig: "QUJD", keyId: "main" });
  });

  test("parse keeps commas inside quoted strings", () => {
    expect(parseSignatureHeader('keyid="a, b", sig="QUJD"')).toEqual({
      sig: "QUJD",
      keyId: "a, b",
    });
  });

  test("parse returns a null keyId when absent", () => {
    expect(parseSignatureHeader('sig="QUJD"')).toEqual({ sig: "QUJD", keyId: null });
  });

  test("parse returns null for malformed headers or a missing sig", () => {
    expect(parseSignatureHeader('keyid="main"')).toBeNull();
    expect(parseSignatureHeader("flag, sig")).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader('sig="QUJD')).toBeNull();
    expect(parseSignatureHeader('sig="QUJD" junk')).toBeNull();
    expect(parseSignatureHeader("sig=QUJD")).toBeNull();
    expect(parseSignatureHeader('sig="a\\')).toBeNull();
    expect(parseSignatureHeader('sig="a\\n"')).toBeNull();
  });
});

describe("verifySignature", () => {
  const sig = signManifest(MANIFEST, keys.privateKeyPem);
  const header = serializeSignatureHeader(sig, "main");

  test("accepts a public key PEM and an X.509 certificate PEM", () => {
    expect(verifySignature(MANIFEST, header, keys.publicKeyPem)).toBe(true);
    expect(verifySignature(MANIFEST, header, keys.certificatePem)).toBe(true);
  });

  test("verifies raw bytes, not a re-serialised string", () => {
    expect(verifySignature(Buffer.from(MANIFEST, "utf8"), header, keys.publicKeyPem)).toBe(true);
  });

  test("fails when a single byte of the manifest changes", () => {
    expect(verifySignature(MANIFEST.replace("x", "y"), header, keys.publicKeyPem)).toBe(false);
    expect(verifySignature(`${MANIFEST}\n`, header, keys.publicKeyPem)).toBe(false);
  });

  test("fails with the wrong key or certificate", () => {
    expect(verifySignature(MANIFEST, header, otherKeys.publicKeyPem)).toBe(false);
    expect(verifySignature(MANIFEST, header, otherKeys.certificatePem)).toBe(false);
  });

  test("fails on a malformed header or a corrupted signature", () => {
    expect(verifySignature(MANIFEST, "nonsense", keys.publicKeyPem)).toBe(false);
    expect(verifySignature(MANIFEST, 'sig="AAAA", keyid="main"', keys.publicKeyPem)).toBe(false);
    expect(verifySignature(MANIFEST, 'sig="not base64!", keyid="main"', keys.publicKeyPem)).toBe(
      false,
    );
  });

  test("enforces the expected key id when given", () => {
    expect(verifySignature(MANIFEST, header, keys.publicKeyPem, "main")).toBe(true);
    expect(verifySignature(MANIFEST, header, keys.publicKeyPem, "root")).toBe(false);
    expect(verifySignature(MANIFEST, `sig="${sig}"`, keys.publicKeyPem, "main")).toBe(false);
  });

  test("throws on an unusable public key or certificate", () => {
    expect(() => verifySignature(MANIFEST, header, "not a pem")).toThrow("public key");
    expect(() =>
      verifySignature(
        MANIFEST,
        header,
        "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----",
      ),
    ).toThrow("certificate");
  });

  test("rejects a non-RSA verification key", () => {
    expect(() => verifySignature(MANIFEST, header, ecPem("public"))).toThrow("RSA");
  });
});

describe("derivePublicKeyPem", () => {
  test("derives a key that verifies signatures from the private key", () => {
    const pem = derivePublicKeyPem(keys.privateKeyPem);
    expect(pem).toContain("BEGIN PUBLIC KEY");
    const header = serializeSignatureHeader(signManifest(MANIFEST, keys.privateKeyPem), "main");
    expect(verifySignature(MANIFEST, header, pem)).toBe(true);
  });
});
