// CLI: bun ota/publish.ts --base-url https://... --runtime-version X --out ../ota-site
// Thin wrapper: parse args -> load key -> buildSite -> verifySite. All logic
// lives in the pure modules next to this file.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ArgsError, USAGE, parseArgs, type CliOptions } from "./args";
import { readExpoConfig, runExpoExport } from "./expo-export";
import { buildSite, verifySite, type SiteSummary } from "./site";
import { derivePublicKeyPem } from "./sign";

export const PRIVATE_KEY_ENV = "DAYFORM_OTA_PRIVATE_KEY";
export const PRIVATE_KEY_PATH_ENV = "DAYFORM_OTA_PRIVATE_KEY_PATH";

export type Env = Readonly<Record<string, string | undefined>>;

export interface PublishIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly now: () => Date;
  /** Runs `expo export --platform android` into the given directory; throws on failure. */
  readonly exportAndroid: (outDir: string) => void;
  /** The public app config, carried in the manifest as `extra.expoClient`; the real CLI always provides it. */
  readonly readExpoConfig?: () => Record<string, unknown>;
  readonly defaultCertificatePath: string;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

/**
 * The signing key as PEM text. Exactly one of DAYFORM_OTA_PRIVATE_KEY (PEM
 * text, `\n` escapes allowed for CI secrets) or DAYFORM_OTA_PRIVATE_KEY_PATH.
 * Error messages never contain key material.
 */
export function loadPrivateKeyPem(env: Env): string {
  const inline = env[PRIVATE_KEY_ENV];
  const path = env[PRIVATE_KEY_PATH_ENV];
  const hasInline = inline !== undefined && inline.trim() !== "";
  const hasPath = path !== undefined && path.trim() !== "";
  if (hasInline && hasPath) {
    throw new Error(`Set only one of ${PRIVATE_KEY_ENV} and ${PRIVATE_KEY_PATH_ENV}.`);
  }
  if (hasInline) {
    return inline.includes("\n") ? inline : inline.replace(/\\n/g, "\n");
  }
  if (hasPath) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      throw new Error(`Cannot read the private key file named by ${PRIVATE_KEY_PATH_ENV}.`);
    }
  }
  throw new Error(`No signing key: set ${PRIVATE_KEY_ENV} (PEM text) or ${PRIVATE_KEY_PATH_ENV} (file).`);
}

function withExportDir<T>(options: CliOptions, io: PublishIo, use: (exportDir: string) => T): T {
  if (options.exportDir !== null) {
    if (!existsSync(options.exportDir)) {
      throw new Error(`The export directory does not exist: ${options.exportDir}`);
    }
    return use(options.exportDir);
  }
  const tempDir = mkdtempSync(join(tmpdir(), "dayform-ota-export-"));
  try {
    io.exportAndroid(tempDir);
    return use(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readCertificate(options: CliOptions, io: PublishIo): string | null {
  const path = options.certificatePath ?? io.defaultCertificatePath;
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Cannot read the certificate file ${path}.`);
  }
}

function logSummary(summary: SiteSummary, options: CliOptions, io: PublishIo): void {
  const kib = (summary.totalBytes / 1024).toFixed(1);
  io.log(`Update id:    ${summary.updateId}`);
  io.log(`Assets:       ${summary.assetCount} files, ${kib} KiB`);
  io.log(`Manifest URL: ${summary.manifestUrl}`);
  io.log(`Runtime:      ${options.runtimeVersion} (key id "${options.keyId}")`);
  io.log(`Site written: ${resolve(options.outDir)}`);
}

function publish(options: CliOptions, env: Env, io: PublishIo): number {
  const privateKeyPem = loadPrivateKeyPem(env);
  const summary = withExportDir(options, io, (exportDir) =>
    buildSite({
      exportDir,
      outDir: options.outDir,
      baseUrl: options.baseUrl,
      runtimeVersion: options.runtimeVersion,
      createdAt: io.now().toISOString(),
      privateKeyPem,
      keyId: options.keyId,
      expoConfig: io.readExpoConfig?.(),
    }),
  );

  const certificatePem = readCertificate(options, io);
  if (certificatePem === null) {
    io.error(
      "warning: certificate not found; the signature was checked against the public key derived " +
        "from the private key only. That does NOT prove it matches the certificate embedded in the app.",
    );
  }
  const problems = verifySite({
    siteDir: options.outDir,
    certificatePem: certificatePem ?? derivePublicKeyPem(privateKeyPem),
    expectedRuntimeVersion: options.runtimeVersion,
    expectedKeyId: options.keyId,
    expectedBaseUrl: options.baseUrl,
  });
  if (problems.length > 0) {
    problems.forEach((problem) => io.error(`problem: ${problem}`));
    io.error(`Verification failed with ${problems.length} problem(s). Do not deploy ${options.outDir}.`);
    return 1;
  }
  logSummary(summary, options, io);
  io.log(
    certificatePem === null
      ? "Verified: structure, hashes and signature (self-check only)."
      : "Verified: structure, hashes and signature against the certificate.",
  );
  return 0;
}

/** Runs the CLI and returns the process exit code. */
export function runPublish(argv: readonly string[], env: Env, io: PublishIo): number {
  if (argv.includes("--help")) {
    io.log(USAGE);
    return 0;
  }
  try {
    return publish(parseArgs(argv), env, io);
  } catch (error) {
    io.error(`error: ${errorMessage(error)}`);
    if (error instanceof ArgsError) io.error(`\n${USAGE}`);
    return 1;
  }
}

export function createRealIo(): PublishIo {
  const otaDir = import.meta.dir;
  const write = (stream: NodeJS.WriteStream) => (line: string) => {
    stream.write(`${line}\n`);
  };
  return {
    log: write(process.stdout),
    error: write(process.stderr),
    now: () => new Date(),
    exportAndroid: (outDir) => runExpoExport({ cwd: resolve(otaDir, ".."), outDir }),
    readExpoConfig: () => readExpoConfig({ cwd: resolve(otaDir, "..") }),
    defaultCertificatePath: join(otaDir, "certs", "certificate.pem"),
  };
}

if (import.meta.main) {
  process.exit(runPublish(process.argv.slice(2), process.env, createRealIo()));
}
