import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Task } from "./planner";
import { LADDERS, rankOf, type Ladder, type LadderStyle, type Rank } from "./realm";
import { useSettings } from "./settings-context";
import { createXpStore, type XpActionResult } from "./xp-store";
import { EMPTY_XP, restLeft, todayXp, type SettleEvent, type XpState } from "./xp";

/** What the last finished task gave: `id` changes with every gain, so a screen can react to each one. */
export type XpGain = { id: number; gained: number; rankUp: boolean };

export type XpContextValue = {
  state: XpState;
  ready: boolean;
  saveError: boolean;
  /** True when the stored value could not be read safely, so nothing changes this session. */
  locked: boolean;
  /** The settings switch: off means no experience is earned, lost or judged. */
  enabled: boolean;
  /** The chosen style and its ladder; the experience is the same in both. */
  style: LadderStyle;
  ladder: Ladder;
  rank: Rank;
  todayXp: number;
  restLeft: { week: number; month: number };
  lastGain: XpGain | null;
  /** What the last judging of the days found (rest days, penalties); empty when nothing happened. */
  lastEvents: SettleEvent[];
  claim: (tasks: readonly Task[], now?: Date) => Promise<XpActionResult>;
  revoke: (ids: readonly string[]) => Promise<XpActionResult>;
  settle: (now?: Date) => Promise<XpActionResult>;
  importState: (incoming: XpState, mode: "merge" | "replace") => Promise<XpActionResult>;
  reset: () => Promise<XpActionResult>;
};

const nothing = async (): Promise<XpActionResult> => ({ ok: true, gained: 0, rankUp: false, events: [] });

/** Used outside a provider (error fallback, tests): an empty cultivator and actions that do nothing. */
const FALLBACK: XpContextValue = {
  state: EMPTY_XP, ready: true, saveError: false, locked: false, enabled: false, style: "cultivation", ladder: LADDERS.cultivation, rank: rankOf(0), todayXp: 0,
  restLeft: { week: 0, month: 0 }, lastGain: null, lastEvents: [],
  claim: nothing, revoke: nothing, settle: nothing, importState: nothing, reset: nothing,
};

const XpContext = createContext<XpContextValue>(FALLBACK);

/** Mount below SettingsProvider and above TasksProvider (which reports finished tasks to it). */
export function XpProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createXpStore(AsyncStorage));
  const { settings } = useSettings();
  const enabled = settings.xp.enabled;
  const style = settings.xp.style;
  const ladder = LADDERS[style];
  const [lastGain, setLastGain] = useState<XpGain | null>(null);
  const [lastEvents, setLastEvents] = useState<SettleEvent[]>([]);
  const gainId = useRef(0);

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const claim = useCallback(async (tasks: readonly Task[], now: Date = new Date()) => {
    if (!enabled) return nothing();
    const result = await store.claim(tasks, now, ladder);
    if (result.ok && result.gained > 0) setLastGain({ id: ++gainId.current, gained: result.gained, rankUp: result.rankUp });
    return result;
  }, [store, enabled, ladder]);
  const revoke = useCallback((ids: readonly string[]) => (enabled ? store.revoke(ids) : nothing()), [store, enabled]);
  const settle = useCallback(async (now: Date = new Date()) => {
    if (!enabled) return nothing();
    const result = await store.settle(now, ladder);
    if (result.ok && result.events.length > 0) setLastEvents(result.events);
    return result;
  }, [store, enabled, ladder]);

  const value = useMemo<XpContextValue>(() => {
    const now = new Date();
    return {
      state: snapshot.state, ready: snapshot.ready, saveError: snapshot.saveError, locked: snapshot.locked, enabled, style, ladder,
      rank: rankOf(snapshot.state.total, ladder), todayXp: todayXp(snapshot.state, now), restLeft: restLeft(snapshot.state, now),
      lastGain, lastEvents, claim, revoke, settle, importState: store.importState, reset: store.reset,
    };
  }, [snapshot, enabled, style, ladder, lastGain, lastEvents, claim, revoke, settle, store]);
  return <XpContext.Provider value={value}>{value && children}</XpContext.Provider>;
}

/** Never throws: without a provider it returns an empty cultivator and no-op actions. */
export function useXp(): XpContextValue {
  return useContext(XpContext);
}
