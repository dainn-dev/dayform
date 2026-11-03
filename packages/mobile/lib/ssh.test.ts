import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extraTranslations } from "./i18n";
import {
  SSH_ERROR_CODES, SSH_ERROR_TEXTS, SshError, cleanPrivateKey, isFingerprint, looksLikePrivateKey, shortFingerprint, toSshError,
} from "./ssh";

const FP = `SHA256:${"Ab+/".repeat(10)}Ab+`;
const KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----";

describe("errors", () => {
  test("a native failure with a known code keeps it, anything else is a connection failure", () => {
    expect(toSshError({ code: "AUTH_FAILED" }).code).toBe("AUTH_FAILED");
    expect(toSshError({ code: "HOST_KEY_MISMATCH", message: "10.0.0.5 changed" }).code).toBe("HOST_KEY_MISMATCH");
    expect(toSshError({ code: "SOMETHING_ELSE" }).code).toBe("CONNECT_FAILED");
    expect(toSshError(new Error("boom")).code).toBe("CONNECT_FAILED");
    expect(toSshError(null).code).toBe("CONNECT_FAILED");
  });

  test("an SshError passes through, and its message is only its code (never a host or a secret)", () => {
    const error = new SshError("TIMEOUT");
    expect(toSshError(error)).toBe(error);
    expect(error.message).toBe("TIMEOUT");
  });

  test("every code has an English text that the Vietnamese dictionary translates", () => {
    for (const code of SSH_ERROR_CODES) {
      expect(SSH_ERROR_TEXTS[code].length).toBeGreaterThan(10);
      expect(extraTranslations[SSH_ERROR_TEXTS[code]]).toBeTruthy();
    }
  });
});

describe("keys and fingerprints", () => {
  test("a private key is recognised by its BEGIN and END lines; a public key or a note is not", () => {
    expect(looksLikePrivateKey(KEY)).toBe(true);
    expect(looksLikePrivateKey(KEY.replace(/OPENSSH /g, "RSA "))).toBe(true);
    expect(looksLikePrivateKey(KEY.replace(/OPENSSH /g, ""))).toBe(true);
    expect(looksLikePrivateKey("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA me@phone")).toBe(false);
    expect(looksLikePrivateKey("-----BEGIN OPENSSH PRIVATE KEY-----")).toBe(false);
    expect(looksLikePrivateKey("password123")).toBe(false);
    expect(looksLikePrivateKey(`${KEY}${"x".repeat(17_000)}`)).toBe(false);
  });

  test("a pasted key gets Unix line endings and one final newline", () => {
    expect(cleanPrivateKey(`  ${KEY.replace(/\n/g, "\r\n")}  \r\n\r\n`)).toBe(`${KEY}\n`);
  });

  test("only SHA256 + 43 base64 characters is a fingerprint", () => {
    expect(isFingerprint(FP)).toBe(true);
    for (const bad of ["", "SHA256:short", `MD5:${"a".repeat(43)}`, `SHA256:${"a".repeat(44)}`, `SHA256:${"a".repeat(42)}!`, null, 5]) expect(isFingerprint(bad)).toBe(false);
  });

  test("a long fingerprint is cut in the middle, a short text is left alone", () => {
    expect(shortFingerprint(FP)).toBe(`${FP.slice(0, 15)}…${FP.slice(-8)}`);
    expect(shortFingerprint("SHA256:abc")).toBe("SHA256:abc");
  });
});

// Every English text the SSH screens show needs a Vietnamese one.
const ROOT = join(import.meta.dir, "..");
const FILES = ["components/personal/SshSection.tsx", "components/personal/SshHostEditor.tsx", "components/personal/SshTerminal.tsx"];
const baseDictionary = readFileSync(join(ROOT, "lib/language.tsx"), "utf8");
const translated = (key: string): boolean => key in extraTranslations || baseDictionary.includes(`${JSON.stringify(key)}:`);
const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;

function literalsOf(source: string): string[] {
  const direct = [...source.matchAll(new RegExp(String.raw`\bt\(\s*${STRING}`, "g"))].map(match => match[1]);
  const conditional = [...source.matchAll(new RegExp(String.raw`\bt\(\s*[^"()]*\?\s*${STRING}\s*:\s*${STRING}`, "g"))].flatMap(match => [match[1], match[2]]);
  const tables = [...source.matchAll(new RegExp(String.raw`^\s*(?:"[a-z-]+"|[a-z]+):\s*${STRING},?$`, "gm"))].map(match => match[1]);
  const choices = [...source.matchAll(new RegExp(String.raw`label:\s*${STRING}`, "g"))].map(match => match[1]);
  return [...direct, ...conditional, ...tables, ...choices];
}

describe("SSH screens are translated", () => {
  for (const file of FILES) {
    test(file, () => {
      const literals = literalsOf(readFileSync(join(ROOT, file), "utf8"));
      expect(literals.length).toBeGreaterThan(5);
      expect(literals.filter(text => !translated(text))).toEqual([]);
    });
  }
});
