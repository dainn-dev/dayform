import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import type { Task } from "./planner";
import { backupFileName, serializeBackup } from "./backup";

/**
 * Expo adapter for backup export/import (not unit tested; the pure logic is in ./backup).
 * Uses the current object-based `expo-file-system` API (File / Paths), not `expo-file-system/legacy`.
 */

const JSON_MIME_TYPE = "application/json";
const SHARE_DIALOG_TITLE = "Dayform backup";

export type ExportResult =
  | { ok: true }
  | { ok: false; reason: "sharing-unavailable" | "write-failed" | "unsupported-platform" };
export type PickResult =
  | { ok: true; text: string }
  | { ok: false; reason: "cancelled" | "read-failed" | "unsupported-platform" };

function writeBackupFile(tasks: readonly Task[]): string | null {
  try {
    const file = new File(Paths.cache, backupFileName(new Date()));
    file.create({ overwrite: true });
    file.write(serializeBackup(tasks, new Date()));
    return file.uri;
  } catch {
    return null;
  }
}

async function canShare(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Writes the backup JSON to the cache directory, then opens the system share sheet. */
export async function exportBackupFile(tasks: readonly Task[]): Promise<ExportResult> {
  if (Platform.OS === "web") return { ok: false, reason: "unsupported-platform" };
  const uri = writeBackupFile(tasks);
  if (uri === null) return { ok: false, reason: "write-failed" };
  if (!(await canShare())) return { ok: false, reason: "sharing-unavailable" };
  try {
    await Sharing.shareAsync(uri, {
      mimeType: JSON_MIME_TYPE,
      UTI: "public.json",
      dialogTitle: SHARE_DIALOG_TITLE,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "sharing-unavailable" };
  }
}

async function readAsset(uri: string): Promise<PickResult> {
  try {
    return { ok: true, text: await new File(uri).text() };
  } catch {
    return { ok: false, reason: "read-failed" };
  }
}

/** Opens the document picker and returns the chosen file's UTF-8 text. */
export async function pickBackupText(): Promise<PickResult> {
  if (Platform.OS === "web") return { ok: false, reason: "unsupported-platform" };
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: [JSON_MIME_TYPE, "*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch {
    return { ok: false, reason: "read-failed" };
  }
  if (picked.canceled) return { ok: false, reason: "cancelled" };
  const asset = picked.assets[0];
  if (!asset) return { ok: false, reason: "cancelled" };
  return readAsset(asset.uri);
}
