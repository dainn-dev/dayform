import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_SSH_HOSTS_STATE, addHost, parseSshHostsText, removeHost, setFingerprint, updateHost,
  type SshHost, type SshHostFailure, type SshHostForm,
} from "./ssh-hosts";
import { createJsonStore, type ActionResult } from "./json-store";

export const SSH_HOSTS_KEY = "dayform.ssh.v1";
export const SSH_HOSTS_CORRUPT_PREFIX = "dayform.ssh.corrupt.";

export type SshHostsContextValue = {
  items: readonly SshHost[];
  ready: boolean;
  saveError: boolean;
  locked: boolean;
  add: (form: SshHostForm) => Promise<ActionResult<SshHostFailure>>;
  update: (id: string, form: SshHostForm) => Promise<ActionResult<SshHostFailure>>;
  /** Records the fingerprint the user trusted (null forgets it, so the next connection asks again). */
  trust: (id: string, fingerprint: string | null) => Promise<ActionResult<SshHostFailure>>;
  remove: (id: string) => Promise<ActionResult<SshHostFailure>>;
};

const refused = async (): Promise<ActionResult<SshHostFailure>> => ({ ok: false, reason: "locked" });

/** Used outside a provider (error fallback, tests): no servers and actions that refuse. */
const FALLBACK: SshHostsContextValue = {
  items: DEFAULT_SSH_HOSTS_STATE.items, ready: true, saveError: false, locked: true, add: refused, update: refused, trust: refused, remove: refused,
};

const SshHostsContext = createContext<SshHostsContextValue>(FALLBACK);

export function SshHostsProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createJsonStore(AsyncStorage, {
    key: SSH_HOSTS_KEY, corruptPrefix: SSH_HOSTS_CORRUPT_PREFIX, empty: DEFAULT_SSH_HOSTS_STATE, parse: parseSshHostsText,
  }));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<SshHostsContextValue>(() => ({
    items: snapshot.state.items, ready: snapshot.ready, saveError: snapshot.saveError, locked: snapshot.locked,
    add: form => store.apply(state => addHost(state, form)),
    update: (id, form) => store.apply(state => updateHost(state, id, form)),
    trust: (id, fingerprint) => store.apply(state => setFingerprint(state, id, fingerprint)),
    remove: id => store.apply(state => removeHost(state, id)),
  }), [snapshot, store]);
  return <SshHostsContext.Provider value={value}>{children}</SshHostsContext.Provider>;
}

/** Never throws: without a provider it returns an empty list and actions that refuse. */
export function useSshHosts(): SshHostsContextValue {
  return useContext(SshHostsContext);
}
