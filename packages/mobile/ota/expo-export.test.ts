import { describe, expect, test } from "bun:test";
import { defaultCapture, defaultSpawn, readExpoConfig, runExpoExport, type Capture, type Spawn } from "./expo-export";

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

describe("readExpoConfig", () => {
  const capture = (exitCode: number, stdout: string): Capture => () => ({ exitCode, stdout });

  test("runs `bun x expo config --type public --json` and returns the parsed object", () => {
    const calls: { command: readonly string[]; cwd: string }[] = [];
    const config = readExpoConfig({
      cwd: "/app",
      bunPath: "/bin/bun",
      capture: (command, cwd) => {
        calls.push({ command, cwd });
        return { exitCode: 0, stdout: '{"name":"Dayform","version":"1.1.0"}' };
      },
    });
    expect(config).toEqual({ name: "Dayform", version: "1.1.0" });
    expect(calls).toEqual([
      { command: ["/bin/bun", "x", "expo", "config", "--type", "public", "--json"], cwd: "/app" },
    ]);
  });

  test("defaults to the current bun executable", () => {
    const seen: string[] = [];
    readExpoConfig({
      cwd: "/app",
      capture: (command) => {
        seen.push(command[0]);
        return { exitCode: 0, stdout: "{}" };
      },
    });
    expect(seen).toEqual([process.execPath]);
  });

  test("fails on a non-zero exit code, invalid JSON, and JSON that is not an object", () => {
    expect(() => readExpoConfig({ cwd: "/a", capture: capture(3, "") })).toThrow("exit code 3");
    expect(() => readExpoConfig({ cwd: "/a", capture: capture(0, "not json") })).toThrow("valid JSON");
    expect(() => readExpoConfig({ cwd: "/a", capture: capture(0, "[1]") })).toThrow("JSON object");
    expect(() => readExpoConfig({ cwd: "/a", capture: capture(0, "null") })).toThrow("JSON object");
  });
});

describe("defaultCapture", () => {
  test("captures the output and exit code of a real child process", () => {
    const result = defaultCapture([process.execPath, "-e", "console.log('hi')"], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hi");
    expect(defaultCapture([process.execPath, "-e", "process.exit(4)"], process.cwd()).exitCode).toBe(4);
  });
});

describe("defaultSpawn", () => {
  test("returns the exit code of a real child process", () => {
    expect(defaultSpawn([process.execPath, "-e", "process.exit(3)"], process.cwd()).exitCode).toBe(3);
    expect(defaultSpawn([process.execPath, "-e", "0"], process.cwd()).exitCode).toBe(0);
  });
});
