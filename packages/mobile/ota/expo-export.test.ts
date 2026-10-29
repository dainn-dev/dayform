import { describe, expect, test } from "bun:test";
import { defaultSpawn, runExpoExport, type Spawn } from "./expo-export";

describe("runExpoExport", () => {
  test("runs `bun x expo export` for android into the given directory", () => {
    const calls: { command: readonly string[]; cwd: string }[] = [];
    const spawn: Spawn = (command, cwd) => {
      calls.push({ command, cwd });
      return { exitCode: 0 };
    };
    runExpoExport({ cwd: "/app", outDir: "/tmp/out", bunPath: "/bin/bun", spawn });
    expect(calls).toEqual([
      {
        command: ["/bin/bun", "x", "expo", "export", "--platform", "android", "--output-dir", "/tmp/out"],
        cwd: "/app",
      },
    ]);
  });

  test("throws with the exit code when the export fails", () => {
    const spawn: Spawn = () => ({ exitCode: 2 });
    expect(() => runExpoExport({ cwd: "/app", outDir: "/o", bunPath: "bun", spawn })).toThrow("exit code 2");
  });

  test("defaults to the current bun executable", () => {
    const seen: string[] = [];
    runExpoExport({
      cwd: "/app",
      outDir: "/o",
      spawn: (command) => {
        seen.push(command[0]);
        return { exitCode: 0 };
      },
    });
    expect(seen).toEqual([process.execPath]);
  });
});

describe("defaultSpawn", () => {
  test("returns the exit code of a real child process", () => {
    expect(defaultSpawn([process.execPath, "-e", "process.exit(3)"], process.cwd()).exitCode).toBe(3);
    expect(defaultSpawn([process.execPath, "-e", "0"], process.cwd()).exitCode).toBe(0);
  });
});
