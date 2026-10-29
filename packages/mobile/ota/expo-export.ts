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
