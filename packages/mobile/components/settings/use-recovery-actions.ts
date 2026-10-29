import { useCallback, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MergeMode } from "../../lib/backup";
import type { ParsedTasks } from "../../lib/backup-flow";
import {
  deleteRecoveryItems,
  listRecoveryItems,
  previewRecoveryItem,
  restoreRecoveryItem,
  type PreviewFailure,
  type RecoveryItem,
} from "../../lib/recovery";
import {
  deleteNotice,
  restoreErrorMessage,
  restoredNotice,
  type RecoveryNotice,
} from "../../lib/recovery-messages";
import { useTasks } from "../../lib/tasks-context";

export type PendingAction =
  | { kind: "replace"; key: string }
  | { kind: "delete"; key: string }
  | { kind: "delete-all" };
export type PreviewState = { key: string; result: { ok: true; parsed: ParsedTasks } | { ok: false; reason: PreviewFailure } };

export type RecoveryActions = {
  /** The card starts collapsed: nothing is listed (or read) until the user expands it. */
  expanded: boolean;
  /** `null` until the first listing after expanding finished. */
  items: RecoveryItem[] | null;
  listFailed: boolean;
  notice: RecoveryNotice | null;
  busy: boolean;
  /** Restores write through the store, which refuses them while loading or read-only. */
  canRestore: boolean;
  pending: PendingAction | null;
  preview: PreviewState | null;
  toggleExpanded: () => Promise<void>;
  refresh: () => Promise<void>;
  togglePreview: (key: string) => Promise<void>;
  restore: (key: string, mode: MergeMode) => Promise<void>;
  ask: (action: PendingAction) => Promise<void>;
  cancel: () => void;
  confirmDelete: () => Promise<void>;
};

const failure = (message: string): RecoveryNotice => ({ tone: "error", parts: [{ key: message }] });

/** State machine behind RecoverySection: expand + list, preview, restore (merge / confirmed replace), delete. */
export function useRecoveryActions(): RecoveryActions {
  const { loading, writesBlocked, mutate } = useTasks();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<RecoveryItem[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [notice, setNotice] = useState<RecoveryNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const refresh = useCallback(async () => {
    const result = await listRecoveryItems(AsyncStorage);
    setListFailed(!result.ok);
    setItems(result.ok ? result.items : []);
  }, []);

  const toggleExpanded = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      setPending(null);
      setPreview(null);
      return;
    }
    setExpanded(true);
    await refresh();
  }, [expanded, refresh]);

  const loadPreview = useCallback(async (key: string) => {
    const result = await previewRecoveryItem(AsyncStorage, key);
    setPreview({ key, result: result.ok ? { ok: true, parsed: result } : result });
  }, []);

  const togglePreview = useCallback(async (key: string) => {
    if (preview?.key === key) setPreview(null);
    else await loadPreview(key);
  }, [preview, loadPreview]);

  const restore = useCallback(async (key: string, mode: MergeMode) => {
    setBusy(true);
    setPending(null);
    try {
      const outcome = await restoreRecoveryItem(AsyncStorage, mutate, key, mode, new Date());
      setNotice(outcome.ok ? restoredNotice(outcome.summary) : failure(restoreErrorMessage(outcome.reason)));
      // A replace saves the current list as a new recovery copy, so the list is out of date now.
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [mutate, refresh]);

  const ask = useCallback(async (action: PendingAction) => {
    setNotice(null);
    if (action.kind === "replace") await loadPreview(action.key);
    setPending(action);
  }, [loadPreview]);

  const confirmDelete = useCallback(async () => {
    if (pending === null || pending.kind === "replace") return;
    const keys = pending.kind === "delete" ? [pending.key] : (items ?? []).map(item => item.key);
    setBusy(true);
    setPending(null);
    try {
      setNotice(deleteNotice(await deleteRecoveryItems(AsyncStorage, keys)));
      setPreview(current => (current !== null && keys.includes(current.key) ? null : current));
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [pending, items, refresh]);

  const cancel = useCallback(() => setPending(null), []);

  return {
    expanded, items, listFailed, notice, busy, canRestore: !loading && !writesBlocked,
    pending, preview, toggleExpanded, refresh, togglePreview, restore, ask, cancel, confirmDelete,
  };
}
