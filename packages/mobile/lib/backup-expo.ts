import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import type { Task } from "./planner";
import { MAX_BACKUP_BYTES, backupFileName, serializeBackup } from "./backup";

/**
 * Expo adapter for backup export/import (not unit tested; the pure logic is in ./backup).
 * Uses the current object-based `expo-file-system` API (File / Paths), not `expo-file-system/legacy`.
 */

const JSON_MIME_TYPE = "application/json";
const SHARE_DIALOG_TITLE = "Dayform backup";
const BACKUP_FILE_PATTERN = /^dayform-backup-.*\.json$/;

export type ExportResult =
  | { ok: true }
  | { ok: false; reason: "sharing-unavailable" | "share-failed" | "write-failed" | "unsupported-platform" };
export type PickResult =
  | { ok: true; text: string }
  | { ok: false; reason: "cancelled" | "read-failed" | "too-large" | "unsupported-platform" };

/**
 * Best-effort removal of one file. A failure is deliberately ignored: this only removes plaintext
 * leftovers from the cache, which the OS also evicts, and must never block the user's action.
 */
function removeQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup, see above.
  }
}

/** Deletes backups left in the cache by earlier exports (called before writing a new one). */
function deleteStaleBackups(): void {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && BACKUP_FILE_PATTERN.test(entry.name)) removeQuietly(entry);
    }
  } catch {
    // Best-effort cleanup: an unreadable cache directory must not stop the export.
  }
}

function writeBackupFile(tasks: readonly Task[]): string | null {
  try {
    deleteStaleBackups();
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

/**
 * Writes the backup JSON to the cache directory, then opens the system share sheet. The file is kept
 * after sharing (the receiving app may read it lazily) and removed by the next export.
 * `shareAsync` resolves whether or not the user picked a target and rejects only on a real failure,
 * so a dismissed sheet is a success here.
 */
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
    return { ok: false, reason: "share-failed" };
  }
}

/** Reads a picked copy as text, refusing anything over MAX_BACKUP_BYTES before it is loaded. */
async function readAsset(asset: DocumentPicker.DocumentPickerAsset): Promise<PickResult> {
  const file = new File(asset.uri);
  try {
    const size = asset.size ?? file.size;
    if (size != null && size > MAX_BACKUP_BYTES) return { ok: false, reason: "too-large" };
    return { ok: true, text: await file.text() };
  } catch {
    return { ok: false, reason: "read-failed" };
  } finally {
    removeQuietly(file);
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
  return readAsset(asset);
}
