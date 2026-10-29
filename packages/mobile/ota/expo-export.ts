// Runs `expo export --platform android` (Metro only; no Gradle, no native build).
export interface SpawnResult {
  readonly exitCode: number;
}

export type Spawn = (command: readonly string[], cwd: string) => SpawnResult;

export interface ExpoExportInput {
  readonly cwd: string;
  readonly outDir: string;
  /** Defaults to the running bun executable (`bun x` == `bunx`). */
  readonly bunPath?: string;
  readonly spawn?: Spawn;
}

export const defaultSpawn: Spawn = (command, cwd) => {
  const result = Bun.spawnSync([...command], { cwd, stdout: "inherit", stderr: "inherit" });
  return { exitCode: result.exitCode ?? 1 };
};

export type CaptureResult = { readonly exitCode: number; readonly stdout: string };
export type Capture = (command: readonly string[], cwd: string) => CaptureResult;

export const defaultCapture: Capture = (command, cwd) => {
  const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "inherit" });
  return { exitCode: result.exitCode ?? 1, stdout: result.stdout.toString() };
};

export interface ExpoConfigInput {
  readonly cwd: string;
  readonly bunPath?: string;
  readonly capture?: Capture;
}

/**
 * The public app config (`expo config --type public --json`). An update must carry it in `extra.expoClient`:
 * modules read `Constants.expoConfig` (version, scheme, ...), and it is empty without it when an update runs.
 */
export function readExpoConfig(input: ExpoConfigInput): Record<string, unknown> {
  const capture = input.capture ?? defaultCapture;
  const bun = input.bunPath ?? process.execPath;
  const { exitCode, stdout } = capture([bun, "x", "expo", "config", "--type", "public", "--json"], input.cwd);
  if (exitCode !== 0) {
    throw new Error(`expo config failed with exit code ${exitCode}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("expo config did not print valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("expo config did not print a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function runExpoExport(input: ExpoExportInput): void {
  const spawn = input.spawn ?? defaultSpawn;
  const bun = input.bunPath ?? process.execPath;
  const { exitCode } = spawn(
    [bun, "x", "expo", "export", "--platform", "android", "--output-dir", input.outDir],
    input.cwd,
  );
  if (exitCode !== 0) {
    throw new Error(`expo export failed with exit code ${exitCode}.`);
  }
}
