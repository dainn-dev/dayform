import { describe, expect, test } from "bun:test";
import type { OtaState } from "./ota";
import type { Release } from "./update-check";
import { summarizeUpdates, updateSummaryLine } from "./update-summary";
import type { UpdateStoreState } from "./update-store";

const release: Release = { version: "1.2.0", name: "Dayform 1.2.0", notes: "", pageUrl: "https://example.test", apkUrl: null, apkBytes: null };

const apk = (status: UpdateStoreState["status"], extra: Partial<UpdateStoreState> = {}) =>
  ({ status, release: null, errorReason: null, ...extra }) satisfies Pick<UpdateStoreState, "status" | "release" | "errorReason">;
const ota = (status: OtaState["status"], errorKind: OtaState["errorKind"] = null) => ({ status, errorKind });

const t = (text: string) => `«${text}»`;

describe("summarizeUpdates", () => {
  test("is checking while either channel is working", () => {
    expect(summarizeUpdates(apk("checking"), ota("idle"))).toBe("checking");
    expect(summarizeUpdates(apk("idle"), ota("checking"))).toBe("checking");
    expect(summarizeUpdates(apk("idle"), ota("downloading"))).toBe("checking");
    expect(summarizeUpdates(apk("available", { release }), ota("checking"))).toBe("checking");
  });

  test("a new APK outranks ready content, errors and up to date", () => {
    expect(summarizeUpdates(apk("available", { release }), ota("ready"))).toBe("apk-available");
    expect(summarizeUpdates(apk("available", { release }), ota("error", "check"))).toBe("apk-available");
    expect(summarizeUpdates(apk("available", { release }), ota("upToDate"))).toBe("apk-available");
  });

  test("an available APK without release details is not announced", () => {
    expect(summarizeUpdates(apk("available"), ota("idle"))).toBe("none");
  });

  test("ready content comes before errors and up to date", () => {
    expect(summarizeUpdates(apk("up-to-date"), ota("ready"))).toBe("content-ready");
    expect(summarizeUpdates(apk("error", { errorReason: "network" }), ota("ready"))).toBe("content-ready");
  });

  test("an error on either channel is an error", () => {
    expect(summarizeUpdates(apk("error", { errorReason: "network" }), ota("upToDate"))).toBe("error");
    expect(summarizeUpdates(apk("up-to-date"), ota("error", "download"))).toBe("error");
  });

  test("is up to date when one channel says so and the other is idle or unsupported", () => {
    expect(summarizeUpdates(apk("up-to-date"), ota("upToDate"))).toBe("up-to-date");
    expect(summarizeUpdates(apk("up-to-date"), ota("idle"))).toBe("up-to-date");
    expect(summarizeUpdates(apk("up-to-date"), ota("unsupported"))).toBe("up-to-date");
    expect(summarizeUpdates(apk("idle"), ota("upToDate"))).toBe("up-to-date");
  });

  test("says nothing before anything was checked", () => {
    expect(summarizeUpdates(apk("idle"), ota("idle"))).toBe("none");
    expect(summarizeUpdates(apk("idle"), ota("unsupported"))).toBe("none");
  });
});

describe("updateSummaryLine", () => {
  test("checking", () => {
    expect(updateSummaryLine(apk("checking"), ota("idle"), t)).toBe("«Checking...»");
  });

  test("a new APK names its version", () => {
    expect(updateSummaryLine(apk("available", { release }), ota("idle"), t)).toBe("«Version {version} is available»".replace("{version}", "1.2.0"));
  });

  test("ready content says it applies the next time the app opens", () => {
    expect(updateSummaryLine(apk("up-to-date"), ota("ready"), t)).toBe("«Ready: applies the next time you open the app»");
  });

  test("an APK check error uses the APK wording, with a special one for rate limits", () => {
    expect(updateSummaryLine(apk("error", { errorReason: "network" }), ota("upToDate"), t)).toBe("«Could not check for updates. Check your connection.»");
    expect(updateSummaryLine(apk("error", { errorReason: "rate-limited" }), ota("idle"), t)).toBe("«Too many requests. Try again later.»");
  });

  test("a content error uses the content wording", () => {
    expect(updateSummaryLine(apk("up-to-date"), ota("error", "check"), t)).toBe("«Could not check for new content. Try again later.»");
    expect(updateSummaryLine(apk("up-to-date"), ota("error", "download"), t)).toBe("«Could not download new content. Try again later.»");
  });

  test("up to date and nothing to say", () => {
    expect(updateSummaryLine(apk("up-to-date"), ota("upToDate"), t)).toBe("«You have the latest version»");
    expect(updateSummaryLine(apk("idle"), ota("idle"), t)).toBeNull();
  });
});
