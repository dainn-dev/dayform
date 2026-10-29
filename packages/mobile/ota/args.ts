// Command-line parsing for ota/publish.ts. Pure: no I/O, no environment.
import { normalizeBaseUrl } from "./manifest";

export const DEFAULT_KEY_ID = "main";

export const USAGE = `Usage: bun ota/publish.ts --base-url <https url> --runtime-version <version> --out <dir> [options]

Turns an \`expo export --platform android\` output into a static, signed
Expo Updates (protocol v1) site for Cloudflare Pages.

Required:
  --base-url <url>            Public https origin the site is served from
  --runtime-version <string>  Must equal the runtimeVersion baked into the app
  --out <dir>                 Output directory (android/, assets/ and _headers are replaced)

Options:
  --export-dir <dir>          Use an existing export instead of running \`expo export\`
  --key-id <id>               keyid placed in expo-signature (default: ${DEFAULT_KEY_ID});
                              must equal codeSigningMetadata.keyid in app.json
  --certificate <file>        Certificate to verify against (default: ota/certs/certificate.pem)
  --help                      Show this text

Signing key (never printed, never read from the command line):
  DAYFORM_OTA_PRIVATE_KEY       PEM text (for CI secrets)
  DAYFORM_OTA_PRIVATE_KEY_PATH  path to a PEM file
`;

export interface CliOptions {
  readonly baseUrl: string;
  readonly runtimeVersion: string;
  readonly outDir: string;
  readonly exportDir: string | null;
  readonly keyId: string;
  readonly certificatePath: string | null;
}

export class ArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgsError";
  }
}

const FLAGS = [
  "--base-url",
  "--runtime-version",
  "--out",
  "--export-dir",
  "--key-id",
  "--certificate",
] as const;
type Flag = (typeof FLAGS)[number];

const isFlag = (value: string): value is Flag => (FLAGS as readonly string[]).includes(value);

function collectFlags(argv: readonly string[]): Map<Flag, string> {
  const values = new Map<Flag, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new ArgsError(`Unexpected argument: ${arg}`);
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (!isFlag(name)) throw new ArgsError(`Unknown option: ${name}`);
    if (values.has(name)) throw new ArgsError(`${name} was given more than once.`);
    let value: string;
    if (equals !== -1) {
      value = arg.slice(equals + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new ArgsError(`${name} needs a value.`);
      value = next;
      i += 1;
    }
    values.set(name, value);
  }
  return values;
}

function required(values: Map<Flag, string>, flag: Flag): string {
  const value = values.get(flag);
  if (value === undefined) throw new ArgsError(`Missing required option ${flag}.`);
  return value;
}

function nonEmptyPath(values: Map<Flag, string>, flag: Flag): string | null {
  const value = values.get(flag);
  if (value === undefined) return null;
  if (value.trim() === "") throw new ArgsError(`${flag} must not be empty.`);
  return value;
}

function parseBaseUrl(raw: string): string {
  try {
    return normalizeBaseUrl(raw);
  } catch (error) {
    throw new ArgsError(error instanceof Error ? error.message : "Invalid base URL.");
  }
}

function parseRuntimeVersion(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "" || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new ArgsError("The runtime version must be non-empty and free of control characters.");
  }
  return trimmed;
}

function parseKeyId(raw: string | undefined): string {
  if (raw === undefined) return DEFAULT_KEY_ID;
  if (!/^[\x20-\x7e]+$/.test(raw)) throw new ArgsError("The key id must be non-empty printable ASCII.");
  return raw;
}

/** Parses argv (without the runtime and script). Throws ArgsError on any problem. */
export function parseArgs(argv: readonly string[]): CliOptions {
  const values = collectFlags(argv);
  const baseUrl = parseBaseUrl(required(values, "--base-url"));
  const runtimeVersion = parseRuntimeVersion(required(values, "--runtime-version"));
  const outDir = required(values, "--out");
  if (outDir.trim() === "") throw new ArgsError("--out must not be empty.");
  return {
    baseUrl,
    runtimeVersion,
    outDir,
    exportDir: nonEmptyPath(values, "--export-dir"),
    keyId: parseKeyId(values.get("--key-id")),
    certificatePath: nonEmptyPath(values, "--certificate"),
  };
}
