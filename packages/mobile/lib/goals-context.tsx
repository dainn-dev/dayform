import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Category } from "./planner";
import { DEFAULT_GOALS_STATE, parseGoalsText, removeGoal, setGoal, type Goal, type GoalFailure } from "./goals";
import { createJsonStore, type ActionResult } from "./json-store";

export const GOALS_KEY = "dayform.goals.v1";
export const GOALS_CORRUPT_PREFIX = "dayform.goals.corrupt.";

export type GoalsContextValue = {
  items: readonly Goal[];
  ready: boolean;
  saveError: boolean;
  locked: boolean;
  /** Sets the weekly target of a category (a new goal, or the new target of its existing one). */
  set: (category: Category, minutesPerWeek: number) => Promise<ActionResult<GoalFailure>>;
  remove: (id: string) => Promise<ActionResult<GoalFailure>>;
};

const refused = async (): Promise<ActionResult<GoalFailure>> => ({ ok: false, reason: "locked" });

/** Used outside a provider (error fallback, tests): no goals and actions that refuse. */
const FALLBACK: GoalsContextValue = { items: DEFAULT_GOALS_STATE.items, ready: true, saveError: false, locked: true, set: refused, remove: refused };

const GoalsContext = createContext<GoalsContextValue>(FALLBACK);

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createJsonStore(AsyncStorage, { key: GOALS_KEY, corruptPrefix: GOALS_CORRUPT_PREFIX, empty: DEFAULT_GOALS_STATE, parse: parseGoalsText }));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<GoalsContextValue>(() => ({
    items: snapshot.state.items, ready: snapshot.ready, saveError: snapshot.saveError, locked: snapshot.locked,
    set: (category, minutes) => store.apply(state => setGoal(state, category, minutes)),
    remove: id => store.apply(state => removeGoal(state, id)),
  }), [snapshot, store]);
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

/** Never throws: without a provider it returns no goals and actions that refuse. */
export function useGoals(): GoalsContextValue {
  return useContext(GoalsContext);
}
