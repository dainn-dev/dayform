import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createRealIo, loadPrivateKeyPem, runPublish, type PublishIo } from "./publish";
import { generateTestKeyPair, makeFakeExport, makeTempDir } from "./test-helpers";

const keys = generateTestKeyPair();
const otherKeys = generateTestKeyPair();
const cleanup: (() => void)[] = [];
afterAll(() => cleanup.forEach((fn) => fn()));

const tempDir = (): string => {
  const dir = makeTempDir("dayform-ota-cli-");
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

let out: string[];
let err: string[];
let exportCalls: string[];
let fakeExportDir: string;
let workDir: string;

const makeIo = (overrides: Partial<PublishIo> = {}): PublishIo => ({
  log: (line) => out.push(line),
  error: (line) => err.push(line),
  now: () => new Date("2026-01-02T03:04:05.000Z"),
  exportAndroid: (dir) => {
    exportCalls.push(dir);
    cpSync(fakeExportDir, dir, { recursive: true });
  },
  defaultCertificatePath: join(workDir, "certs", "certificate.pem"),
  ...overrides,
});

beforeEach(() => {
  out = [];
  err = [];
  exportCalls = [];
  const fake = makeFakeExport();
  cleanup.push(fake.cleanup);
  fakeExportDir = fake.dir;
  workDir = tempDir();
});

const argv = (outDir: string, extra: string[] = []): string[] => [
  "--base-url",
  "https://ota.example.pages.dev",
  "--runtime-version",
  "1.0.0",
  "--out",
  outDir,
  ...extra,
];

const keyEnv = (pem = keys.privateKeyPem): Record<string, string> => ({ DAYFORM_OTA_PRIVATE_KEY: pem });

const writeCertificate = (pem: string): string => {
  const path = join(workDir, "cert.pem");
  writeFileSync(path, pem);
  return path;
};

describe("runPublish app config", () => {
  test("puts the public app config into the manifest as extra.expoClient", () => {
    const outDir = join(workDir, "site-config");
    const config = { name: "Dayform", version: "1.1.0", scheme: "dayform" };
    const code = runPublish(argv(outDir, ["--export-dir", fakeExportDir]), keyEnv(), makeIo({ readExpoConfig: () => config }));
    expect(code).toBe(0);
    const manifest = JSON.parse(readFileSync(join(outDir, "android", "manifest.json"), "utf8"));
    expect(manifest.extra).toEqual({ expoClient: config });
  });

  test("leaves extra empty when no config reader is given", () => {
    const outDir = join(workDir, "site-no-config");
    expect(runPublish(argv(outDir, ["--export-dir", fakeExportDir]), keyEnv(), makeIo())).toBe(0);
    const manifest = JSON.parse(readFileSync(join(outDir, "android", "manifest.json"), "utf8"));
    expect(manifest.extra).toEqual({});
  });

  test("the real io provides a config reader", () => {
    expect(typeof createRealIo().readExpoConfig).toBe("function");
  });
});

describe("loadPrivateKeyPem", () => {
  test("reads PEM text from DAYFORM_OTA_PRIVATE_KEY", () => {
    expect(loadPrivateKeyPem(keyEnv())).toBe(keys.privateKeyPem);
  });

  test("restores newlines written as a literal backslash-n (CI secrets)", () => {
    const escaped = keys.privateKeyPem.trim().replace(/\n/g, "\\n");
    expect(loadPrivateKeyPem({ DAYFORM_OTA_PRIVATE_KEY: escaped })).toBe(
      keys.privateKeyPem.trim(),
    );
  });

  test("reads a PEM file from DAYFORM_OTA_PRIVATE_KEY_PATH", () => {
    const path = join(workDir, "key.pem");
    writeFileSync(path, keys.privateKeyPem);
    expect(loadPrivateKeyPem({ DAYFORM_OTA_PRIVATE_KEY_PATH: path })).toBe(keys.privateKeyPem);
  });

  test("fails closed when no key, both keys, an empty key or an unreadable file", () => {
    expect(() => loadPrivateKeyPem({})).toThrow("DAYFORM_OTA_PRIVATE_KEY");
    expect(() => loadPrivateKeyPem({ DAYFORM_OTA_PRIVATE_KEY: "  " })).toThrow("DAYFORM_OTA_PRIVATE_KEY");
    expect(() =>
      loadPrivateKeyPem({ DAYFORM_OTA_PRIVATE_KEY: "x", DAYFORM_OTA_PRIVATE_KEY_PATH: "y" }),
    ).toThrow("only one");
    expect(() => loadPrivateKeyPem({ DAYFORM_OTA_PRIVATE_KEY_PATH: join(workDir, "nope.pem") })).toThrow(
      "Cannot read",
    );
  });
});

describe("runPublish", () => {
  test("publishes a verified site from an existing export and never prints the key", () => {
    const outDir = join(workDir, "site");
    const certPath = writeCertificate(keys.certificatePem);
    const code = runPublish(argv(outDir, ["--export-dir", fakeExportDir, "--certificate", certPath]), keyEnv(), makeIo());
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(exportCalls).toEqual([]);
    expect(existsSync(join(outDir, "android", "manifest.json"))).toBe(true);
    const output = out.join("\n");
    expect(output).toContain("Update id:");
    expect(output).toContain("https://ota.example.pages.dev/android/manifest.json");
    expect(output).toContain("certificate");
    expect(output).not.toContain("PRIVATE KEY");
    expect(output).not.toContain(keys.privateKeyPem.split("\n")[1]);
  });

  test("runs expo export into a temp dir when no export dir is given, then removes it", () => {
    const outDir = join(workDir, "site");
    const certPath = writeCertificate(keys.certificatePem);
    const code = runPublish(argv(outDir, ["--certificate", certPath]), keyEnv(), makeIo());
    expect(code).toBe(0);
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0].startsWith(tmpdir())).toBe(true);
    expect(existsSync(exportCalls[0])).toBe(false);
  });

  test("removes the temp export even when the export fails", () => {
    let created = "";
    const io = makeIo({
      exportAndroid: (dir) => {
        created = dir;
        throw new Error("metro exploded");
      },
    });
    expect(runPublish(argv(join(workDir, "site")), keyEnv(), io)).toBe(1);
    expect(err.join("\n")).toContain("metro exploded");
    expect(existsSync(created)).toBe(false);
  });

  test("uses the default certificate path and fails when it does not match the signing key", () => {
    const certPath = join(workDir, "certs", "certificate.pem");
    cpSync(writeCertificate(otherKeys.certificatePem), certPath);
    const code = runPublish(argv(join(workDir, "site"), ["--export-dir", fakeExportDir]), keyEnv(), makeIo());
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("signature");
    expect(err.join("\n")).toContain("Do not deploy");
  });

  test("warns and self-checks against the derived public key when the certificate is missing", () => {
    const code = runPublish(argv(join(workDir, "site"), ["--export-dir", fakeExportDir]), keyEnv(), makeIo());
    expect(code).toBe(0);
    expect(err.join("\n")).toContain("certificate not found");
    expect(err.join("\n")).toContain("does NOT prove");
  });

  test("fails on an unreadable certificate file", () => {
    const certPath = writeCertificate("not a certificate");
    const code = runPublish(
      argv(join(workDir, "site"), ["--export-dir", fakeExportDir, "--certificate", certPath]),
      keyEnv(),
      makeIo(),
    );
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("certificate");
  });

  test("fails when the certificate path exists but cannot be read", () => {
    const code = runPublish(
      argv(join(workDir, "site"), ["--export-dir", fakeExportDir, "--certificate", workDir]),
      keyEnv(),
      makeIo(),
    );
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("Cannot read the certificate");
  });

  test("the CLI entry point prints usage when run as a script", () => {
    const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "publish.ts"), "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Usage:");
  });

  test("fails closed without a key, with a bad key or with a missing export dir", () => {
    const base = argv(join(workDir, "site"), ["--export-dir", fakeExportDir]);
    expect(runPublish(base, {}, makeIo())).toBe(1);
    expect(err.join("\n")).toContain("DAYFORM_OTA_PRIVATE_KEY");
    expect(existsSync(join(workDir, "site"))).toBe(false);

    err = [];
    const secret = "-----BEGIN PRIVATE KEY-----\nSUPERSECRETBODY\n-----END PRIVATE KEY-----";
    expect(runPublish(base, keyEnv(secret), makeIo())).toBe(1);
    expect(err.join("\n")).not.toContain("SUPERSECRETBODY");

    err = [];
    const missing = argv(join(workDir, "site"), ["--export-dir", join(workDir, "nope")]);
    expect(runPublish(missing, keyEnv(), makeIo())).toBe(1);
    expect(err.join("\n")).toContain("export directory");
  });

  test("rejects http base URLs and empty runtime versions before touching anything", () => {
    const outDir = join(workDir, "site");
    expect(runPublish(["--base-url", "http://a.example.com", "--runtime-version", "1", "--out", outDir], keyEnv(), makeIo())).toBe(1);
    expect(err.join("\n")).toContain("https");
    err = [];
    expect(runPublish(["--base-url", "https://a.example.com", "--runtime-version", "", "--out", outDir], keyEnv(), makeIo())).toBe(1);
    expect(err.join("\n")).toContain("runtime version");
    expect(exportCalls).toEqual([]);
    expect(existsSync(outDir)).toBe(false);
  });

  test("prints usage for --help and exits 0", () => {
    expect(runPublish(["--help"], {}, makeIo())).toBe(0);
    expect(out.join("\n")).toContain("Usage:");
  });

  test("shows usage after an argument error", () => {
    expect(runPublish([], keyEnv(), makeIo())).toBe(1);
    expect(err.join("\n")).toContain("Usage:");
  });

  test("reports the exact files produced", () => {
    const outDir = join(workDir, "site");
    runPublish(argv(outDir, ["--export-dir", fakeExportDir]), keyEnv(), makeIo());
    expect(readdirSync(outDir).sort()).toEqual(["_headers", "android", "assets"]);
    expect(readFileSync(join(outDir, "_headers"), "utf8")).toContain("expo-signature:");
  });
});

describe("createRealIo", () => {
  test("wires a clock, the certificate default and writers", () => {
    const io = createRealIo();
    expect(io.defaultCertificatePath.replace(/\\/g, "/")).toMatch(/ota\/certs\/certificate\.pem$/);
    expect(io.now()).toBeInstanceOf(Date);
    expect(typeof io.exportAndroid).toBe("function");
    expect(() => io.log("")).not.toThrow();
    expect(() => io.error("")).not.toThrow();
  });
});
