import { describe, expect, test } from "bun:test";
import { ArgsError, USAGE, parseArgs } from "./args";

const REQUIRED = ["--base-url", "https://ota.example.pages.dev/", "--runtime-version", "1.0.0", "--out", "../ota-site"];

describe("parseArgs", () => {
  test("parses the required flags and applies defaults", () => {
    expect(parseArgs(REQUIRED)).toEqual({
      baseUrl: "https://ota.example.pages.dev",
      runtimeVersion: "1.0.0",
      outDir: "../ota-site",
      exportDir: null,
      keyId: "main",
      certificatePath: null,
    });
  });

  test("parses the optional flags", () => {
    const parsed = parseArgs([
      ...REQUIRED,
      "--export-dir",
      "dist",
      "--key-id",
      "root",
      "--certificate",
      "certs/x.pem",
    ]);
    expect(parsed.exportDir).toBe("dist");
    expect(parsed.keyId).toBe("root");
    expect(parsed.certificatePath).toBe("certs/x.pem");
  });

  test("accepts --flag=value", () => {
    const parsed = parseArgs([
      "--base-url=https://a.example.com",
      "--runtime-version=exposdk:57.0.0",
      "--out=site",
    ]);
    expect(parsed.runtimeVersion).toBe("exposdk:57.0.0");
    expect(parsed.baseUrl).toBe("https://a.example.com");
  });

  test("trims the runtime version", () => {
    expect(parseArgs([...REQUIRED.slice(0, 2), "--runtime-version", " 2.0 ", "--out", "o"]).runtimeVersion).toBe("2.0");
  });

  test("rejects an empty or blank runtime version", () => {
    expect(() => parseArgs(["--base-url", "https://a.example.com", "--runtime-version", "", "--out", "o"])).toThrow(
      "runtime version",
    );
    expect(() => parseArgs(["--base-url", "https://a.example.com", "--runtime-version=  ", "--out", "o"])).toThrow(
      "runtime version",
    );
    expect(() => parseArgs(["--base-url", "https://a.example.com", "--runtime-version", "a\nb", "--out", "o"])).toThrow(
      "runtime version",
    );
  });

  test("rejects a non-https or malformed base URL", () => {
    expect(() => parseArgs(["--base-url", "http://a.example.com", "--runtime-version", "1", "--out", "o"])).toThrow(
      "https",
    );
    expect(() => parseArgs(["--base-url", "nope", "--runtime-version", "1", "--out", "o"])).toThrow("base URL");
  });

  test("rejects missing required flags", () => {
    expect(() => parseArgs([])).toThrow("--base-url");
    expect(() => parseArgs(["--base-url", "https://a.example.com"])).toThrow("--runtime-version");
    expect(() => parseArgs(["--base-url", "https://a.example.com", "--runtime-version", "1"])).toThrow("--out");
  });

  test("rejects unknown flags, stray values, duplicates and missing values", () => {
    expect(() => parseArgs([...REQUIRED, "--nope", "x"])).toThrow("Unknown option");
    expect(() => parseArgs([...REQUIRED, "stray"])).toThrow("Unexpected argument");
    expect(() => parseArgs([...REQUIRED, "--out", "again"])).toThrow("more than once");
    expect(() => parseArgs(["--base-url"])).toThrow("needs a value");
    expect(() => parseArgs(["--base-url", "--out", "x"])).toThrow("needs a value");
  });

  test("rejects an empty out dir, export dir, key id or certificate path", () => {
    expect(() => parseArgs([...REQUIRED.slice(0, 4), "--out="])).toThrow("--out");
    expect(() => parseArgs([...REQUIRED, "--export-dir="])).toThrow("--export-dir");
    expect(() => parseArgs([...REQUIRED, "--key-id", "café"])).toThrow("key id");
    expect(() => parseArgs([...REQUIRED, "--certificate="])).toThrow("--certificate");
  });

  test("errors are ArgsError instances and USAGE documents every flag", () => {
    expect(() => parseArgs([])).toThrow(ArgsError);
    for (const flag of ["--base-url", "--runtime-version", "--out", "--export-dir", "--key-id", "--certificate"]) {
      expect(USAGE).toContain(flag);
    }
    expect(USAGE).toContain("DAYFORM_OTA_PRIVATE_KEY");
  });
});
