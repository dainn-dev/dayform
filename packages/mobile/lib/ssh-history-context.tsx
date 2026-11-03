import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJsonStore, type ActionResult } from "./json-store";
import {
  DEFAULT_SSH_HISTORY_STATE, addHistoryEntry, clearHistory, parseSshHistoryText, removeHistoryEntry,
  type NewEntry, type SshHistoryEntry, type SshHistoryFailure,
} from "./ssh-history";

export const SSH_HISTORY_KEY = "dayform.ssh.history.v1";
export const SSH_HISTORY_CORRUPT_PREFIX = "dayform.ssh.history.corrupt.";

export type SshHistoryContextValue = {
  items: readonly SshHistoryEntry[];
  ready: boolean;
  locked: boolean;
  record: (entry: NewEntry) => Promise<ActionResult<SshHistoryFailure>>;
  remove: (id: string) => Promise<ActionResult<SshHistoryFailure>>;
  /** Clears one server's commands, or all of them. */
  clear: (hostId?: string) => Promise<ActionResult<SshHistoryFailure>>;
};

const refused = async (): Promise<ActionResult<SshHistoryFailure>> => ({ ok: false, reason: "locked" });

/** Used outside a provider (error fallback, tests): an empty history and actions that refuse. */
const FALLBACK: SshHistoryContextValue = { items: DEFAULT_SSH_HISTORY_STATE.items, ready: true, locked: true, record: refused, remove: refused, clear: refused };

const SshHistoryContext = createContext<SshHistoryContextValue>(FALLBACK);

export function SshHistoryProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createJsonStore(AsyncStorage, {
    key: SSH_HISTORY_KEY, corruptPrefix: SSH_HISTORY_CORRUPT_PREFIX, empty: DEFAULT_SSH_HISTORY_STATE, parse: parseSshHistoryText,
  }));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<SshHistoryContextValue>(() => ({
    items: snapshot.state.items, ready: snapshot.ready, locked: snapshot.locked,
    record: entry => store.apply(state => addHistoryEntry(state, entry)),
    remove: id => store.apply(state => removeHistoryEntry(state, id)),
    clear: hostId => store.apply(state => clearHistory(state, hostId)),
  }), [snapshot, store]);
  return <SshHistoryContext.Provider value={value}>{children}</SshHistoryContext.Provider>;
}

/** Never throws: without a provider it returns an empty history and actions that refuse. */
export function useSshHistory(): SshHistoryContextValue {
  return useContext(SshHistoryContext);
}
