import type { OtaState } from "./ota";
import { otaStatusLine } from "./ota";
import type { UpdateStoreState } from "./update-store";
import { fillPlaceholders } from "./text-template";

type Translate = (text: string) => string;

type ApkSide = Pick<UpdateStoreState, "status" | "release" | "errorReason">;
type OtaSide = Pick<OtaState, "status" | "errorKind">;

/**
 * What the single "Updates" status line says. Two channels feed it: a new APK (GitHub Release, installed by the
 * user) and new app content (over-the-air, applied the next time the app starts). The user sees one answer.
 * Priority: working > a new APK > content ready > an error > up to date.
 */
export type UpdateSummaryKind = "checking" | "apk-available" | "content-ready" | "error" | "up-to-date" | "none";

export function summarizeUpdates(apk: ApkSide, ota: OtaSide): UpdateSummaryKind {
  if (apk.status === "checking" || ota.status === "checking" || ota.status === "downloading") return "checking";
  if (apk.status === "available" && apk.release) return "apk-available";
  if (ota.status === "ready") return "content-ready";
  if (apk.status === "error" || ota.status === "error") return "error";
  // A channel that was not asked this session (idle) or does not exist in this build (unsupported) stays neutral.
  const known = apk.status === "up-to-date" || ota.status === "upToDate";
  return known ? "up-to-date" : "none";
}

/** The already translated status line, or null when there is nothing to say. */
export function updateSummaryLine(apk: ApkSide, ota: OtaSide, t: Translate): string | null {
  switch (summarizeUpdates(apk, ota)) {
    case "checking": return t("Checking...");
    case "apk-available": return fillPlaceholders(t("Version {version} is available"), { version: apk.release?.version ?? "" });
    case "content-ready": return otaStatusLine({ status: "ready", errorKind: null }, t);
    case "error": return apk.status === "error"
      ? t(apk.errorReason === "rate-limited" ? "Too many requests. Try again later." : "Could not check for updates. Check your connection.")
      : otaStatusLine(ota, t);
    case "up-to-date": return t("You have the latest version");
    default: return null;
  }
}
