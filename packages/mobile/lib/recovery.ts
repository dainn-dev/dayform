import { parseBackup, type BackupFailure, type MergeMode } from "./backup";
import { runImport, type ImportMutate, type ImportOutcome } from "./backup-flow";
import type { Task } from "./planner";
import { SNAPSHOT_KEY_PREFIX, snapshotDateFromKey } from "./snapshots";
import { utf8Length } from "./text-size";
import { BACKUP_KEY_PREFIX, CORRUPT_KEY_PREFIX } from "./task-storage";

/**
 * Recovery copies: `loadTasks` keeps unparseable data (`backup`) and invalid records (`corrupt`) under
 * content-addressed keys, and `snapshots.ts` writes automatic snapshots. This module lists, previews,
 * restores and deletes them. It can never touch any other key (the main list, language, theme); the only
 * key it writes is the safety copy of the current list that a "replace" restore takes first (a backup key).
 */
export type RecoveryStorage = {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  /** Only used to write the safety copy taken before a "replace" (a backup-prefix key). */
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type RecoveryKind = "backup" | "corrupt" | "snapshot";
export type RecoveryItem = {
  key: string;
  kind: RecoveryKind;
  /** Snapshot date, or the content hash for backup / corrupt copies. */
  label: string;
  /** `YYYY-MM-DD` for snapshots with a well-formed key, otherwise `null`. */
  date: string | null;
  /** UTF-8 size of the stored text; 0 when the entry could not be read. */
  bytes: number;
  /** True when the entry could not be read at all (read error, or it vanished). */
  unreadable: boolean;
};

export type ListResult = { ok: true; items: RecoveryItem[] } | { ok: false; reason: "list-failed" };
export type PreviewFailure =
  | "not-recovery-key"
  | "read-failed"
  | "missing"
  | "unreadable-copy"
  | "newer-version"
  | "copy-too-large";
export type PreviewResult = { ok: true; tasks: Task[]; rejected: number } | { ok: false; reason: PreviewFailure };
export type DeleteOutcome = "deleted" | "refused" | "failed";
export type DeleteResult = { key: string; outcome: DeleteOutcome };
export type RecoveryRestoreOutcome = ImportOutcome | { ok: false; reason: PreviewFailure };

const PREFIXES: readonly { prefix: string; kind: RecoveryKind }[] = [
  { prefix: BACKUP_KEY_PREFIX, kind: "backup" },
  { prefix: CORRUPT_KEY_PREFIX, kind: "corrupt" },
  { prefix: SNAPSHOT_KEY_PREFIX, kind: "snapshot" },
];

export type KeyClass = { kind: RecoveryKind; label: string; date: string | null };

/** `null` for every key that is not strictly under one of the three prefixes (an empty suffix is not). */
export function classifyRecoveryKey(key: string): KeyClass | null {
  for (const { prefix, kind } of PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      return { kind, label: key.slice(prefix.length), date: kind === "snapshot" ? snapshotDateFromKey(key) : null };
    }
  }
  return null;
}

export const isRecoveryKey = (key: string): boolean => classifyRecoveryKey(key) !== null;

async function readText(storage: RecoveryStorage, key: string): Promise<{ ok: true; text: string } | { ok: false; reason: "read-failed" | "missing" }> {
  try {
    const text = await storage.getItem(key);
    return text === null ? { ok: false, reason: "missing" } : { ok: true, text };
  } catch {
    return { ok: false, reason: "read-failed" };
  }
}

/** Cheap on purpose: the text is read and measured, never parsed (a snapshot can be 500 KB). */
async function describeItem(storage: RecoveryStorage, key: string, info: KeyClass): Promise<RecoveryItem> {
  const base = { key, kind: info.kind, label: info.label, date: info.date };
  const read = await readText(storage, key);
  return read.ok ? { ...base, bytes: utf8Length(read.text), unreadable: false } : { ...base, bytes: 0, unreadable: true };
}

/** Snapshots newest first; copies without a known date keep their storage order, after the snapshots. */
function sortItems(items: readonly RecoveryItem[]): RecoveryItem[] {
  const dated = items.filter(item => item.date !== null);
  const undated = items.filter(item => item.date === null);
  dated.sort((a, b) => (b.date as string).localeCompare(a.date as string));
  return [...dated, ...undated];
}

/**
 * Never throws: a failed key listing is a typed failure, an unreadable entry is flagged `unreadable`.
 * Entries are read one after another (not all at once) and are not parsed: the task count of a copy is
 * only worked out by `previewRecoveryItem`, when the user asks for it.
 */
export async function listRecoveryItems(storage: RecoveryStorage): Promise<ListResult> {
  let keys: readonly string[];
  try {
    keys = await storage.getAllKeys();
  } catch {
    return { ok: false, reason: "list-failed" };
  }
  const found = keys.flatMap(key => {
    const info = classifyRecoveryKey(key);
    return info === null ? [] : [{ key, info }];
  });
  const items: RecoveryItem[] = [];
  for (const { key, info } of found) items.push(await describeItem(storage, key, info));
  return { ok: true, items: sortItems(items) };
}

const PARSE_FAILURES: Record<BackupFailure, PreviewFailure> = {
  "invalid-json": "unreadable-copy",
  "wrong-format": "unreadable-copy",
  "unsupported-version": "newer-version",
  "too-large": "copy-too-large",
};

/** Read-only: parses the copy (backup envelope or bare array) without changing anything. */
export async function previewRecoveryItem(storage: RecoveryStorage, key: string): Promise<PreviewResult> {
  if (!isRecoveryKey(key)) return { ok: false, reason: "not-recovery-key" };
  const read = await readText(storage, key);
  if (!read.ok) return read;
  const parsed = parseBackup(read.text);
  if (!parsed.ok) return { ok: false, reason: PARSE_FAILURES[parsed.reason] };
  return { ok: true, tasks: parsed.tasks, rejected: parsed.rejected };
}

async function removeOne(storage: RecoveryStorage, key: string): Promise<DeleteResult> {
  if (!isRecoveryKey(key)) return { key, outcome: "refused" };
  try {
    await storage.removeItem(key);
    return { key, outcome: "deleted" };
  } catch {
    return { key, outcome: "failed" };
  }
}

/** Deletes recovery copies only: any other key is `refused` and never reaches the storage. */
export async function deleteRecoveryItems(storage: RecoveryStorage, keys: readonly string[]): Promise<DeleteResult[]> {
  const results: DeleteResult[] = [];
  for (const key of new Set(keys)) results.push(await removeOne(storage, key));
  return results;
}

/**
 * Restores a copy through `planImport` + `store.mutate` (via `runImport`), so the store's limits and
 * invariants apply exactly as for a file import (including the safety copy before a replace). The main key
 * is never written here, and the copy itself is left in place.
 */
export async function restoreRecoveryItem(
  storage: RecoveryStorage,
  mutate: ImportMutate,
  key: string,
  mode: MergeMode,
  now: Date,
): Promise<RecoveryRestoreOutcome> {
  const preview = await previewRecoveryItem(storage, key);
  if (!preview.ok) return preview;
  return runImport(mutate, preview, mode, { storage, now });
}
